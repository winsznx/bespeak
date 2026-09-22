// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RouterRegistry} from "../src/RouterRegistry.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakVaultFactory} from "../src/BespeakVaultFactory.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {AttestedSessionVerifier} from "../src/AttestedSessionVerifier.sol";
import {AssetStatus, MarketStatus, SourceTier, TriggerType} from "../src/BespeakTypes.sol";
import {MockERC20, MockRouter} from "./mocks/Mocks.sol";

/// @notice Shared fixture: a fully wired Bespeak deployment with one supported asset,
/// one approved router, a funded user vault and an authorized attestor.
abstract contract BespeakBase is Test {
    AssetRegistry internal registry;
    RouterRegistry internal routers;
    BespeakOrderManager internal manager;
    BespeakVaultFactory internal factory;
    OkxExecutionAdapter internal adapter;
    AttestedSessionVerifier internal session;

    MockERC20 internal usdc;
    MockERC20 internal nvdax;
    MockRouter internal router;

    address internal admin = address(0xA11CE);
    address internal keeper;
    address internal user = address(0xB0B);
    address internal approveTarget = address(0xDEADBEEF);

    uint256 internal attestorPk = 0xA77E5702;
    address internal attestor;

    bytes32 internal constant ASSET_NVDA = keccak256("NVDAx");
    bytes32 internal constant SOURCE_ID = keccak256("xstocks.fi/api/v2/public/assets");

    /// @dev 1 USDC (6dp) buys 0.005 NVDAx (18dp): rate is scaled so that
    /// out = in * rate / 1e18 lands in 18dp given a 6dp input.
    uint256 internal constant RATE = 5e27;

    function setUp() public virtual {
        attestor = vm.addr(attestorPk);
        keeper = makeAddr("keeper");

        usdc = new MockERC20("USDC", "USDC", 6);
        nvdax = new MockERC20("NVIDIA xStock", "NVDAx", 18);

        vm.startPrank(admin);
        registry = new AssetRegistry(admin);
        routers = new RouterRegistry(admin);
        manager = new BespeakOrderManager(admin, address(registry), address(routers));
        factory = new BespeakVaultFactory(address(manager));
        adapter = new OkxExecutionAdapter(address(manager), address(routers));
        session = new AttestedSessionVerifier(admin, SOURCE_ID, 60);

        manager.setVaultFactory(address(factory));
        manager.setAdapter(address(adapter));
        manager.setKeeper(keeper, true);
        manager.setInputToken(address(usdc), true);
        manager.setConditionSource(TriggerType.NEXT_REGULAR_SESSION, address(session));
        manager.setConditionSource(TriggerType.WHEN_AVAILABLE, address(session));
        session.setAttestor(attestor, true);

        registry.upsertAsset(
            AssetRegistry.AssetInput({
                assetId: ASSET_NVDA,
                symbol: "NVDAx",
                canonicalId: "nvda-canonical-id",
                underlying: address(nvdax),
                wrapper: address(0),
                wrapperVersion: 2,
                status: AssetStatus.SUPPORTED,
                sourcePayloadHash: keccak256("payload"),
                sourceFetchedAt: uint64(block.timestamp),
                sourceUri: "https://api.xstocks.fi/api/v2/public/assets"
            })
        );
        vm.stopPrank();

        router = new MockRouter(usdc, nvdax, RATE);
        vm.startPrank(admin);
        routers.setRouter(address(router), true);
        routers.setApproveTarget(approveTarget, true);
        vm.stopPrank();

        // The mock router pulls from the adapter via the approve target, so in this fixture
        // the approve target and the router are the same spender.
        vm.prank(admin);
        routers.setApproveTarget(address(router), true);
    }

    function _fundedVault(address who, uint256 amount) internal returns (BespeakVault vault) {
        factory.ensureVault(who);
        vault = BespeakVault(factory.vaultOf(who));
        usdc.mint(who, amount);
        vm.startPrank(who);
        usdc.approve(address(vault), amount);
        vault.deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _attest(bytes32 assetId, MarketStatus status, uint64 observedAt)
        internal
        view
        returns (bytes memory)
    {
        return _attestSignedBy(assetId, status, observedAt, attestorPk);
    }

    function _attestSignedBy(bytes32 assetId, MarketStatus status, uint64 observedAt, uint256 pk)
        internal
        view
        returns (bytes memory)
    {
        bytes32 payloadHash = keccak256("xstocks-trading-payload");
        bytes32 digest = session.hashAttestation(assetId, uint8(status), observedAt, SOURCE_ID, payloadHash);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encode(uint8(status), observedAt, payloadHash, abi.encodePacked(r, s, v));
    }

    function _req(uint256 amountIn, uint256 minOut, bytes memory evidence)
        internal
        view
        returns (BespeakOrderManager.ExecutionRequest memory)
    {
        return BespeakOrderManager.ExecutionRequest({
            router: address(router),
            approveTarget: address(router),
            amountIn: amountIn,
            minAmountOut: minOut,
            quoteTimestamp: uint64(block.timestamp),
            quoteHash: keccak256("quote"),
            routerCalldata: abi.encodeCall(MockRouter.swap, (amountIn, user)),
            conditionEvidence: evidence
        });
    }

    function _immediateOrder(uint256 amountIn, uint256 minOut) internal returns (bytes32) {
        vm.prank(user);
        return manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: address(usdc),
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.IMMEDIATE,
                amountIn: amountIn,
                minAmountOut: minOut,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 1 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );
    }

    function _sessionOrder(uint256 amountIn, uint256 minOut, SourceTier minTier)
        internal
        returns (bytes32)
    {
        vm.prank(user);
        return manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: address(usdc),
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.NEXT_REGULAR_SESSION,
                amountIn: amountIn,
                minAmountOut: minOut,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 7 days),
                minSourceTier: minTier
            })
        );
    }
}
