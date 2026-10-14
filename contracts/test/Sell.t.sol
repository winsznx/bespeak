// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakBase} from "./Base.t.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {MockERC20, MockRouter} from "./mocks/Mocks.sol";
import {MarketStatus, Order, OrderSide, OrderStatus, Reason, SourceTier, TriggerType}
    from "../src/BespeakTypes.sol";

/// @notice The sell side (v1.1).
///
/// The loop only closes if a user can leave on a condition as well as arrive on one. These
/// tests exist to prove that adding a direction did not quietly widen what a keeper may do:
/// a sell runs the same condition ladder, the same registry gate and the same postconditions
/// as a buy, and the two places direction could have been abused, choosing what gets sold,
/// and choosing what the proceeds land in, are both closed at creation.
contract SellTest is BespeakBase {
    MockRouter internal sellRouter;

    /// @dev 1 NVDAx (18dp) sells for 200 USDC (6dp): out = in * rate / 1e18.
    uint256 internal constant SELL_RATE = 200e6;

    function setUp() public override {
        super.setUp();
        sellRouter = new MockRouter(nvdax, usdc, SELL_RATE);
        vm.startPrank(admin);
        routers.setRouter(address(sellRouter), true);
        routers.setApproveTarget(address(sellRouter), true);
        vm.stopPrank();
    }

    function _vaultWithAsset(address who, uint256 amount) internal returns (BespeakVault vault) {
        factory.ensureVault(who);
        vault = BespeakVault(factory.vaultOf(who));
        nvdax.mint(who, amount);
        vm.startPrank(who);
        nvdax.approve(address(vault), amount);
        vault.deposit(address(nvdax), amount);
        vm.stopPrank();
    }

    function _sellParams(uint256 amountIn, uint256 minOut, TriggerType trigger)
        internal
        view
        returns (BespeakOrderManager.CreateOrderParams memory)
    {
        return BespeakOrderManager.CreateOrderParams({
            inputToken: address(nvdax),
            outputToken: address(usdc),
            side: OrderSide.SELL,
            assetId: ASSET_NVDA,
            receiver: user,
            triggerType: trigger,
            amountIn: amountIn,
            minAmountOut: minOut,
            maxSlippageBps: 75,
            maxReferenceDeviationBps: 100,
            validAfter: 0,
            expiresAt: uint64(block.timestamp + 7 days),
            minSourceTier: SourceTier.ATTESTED_SESSION
        });
    }

    function _sellReq(uint256 amountIn, uint256 minOut, bytes memory evidence)
        internal
        view
        returns (BespeakOrderManager.ExecutionRequest memory)
    {
        return BespeakOrderManager.ExecutionRequest({
            router: address(sellRouter),
            approveTarget: address(sellRouter),
            amountIn: amountIn,
            minAmountOut: minOut,
            quoteTimestamp: uint64(block.timestamp),
            quoteHash: keccak256("sell-quote"),
            routerCalldata: abi.encodeCall(MockRouter.swap, (amountIn, user)),
            conditionEvidence: evidence
        });
    }

    // ------------------------------------------------------------------ positive case

    /// @notice An immediate sell delivers the stablecoin to the user's own wallet.
    function test_sellDeliversStableToReceiver() public {
        _vaultWithAsset(user, 2e18);

        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 190e6, TriggerType.IMMEDIATE));

        uint256 before = usdc.balanceOf(user);
        vm.prank(keeper);
        (uint256 spent, uint256 received) = manager.execute(id, _sellReq(1e18, 190e6, ""));

        assertEq(spent, 1e18, "spent the asset");
        assertEq(received, 200e6, "received the stable");
        assertEq(usdc.balanceOf(user) - before, 200e6, "stable landed with the user");
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.FILLED));
    }

    /// @notice The order records its direction and its proceeds token, so a UI never has to
    /// infer which way a still-active order trades.
    function test_sellOrderRecordsDirection() public {
        _vaultWithAsset(user, 1e18);
        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 1, TriggerType.IMMEDIATE));

        Order memory o = manager.getOrder(id);
        assertEq(uint8(o.side), uint8(OrderSide.SELL));
        assertEq(o.inputToken, address(nvdax));
        assertEq(o.outputToken, address(usdc));
    }

    // ------------------------------------------------------------------ the two closures

    /// @notice A sell may only sell the asset the registry holds for that assetId. Without
    /// this, an order could name a real asset and hand the adapter an impostor token.
    function test_sellCannotSellSomethingElse() public {
        MockERC20 impostor = new MockERC20("Not NVDAx", "NVDAx", 18);
        factory.ensureVault(user);
        BespeakVault vault = BespeakVault(factory.vaultOf(user));
        impostor.mint(user, 1e18);
        vm.startPrank(user);
        impostor.approve(address(vault), 1e18);
        vault.deposit(address(impostor), 1e18);
        vm.stopPrank();

        BespeakOrderManager.CreateOrderParams memory p =
            _sellParams(1e18, 1, TriggerType.IMMEDIATE);
        p.inputToken = address(impostor);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.SellInputNotRegisteredAsset.selector,
                address(impostor),
                address(nvdax)
            )
        );
        manager.createOrder(p);
    }

    /// @notice Proceeds may only land in an allowlisted stablecoin. A sell that could name
    /// any output token would be an arbitrary swap wearing an order's clothes.
    function test_sellCannotChooseUnapprovedProceedsToken() public {
        MockERC20 random = new MockERC20("Random", "RND", 18);
        _vaultWithAsset(user, 1e18);

        BespeakOrderManager.CreateOrderParams memory p =
            _sellParams(1e18, 1, TriggerType.IMMEDIATE);
        p.outputToken = address(random);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.UnsupportedOutputToken.selector, address(random)
            )
        );
        manager.createOrder(p);
    }

    // ------------------------------------------------------------------ the condition

    /// @notice The refusal case. A conditioned sell is held exactly as a conditioned buy is:
    /// a closed market is a refusal with a named reason, not a best-effort execution.
    function test_conditionedSellRefusedWhenMarketClosed() public {
        _vaultWithAsset(user, 1e18);
        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 1, TriggerType.NEXT_REGULAR_SESSION));

        bytes memory closed = _attest(ASSET_NVDA, MarketStatus.CLOSED, uint64(block.timestamp));
        assertEq(
            uint8(manager.checkExecution(id, _sellReq(1e18, 1, closed))),
            uint8(Reason.MARKET_CLOSED),
            "simulation names the refusal"
        );

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.MARKET_CLOSED)
        );
        manager.execute(id, _sellReq(1e18, 1, closed));

        assertEq(
            uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE), "refusal leaves it active"
        );
    }

    /// @notice The healthy control for the refusal above: the identical order, the identical
    /// request, one field of the observation different.
    function test_conditionedSellExecutesWhenMarketOpen() public {
        _vaultWithAsset(user, 1e18);
        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 1, TriggerType.NEXT_REGULAR_SESSION));

        bytes memory open = _attest(ASSET_NVDA, MarketStatus.REGULAR, uint64(block.timestamp));
        assertEq(uint8(manager.checkExecution(id, _sellReq(1e18, 1, open))), uint8(Reason.OK));

        vm.prank(keeper);
        (, uint256 received) = manager.execute(id, _sellReq(1e18, 1, open));
        assertEq(received, 200e6);
    }

    /// @notice The user's floor binds on a sell exactly as it does on a buy.
    function test_sellHonoursMinimumProceeds() public {
        _vaultWithAsset(user, 1e18);
        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 300e6, TriggerType.IMMEDIATE));

        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(id, _sellReq(1e18, 300e6, ""));
    }

    // ------------------------------------------------------------------ no leakage into buys

    /// @notice A buy still takes its output from the registry, and a caller-supplied output
    /// token on a buy is discarded rather than honoured.
    function test_buyIgnoresCallerSuppliedOutputToken() public {
        MockERC20 random = new MockERC20("Random", "RND", 18);
        _fundedVault(user, 100e6);

        vm.prank(user);
        bytes32 id = manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: address(usdc),
                outputToken: address(random),
                side: OrderSide.BUY,
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.IMMEDIATE,
                amountIn: 100e6,
                minAmountOut: 1,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 1 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );

        assertEq(manager.getOrder(id).outputToken, address(0), "buy stores no output token");

        uint256 before = nvdax.balanceOf(user);
        vm.prank(keeper);
        manager.execute(id, _req(100e6, 1, ""));
        assertGt(nvdax.balanceOf(user), before, "buy still delivers the registered asset");
        assertEq(random.balanceOf(user), 0, "the named token was never touched");
    }

    // ------------------------------------------------------------------ accounting

    /// @notice Reserving a non-stablecoin behaves like reserving a stablecoin: the vault is
    /// already multi-token, and this is the test that keeps it that way.
    function test_sellReservationAccounting() public {
        BespeakVault vault = _vaultWithAsset(user, 3e18);
        assertEq(vault.available(address(nvdax)), 3e18);

        vm.prank(user);
        bytes32 id = manager.createOrder(_sellParams(1e18, 1, TriggerType.IMMEDIATE));
        assertEq(vault.available(address(nvdax)), 2e18, "reserved out of available");

        vm.prank(user);
        manager.cancelOrder(id);
        assertEq(vault.available(address(nvdax)), 3e18, "cancel returns it exactly once");
    }
}
