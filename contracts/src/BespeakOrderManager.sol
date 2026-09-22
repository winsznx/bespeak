// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {RouterRegistry} from "./RouterRegistry.sol";
import {BespeakVault} from "./BespeakVault.sol";
import {BespeakVaultFactory} from "./BespeakVaultFactory.sol";
import {OkxExecutionAdapter} from "./OkxExecutionAdapter.sol";
import {IConditionSource} from "./interfaces/IConditionSource.sol";
import {
    AssetStatus,
    ConditionObservation,
    MarketStatus,
    Order,
    OrderStatus,
    Reason,
    SourceTier,
    TriggerType
} from "./BespeakTypes.sol";

/// @title BespeakOrderManager
/// @notice Authoritative order lifecycle and the only contract permitted to move capital
/// out of a user's vault.
///
/// The split this contract exists to enforce (PRD 16): ACTIVE / FILLED / CANCELLED /
/// EXPIRED are the only states that decide whether capital may still be spent, and they
/// live here. Everything the keeper and UI call a state — waiting, held, eligible, quoted —
/// is a projection computed off-chain from `checkExecution`, and no database row can make
/// an inactive order spendable.
contract BespeakOrderManager is Ownable, ReentrancyGuard {
    // ---------------------------------------------------------------- config

    AssetRegistry public immutable assetRegistry;
    RouterRegistry public immutable routerRegistry;
    OkxExecutionAdapter public adapter;
    BespeakVaultFactory public vaultFactory;

    /// @notice Condition source per trigger type. Swapping a source is a privileged, evented
    /// action; it cannot retroactively weaken an order, because each order carries the
    /// weakest tier it is willing to accept.
    mapping(TriggerType => IConditionSource) public conditionSource;

    mapping(address keeper => bool) public isKeeper;
    mapping(address token => bool) public isSupportedInputToken;

    /// @notice Maximum age of the route quote an execution may be built from (PRD 13.1: 30s).
    uint32 public quoteFreshnessSeconds = 30;

    bool public paused;

    // ---------------------------------------------------------------- state

    mapping(bytes32 orderId => Order) private _orders;
    /// @notice Number of times an occurrence has executed. Used by the independent verifier
    /// to prove no second fill occurred (INV-02).
    mapping(bytes32 orderId => uint32) public executionCount;
    mapping(address owner => bytes32[]) private _ordersByOwner;
    bytes32[] private _allOrders;
    uint256 private _orderNonce;

    // ---------------------------------------------------------------- recurring

    struct RecurringInstruction {
        bytes32 id;
        address owner;
        address vault;
        address inputToken;
        bytes32 assetId;
        address receiver;
        uint256 amountPerOccurrence;
        uint32 maxSlippageBps;
        uint32 intervalSeconds;
        uint32 totalOccurrences;
        uint32 completedOccurrences;
        uint32 createdOccurrences;
        uint64 nextEligibleAt;
        TriggerType occurrenceTrigger;
        SourceTier minSourceTier;
        bool active;
        bool paused;
    }

    mapping(bytes32 recurringId => RecurringInstruction) private _recurring;
    mapping(address owner => bytes32[]) private _recurringByOwner;

    // ---------------------------------------------------------------- events

    event OrderCreated(
        bytes32 indexed orderId,
        address indexed owner,
        bytes32 indexed assetId,
        address vault,
        address inputToken,
        address receiver,
        TriggerType triggerType,
        uint256 amountIn,
        uint256 minAmountOut,
        uint32 maxSlippageBps,
        uint64 validAfter,
        uint64 expiresAt,
        SourceTier minSourceTier,
        bytes32 assetRegistryRevision,
        bytes32 recurringId,
        uint32 occurrenceIndex
    );

    event OrderCancelled(bytes32 indexed orderId, address indexed by, uint256 releasedAmount);
    event OrderExpired(bytes32 indexed orderId, uint256 releasedAmount);

    /// @notice The onchain half of the receipt. Everything needed to reconstruct the
    /// outcome without trusting the keeper's own account of it.
    event OrderExecuted(
        bytes32 indexed orderId,
        address indexed owner,
        bytes32 indexed assetId,
        address receiver,
        address inputToken,
        address outputToken,
        uint256 amountReserved,
        uint256 actualInputSpent,
        uint256 actualOutputReceived,
        uint256 unusedInputReleased,
        uint32 executionCountAfter
    );

    /// @notice Condition provenance for the execution above, emitted as a separate event so
    /// the tier a fill actually relied on can never be quietly omitted from the receipt.
    event ExecutionCondition(
        bytes32 indexed orderId,
        TriggerType triggerType,
        SourceTier tier,
        MarketStatus marketStatus,
        uint64 conditionObservedAt,
        bytes32 conditionSourceId,
        bytes32 conditionObservationHash,
        bytes32 quoteHash,
        uint64 quoteTimestamp,
        address router,
        address approveTarget,
        bytes32 assetRegistryRevisionAtExecution
    );

    event RecurringCreated(
        bytes32 indexed recurringId,
        address indexed owner,
        bytes32 indexed assetId,
        uint256 amountPerOccurrence,
        uint32 intervalSeconds,
        uint32 totalOccurrences,
        TriggerType occurrenceTrigger
    );
    event RecurringOccurrenceCreated(
        bytes32 indexed recurringId, bytes32 indexed orderId, uint32 occurrenceIndex, uint64 validAfter
    );
    event RecurringOccurrenceHeld(bytes32 indexed recurringId, uint32 occurrenceIndex, Reason reason);
    event RecurringPaused(bytes32 indexed recurringId, bool paused);
    event RecurringCancelled(bytes32 indexed recurringId);

    event KeeperSet(address indexed keeper, bool allowed);
    event ConditionSourceSet(TriggerType indexed triggerType, address source, SourceTier tier);
    event AdapterSet(address adapter);
    event VaultFactorySet(address factory);
    event InputTokenSet(address indexed token, bool supported);
    event QuoteFreshnessSet(uint32 seconds_);
    event PausedSet(bool paused);

    // ---------------------------------------------------------------- errors

    error NotKeeper();
    error NotOrderOwner();
    error SystemPaused();
    error UnsupportedInputToken(address token);
    error InvalidReceiver();
    error InvalidAmount();
    error InvalidExpiry();
    error UnknownOrder(bytes32 orderId);
    error UnknownRecurring(bytes32 recurringId);
    error NoVault(address owner);
    error NoConditionSource(TriggerType triggerType);
    error KeeperCannotLoosenLimits();
    error ExecutionRefused(Reason reason);
    error NotExpiredYet();
    error RecurringNotActive();

    modifier onlyKeeper() {
        if (!isKeeper[msg.sender]) revert NotKeeper();
        _;
    }

    constructor(address initialOwner, address _assetRegistry, address _routerRegistry)
        Ownable(initialOwner)
    {
        assetRegistry = AssetRegistry(_assetRegistry);
        routerRegistry = RouterRegistry(_routerRegistry);
    }

    // ---------------------------------------------------------------- admin
    // Admin may pause an asset, repoint infrastructure and manage keepers. Admin may NOT
    // withdraw user funds, redirect a receiver, alter an order, loosen a limit or execute
    // an expired order — there is no function here that does any of those (PRD 44).

    function setKeeper(address keeper, bool allowed) external onlyOwner {
        isKeeper[keeper] = allowed;
        emit KeeperSet(keeper, allowed);
    }

    function setConditionSource(TriggerType triggerType, address source) external onlyOwner {
        conditionSource[triggerType] = IConditionSource(source);
        SourceTier t = source == address(0) ? SourceTier.NONE : IConditionSource(source).tier();
        emit ConditionSourceSet(triggerType, source, t);
    }

    function setAdapter(address _adapter) external onlyOwner {
        adapter = OkxExecutionAdapter(_adapter);
        emit AdapterSet(_adapter);
    }

    function setVaultFactory(address _factory) external onlyOwner {
        vaultFactory = BespeakVaultFactory(_factory);
        emit VaultFactorySet(_factory);
    }

    function setInputToken(address token, bool supported) external onlyOwner {
        isSupportedInputToken[token] = supported;
        emit InputTokenSet(token, supported);
    }

    function setQuoteFreshness(uint32 seconds_) external onlyOwner {
        quoteFreshnessSeconds = seconds_;
        emit QuoteFreshnessSet(seconds_);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
        emit PausedSet(p);
    }

    // ---------------------------------------------------------------- creation

    struct CreateOrderParams {
        address inputToken;
        bytes32 assetId;
        address receiver;
        TriggerType triggerType;
        uint256 amountIn;
        uint256 minAmountOut;
        uint32 maxSlippageBps;
        uint32 maxReferenceDeviationBps;
        uint64 validAfter;
        uint64 expiresAt;
        SourceTier minSourceTier;
    }

    /// @notice Create a funded standing order. Reserves `amountIn` in the caller's vault
    /// immediately, so the order can never come to execute against capital that has since
    /// been withdrawn or committed elsewhere.
    function createOrder(CreateOrderParams calldata p) external nonReentrant returns (bytes32 orderId) {
        if (paused) revert SystemPaused();
        return _createOrderInternal(msg.sender, p, bytes32(0), 0);
    }

    // ---------------------------------------------------------------- cancel / expire

    /// @notice Owner cancels an active order; the full remaining reservation returns to
    /// available balance exactly once (INV-11).
    function cancelOrder(bytes32 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.id == bytes32(0)) revert UnknownOrder(orderId);
        if (o.owner != msg.sender) revert NotOrderOwner();
        if (o.status != OrderStatus.ACTIVE) revert ExecutionRefused(Reason.ORDER_NOT_ACTIVE);

        o.status = OrderStatus.CANCELLED;
        uint256 released = BespeakVault(o.vault).release(orderId);
        emit OrderCancelled(orderId, msg.sender, released);
    }

    /// @notice Permissionless: anyone may expire a past-deadline order. The capital belongs
    /// to the user either way, so there is no reason to make them wait on an operator.
    function expireOrder(bytes32 orderId) external nonReentrant {
        Order storage o = _orders[orderId];
        if (o.id == bytes32(0)) revert UnknownOrder(orderId);
        if (o.status != OrderStatus.ACTIVE) revert ExecutionRefused(Reason.ORDER_NOT_ACTIVE);
        if (block.timestamp <= o.expiresAt) revert NotExpiredYet();

        o.status = OrderStatus.EXPIRED;
        uint256 released = BespeakVault(o.vault).release(orderId);
        emit OrderExpired(orderId, released);
    }

    // ---------------------------------------------------------------- views

    function getOrder(bytes32 orderId) external view returns (Order memory) {
        Order memory o = _orders[orderId];
        if (o.id == bytes32(0)) revert UnknownOrder(orderId);
        return o;
    }

    function ordersOf(address owner) external view returns (bytes32[] memory) {
        return _ordersByOwner[owner];
    }

    function totalOrders() external view returns (uint256) {
        return _allOrders.length;
    }

    function orderAt(uint256 i) external view returns (bytes32) {
        return _allOrders[i];
    }

    // ---------------------------------------------------------------- execution

    struct ExecutionRequest {
        address router;
        address approveTarget;
        uint256 amountIn;
        uint256 minAmountOut;
        uint64 quoteTimestamp;
        bytes32 quoteHash;
        bytes routerCalldata;
        bytes conditionEvidence;
    }

    /// @dev Grouped to keep the execution frame legible; these are the values the receipt
    /// is reconstructed from.
    struct ExecutionOutcome {
        uint256 spent;
        uint256 received;
        uint256 released;
        address outputToken;
    }

    /// @notice Simulate an execution and get back the exact reason it would be refused.
    ///
    /// This exists so a known-negative case can be inspected without manufacturing a failed
    /// transaction to produce evidence (PRD 17). `execute` re-checks every one of these
    /// conditions and reverts with the matching reason, so simulation and reality cannot
    /// drift apart.
    ///
    /// @dev Uses the condition source's read-only `peek`. A source that cannot verify in a
    /// view context reports `valid == false`, which surfaces here as
    /// CONDITION_SOURCE_UNAVAILABLE — a limit of the simulation, not a market conclusion.
    function checkExecution(bytes32 orderId, ExecutionRequest calldata req)
        external
        view
        returns (Reason reason)
    {
        Order storage o = _orders[orderId];
        if (o.id == bytes32(0)) revert UnknownOrder(orderId);

        ConditionObservation memory obs;
        if (o.triggerType != TriggerType.IMMEDIATE) {
            IConditionSource src = conditionSource[o.triggerType];
            if (address(src) == address(0)) return Reason.CONDITION_SOURCE_UNAVAILABLE;
            try src.peek(o.assetId, req.conditionEvidence) returns (ConditionObservation memory p) {
                obs = p;
            } catch {
                return Reason.CONDITION_SOURCE_UNAVAILABLE;
            }
        }
        return _evaluate(o, req, obs);
    }

    /// @notice The single place that decides whether an order may spend.
    /// @dev Pure decision logic over already-gathered inputs, so `checkExecution` and
    /// `execute` provably share it rather than reimplementing the same rules twice.
    function _evaluate(Order storage o, ExecutionRequest calldata req, ConditionObservation memory obs)
        internal
        view
        returns (Reason)
    {
        if (paused) return Reason.SYSTEM_PAUSED;
        if (o.status != OrderStatus.ACTIVE) return Reason.ORDER_NOT_ACTIVE;
        if (block.timestamp > o.expiresAt) return Reason.ORDER_EXPIRED;
        if (block.timestamp < o.validAfter) return Reason.NOT_YET_VALID;

        // Asset state. An asset with no proven X Layer deployment can never reach
        // SUPPORTED, so WHEN_AVAILABLE resolves through exactly this check (INV-05).
        if (!assetRegistry.isSupported(o.assetId)) {
            return o.triggerType == TriggerType.WHEN_AVAILABLE
                ? Reason.ASSET_NOT_AVAILABLE
                : Reason.ASSET_NOT_SUPPORTED;
        }
        if (assetRegistry.inCorporateActionWindow(o.assetId)) return Reason.CORPORATE_ACTION_WINDOW;

        // Market condition. IMMEDIATE carries no session requirement but is otherwise
        // identical, which is what makes it a usable control for the conditioned path.
        if (o.triggerType == TriggerType.NEXT_REGULAR_SESSION) {
            if (obs.tier == SourceTier.NONE) return Reason.CONDITION_SOURCE_UNAVAILABLE;
            // A numerically higher tier is a weaker source. An order never silently accepts
            // one weaker than it authorized (INV-16).
            if (uint8(obs.tier) > uint8(o.minSourceTier)) return Reason.CONDITION_TIER_NOT_AUTHORIZED;
            if (!obs.valid) return Reason.CONDITION_REPORT_STALE;
            if (obs.marketStatus == MarketStatus.UNKNOWN) return Reason.MARKET_UNKNOWN;
            // Anything that is not an affirmative REGULAR reading is a refusal (INV-10).
            if (obs.marketStatus != MarketStatus.REGULAR) return Reason.MARKET_CLOSED;
        }

        // Routing trust boundary. The API told us these addresses; the registry decides
        // whether they may touch user capital (INV-06).
        if (!routerRegistry.isApprovedRouter(req.router)) return Reason.ROUTER_UNAPPROVED;
        if (!routerRegistry.isApprovedApproveTarget(req.approveTarget)) {
            return Reason.APPROVE_TARGET_UNAPPROVED;
        }
        if (block.timestamp > uint256(req.quoteTimestamp) + quoteFreshnessSeconds) {
            return Reason.QUOTE_STALE;
        }

        // Envelope. The keeper may tighten the user's limits but never loosen them.
        if (req.amountIn == 0 || req.amountIn > o.amountIn) return Reason.INSUFFICIENT_RESERVED_BALANCE;
        if (req.minAmountOut < o.minAmountOut) return Reason.MIN_OUTPUT;
        (, uint256 remaining, bool active) = BespeakVault(o.vault).reservationOf(o.id);
        if (!active || remaining < req.amountIn) return Reason.INSUFFICIENT_RESERVED_BALANCE;

        return Reason.OK;
    }

    /// @notice Execute an eligible order through the bounded adapter.
    ///
    /// Ordering matters here. The order is marked FILLED before any external call, so a
    /// reentrant second invocation finds a non-ACTIVE order and is refused (INV-02). If the
    /// router call reverts, the whole transaction reverts and the order remains ACTIVE — a
    /// failed attempt never consumes the order (PRD 45).
    function execute(bytes32 orderId, ExecutionRequest calldata req)
        external
        onlyKeeper
        nonReentrant
        returns (uint256 spent, uint256 received)
    {
        Order storage o = _orders[orderId];
        if (o.id == bytes32(0)) revert UnknownOrder(orderId);

        ConditionObservation memory obs;
        if (o.triggerType != TriggerType.IMMEDIATE) {
            IConditionSource src = conditionSource[o.triggerType];
            if (address(src) == address(0)) revert NoConditionSource(o.triggerType);
            // Authoritative path. A forged attestation reverts inside the source.
            obs = src.observe(o.assetId, req.conditionEvidence);
        }

        Reason reason = _evaluate(o, req, obs);
        if (reason != Reason.OK) revert ExecutionRefused(reason);

        ExecutionOutcome memory out;
        out.outputToken = assetRegistry.outputToken(o.assetId);

        // Effects before interactions.
        o.status = OrderStatus.FILLED;
        unchecked {
            executionCount[orderId]++;
        }

        BespeakVault vault = BespeakVault(o.vault);
        vault.spendFromReservation(orderId, o.inputToken, address(adapter), req.amountIn);

        (out.spent, out.received) = adapter.execute(
            OkxExecutionAdapter.ExecParams({
                inputToken: o.inputToken,
                outputToken: out.outputToken,
                receiver: o.receiver,
                router: req.router,
                approveTarget: req.approveTarget,
                amountIn: req.amountIn,
                minAmountOut: req.minAmountOut,
                refundTo: o.vault,
                routerCalldata: req.routerCalldata
            })
        );

        // Whatever the route did not consume was already returned to the vault by the
        // adapter; this frees the part of the reservation this attempt never drew on, so
        // the user's available balance reflects actual spend and not the authorized
        // maximum (INV-12).
        out.released = vault.release(orderId);

        emit OrderExecuted(
            orderId,
            o.owner,
            o.assetId,
            o.receiver,
            o.inputToken,
            out.outputToken,
            o.amountIn,
            out.spent,
            out.received,
            o.amountIn - out.spent,
            executionCount[orderId]
        );

        emit ExecutionCondition(
            orderId,
            o.triggerType,
            obs.tier,
            obs.marketStatus,
            obs.observedAt,
            obs.sourceId,
            obs.observationHash,
            req.quoteHash,
            req.quoteTimestamp,
            req.router,
            req.approveTarget,
            assetRegistry.revision()
        );

        _onOccurrenceTerminal(o.recurringId);
        return (out.spent, out.received);
    }

    // ---------------------------------------------------------------- recurring

    struct CreateRecurringParams {
        address inputToken;
        bytes32 assetId;
        address receiver;
        uint256 amountPerOccurrence;
        uint256 minAmountOutPerOccurrence;
        uint32 maxSlippageBps;
        uint32 intervalSeconds;
        uint32 totalOccurrences;
        uint64 firstEligibleAt;
        TriggerType occurrenceTrigger;
        SourceTier minSourceTier;
    }

    mapping(bytes32 recurringId => uint256) private _recurringMinOut;
    mapping(bytes32 recurringId => uint64) private _recurringOccurrenceTtl;

    /// @notice Create a repeating instruction. Only the FIRST occurrence is funded now.
    ///
    /// Lazy reservation is the point (PRD 15.3): a ten-week plan must not lock ten weeks of
    /// capital on day one. Occurrence N+1 is created only after occurrence N reaches a
    /// terminal state, and if the vault cannot fund it the series is held rather than
    /// cancelled, so the user can top up and resume.
    function createRecurring(CreateRecurringParams calldata p)
        external
        nonReentrant
        returns (bytes32 recurringId, bytes32 firstOrderId)
    {
        if (paused) revert SystemPaused();
        if (p.totalOccurrences == 0 || p.amountPerOccurrence == 0) revert InvalidAmount();

        address vault = vaultFactory.vaultOf(msg.sender);
        if (vault == address(0)) revert NoVault(msg.sender);

        unchecked {
            _orderNonce++;
        }
        recurringId = keccak256(abi.encode("recurring", address(this), block.chainid, msg.sender, _orderNonce));

        RecurringInstruction storage r = _recurring[recurringId];
        r.id = recurringId;
        r.owner = msg.sender;
        r.vault = vault;
        r.inputToken = p.inputToken;
        r.assetId = p.assetId;
        r.receiver = p.receiver;
        r.amountPerOccurrence = p.amountPerOccurrence;
        r.maxSlippageBps = p.maxSlippageBps;
        r.intervalSeconds = p.intervalSeconds;
        r.totalOccurrences = p.totalOccurrences;
        r.nextEligibleAt = p.firstEligibleAt;
        r.occurrenceTrigger = p.occurrenceTrigger;
        r.minSourceTier = p.minSourceTier;
        r.active = true;

        _recurringMinOut[recurringId] = p.minAmountOutPerOccurrence;
        // An occurrence stays live for one full interval plus a day of slack, so a session
        // that never opens inside the window expires and frees capital rather than pinning it.
        _recurringOccurrenceTtl[recurringId] = uint64(p.intervalSeconds) + 1 days;

        _recurringByOwner[msg.sender].push(recurringId);

        emit RecurringCreated(
            recurringId,
            msg.sender,
            p.assetId,
            p.amountPerOccurrence,
            p.intervalSeconds,
            p.totalOccurrences,
            p.occurrenceTrigger
        );

        firstOrderId = _createNextOccurrence(recurringId);
    }

    /// @notice Create the next occurrence of a recurring instruction.
    /// @dev Permissionless. It can only ever create the occurrence the schedule already
    /// authorized, so letting the keeper, the user or anyone else trigger it removes a
    /// liveness dependency without widening authority.
    function createNextOccurrence(bytes32 recurringId) external nonReentrant returns (bytes32) {
        return _createNextOccurrence(recurringId);
    }

    function _createNextOccurrence(bytes32 recurringId) internal returns (bytes32 orderId) {
        RecurringInstruction storage r = _recurring[recurringId];
        if (r.id == bytes32(0)) revert UnknownRecurring(recurringId);
        if (!r.active || r.paused) revert RecurringNotActive();
        if (r.createdOccurrences >= r.totalOccurrences) revert RecurringNotActive();

        uint32 index = r.createdOccurrences;
        uint64 validAfter = r.nextEligibleAt + uint64(index) * uint64(r.intervalSeconds);

        // Funding is checked before the order exists, so an underfunded series reports a
        // held next occurrence instead of reverting the user's whole instruction.
        uint256 avail = BespeakVault(r.vault).available(r.inputToken);
        if (avail < r.amountPerOccurrence) {
            emit RecurringOccurrenceHeld(recurringId, index, Reason.INSUFFICIENT_RESERVED_BALANCE);
            return bytes32(0);
        }

        CreateOrderParams memory params = CreateOrderParams({
            inputToken: r.inputToken,
            assetId: r.assetId,
            receiver: r.receiver,
            triggerType: r.occurrenceTrigger,
            amountIn: r.amountPerOccurrence,
            minAmountOut: _recurringMinOut[recurringId],
            maxSlippageBps: r.maxSlippageBps,
            maxReferenceDeviationBps: 0,
            validAfter: validAfter,
            expiresAt: validAfter + _recurringOccurrenceTtl[recurringId],
            minSourceTier: r.minSourceTier
        });

        orderId = _createOrderInternal(r.owner, params, recurringId, index);
        unchecked {
            r.createdOccurrences = index + 1;
        }
        emit RecurringOccurrenceCreated(recurringId, orderId, index, validAfter);
    }

    /// @dev Memory-argument twin of `_createOrder`, needed because occurrences are built
    /// in memory rather than arriving as calldata.
    function _createOrderInternal(
        address owner,
        CreateOrderParams memory p,
        bytes32 recurringId,
        uint32 occurrenceIndex
    ) internal returns (bytes32 orderId) {
        if (!isSupportedInputToken[p.inputToken]) revert UnsupportedInputToken(p.inputToken);
        if (p.amountIn == 0) revert InvalidAmount();
        if (p.receiver == address(0)) revert InvalidReceiver();
        if (p.expiresAt <= block.timestamp) revert InvalidExpiry();
        if (!assetRegistry.isKnown(p.assetId)) revert AssetRegistry.UnknownAsset(p.assetId);

        address vault = vaultFactory.vaultOf(owner);
        if (vault == address(0)) revert NoVault(owner);

        unchecked {
            _orderNonce++;
        }
        orderId = keccak256(abi.encode(address(this), block.chainid, owner, _orderNonce));

        Order storage o = _orders[orderId];
        o.id = orderId;
        o.owner = owner;
        o.vault = vault;
        o.inputToken = p.inputToken;
        o.assetId = p.assetId;
        o.receiver = p.receiver;
        o.triggerType = p.triggerType;
        o.amountIn = p.amountIn;
        o.minAmountOut = p.minAmountOut;
        o.maxSlippageBps = p.maxSlippageBps;
        o.maxReferenceDeviationBps = p.maxReferenceDeviationBps;
        o.createdAt = uint64(block.timestamp);
        o.validAfter = p.validAfter;
        o.expiresAt = p.expiresAt;
        o.minSourceTier = p.minSourceTier;
        o.assetRegistryRevision = assetRegistry.revision();
        o.recurringId = recurringId;
        o.occurrenceIndex = occurrenceIndex;
        o.status = OrderStatus.ACTIVE;

        _ordersByOwner[owner].push(orderId);
        _allOrders.push(orderId);

        BespeakVault(vault).reserve(orderId, p.inputToken, p.amountIn);

        emit OrderCreated(
            orderId,
            owner,
            p.assetId,
            vault,
            p.inputToken,
            p.receiver,
            p.triggerType,
            p.amountIn,
            p.minAmountOut,
            p.maxSlippageBps,
            p.validAfter,
            p.expiresAt,
            p.minSourceTier,
            o.assetRegistryRevision,
            recurringId,
            occurrenceIndex
        );
    }

    /// @dev Called when an occurrence reaches a terminal state. Completed occurrences are
    /// never mutated; the next one is a new order with its own id, reservation and receipt.
    function _onOccurrenceTerminal(bytes32 recurringId) internal {
        if (recurringId == bytes32(0)) return;
        RecurringInstruction storage r = _recurring[recurringId];
        if (r.id == bytes32(0) || !r.active || r.paused) return;

        unchecked {
            r.completedOccurrences++;
        }
        if (r.createdOccurrences >= r.totalOccurrences) {
            r.active = false;
            return;
        }
        _createNextOccurrence(recurringId);
    }

    function pauseRecurring(bytes32 recurringId, bool p) external {
        RecurringInstruction storage r = _recurring[recurringId];
        if (r.id == bytes32(0)) revert UnknownRecurring(recurringId);
        if (r.owner != msg.sender) revert NotOrderOwner();
        r.paused = p;
        emit RecurringPaused(recurringId, p);
    }

    function cancelRecurring(bytes32 recurringId) external {
        RecurringInstruction storage r = _recurring[recurringId];
        if (r.id == bytes32(0)) revert UnknownRecurring(recurringId);
        if (r.owner != msg.sender) revert NotOrderOwner();
        r.active = false;
        emit RecurringCancelled(recurringId);
    }

    function getRecurring(bytes32 recurringId) external view returns (RecurringInstruction memory) {
        RecurringInstruction memory r = _recurring[recurringId];
        if (r.id == bytes32(0)) revert UnknownRecurring(recurringId);
        return r;
    }

    function recurringOf(address owner) external view returns (bytes32[] memory) {
        return _recurringByOwner[owner];
    }
}
