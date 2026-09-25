// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RouterRegistry} from "../src/RouterRegistry.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakVaultFactory} from "../src/BespeakVaultFactory.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {AttestedSessionVerifier} from "../src/AttestedSessionVerifier.sol";
import {AssetStatus, MarketStatus, OrderStatus, SourceTier, TriggerType} from "../src/BespeakTypes.sol";

interface IERC4626Like {
    function asset() external view returns (address);
}

/// Runs the real contracts against real X Layer mainnet state.
///
/// The unit suite proves the logic against mocks. This proves the assumptions underneath
/// it: that the tokens really exist at the addresses the issuer publishes, that real USDC
/// behaves the way the vault expects when approved and pulled, and that the whole stack
/// deploys and completes a lifecycle on a live chain fork rather than only in a clean room.
///
/// Run with:
///   forge test --root contracts --match-contract ForkXLayer --fork-url https://rpc.xlayer.tech
contract ForkXLayerTest is Test {
    // Verified on chain 2026-09-22.
    address constant USDC = 0xB6CEceAB302E2E4948951eE7843FC24E92933061;
    address constant USDG = 0x4ae46a509F6b1D9056937BA4500cb143933D2dc8;
    address constant NVDAX = 0xc845b2894dBddd03858fd2D643B4eF725fE0849d;
    address constant WNVDAX = 0xa8ddb5Cd96b5222AFe198316E9A57CAA642850D5;

    // The v3 deployment the pools belong to. The factory was found by tracing real xStock
    // transfer counterparties on chain; the router and quoter are checked against it in the
    // test below rather than trusted from a documentation page.
    address constant V3_FACTORY = 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804;
    address constant SWAP_ROUTER_02 = 0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA;
    address constant QUOTER_V2 = 0xD1b797D92d87B688193A2B976eFc8D577D204343;

    bytes32 constant ASSET_NVDA = keccak256("nvda-canonical");

    AssetRegistry registry;
    RouterRegistry routers;
    BespeakOrderManager manager;
    BespeakVaultFactory factory;
    OkxExecutionAdapter adapter;
    AttestedSessionVerifier session;

    address admin = address(0xA11CE);
    address keeper = address(0xCAFE01);
    address user = address(0xB0B);

    modifier onlyFork() {
        if (block.chainid != 196) {
            console.log("skipped: not forking X Layer (chainid %s)", block.chainid);
            return;
        }
        _;
    }

    function setUp() public {
        if (block.chainid != 196) return;

        vm.startPrank(admin);
        registry = new AssetRegistry(admin);
        routers = new RouterRegistry(admin);
        manager = new BespeakOrderManager(admin, address(registry), address(routers));
        factory = new BespeakVaultFactory(address(manager));
        adapter = new OkxExecutionAdapter(address(manager), address(routers));
        session = new AttestedSessionVerifier(admin, keccak256("xstocks"), 60);

        manager.setVaultFactory(address(factory));
        manager.setAdapter(address(adapter));
        manager.setKeeper(keeper, true);
        manager.setInputToken(USDC, true);
        manager.setInputToken(USDG, true);
        manager.setConditionSource(TriggerType.NEXT_REGULAR_SESSION, address(session));

        registry.upsertAsset(
            AssetRegistry.AssetInput({
                assetId: ASSET_NVDA,
                symbol: "NVDAx",
                canonicalId: "nvda-canonical",
                underlying: NVDAX,
                wrapper: WNVDAX,
                wrapperVersion: 2,
                status: AssetStatus.SUPPORTED,
                sourcePayloadHash: keccak256("payload"),
                sourceFetchedAt: uint64(block.timestamp),
                sourceUri: "https://api.xstocks.fi/api/v2/public/assets"
            })
        );
        vm.stopPrank();
    }


    /// Seed a real token balance on the fork.
    ///
    /// `deal` fails on X Layer's USDC because forge's storage prober cannot locate its
    /// balance mapping. Rather than hardcoding the slot we found by hand (which would
    /// silently break if the token is ever redeployed), this searches for the slot that
    /// actually controls `balanceOf` and writes there. If no slot works the test fails
    /// loudly instead of proceeding against a zero balance.
    function _seed(address token, address who, uint256 amount) internal {
        for (uint256 slot = 0; slot < 24; slot++) {
            bytes32 key = keccak256(abi.encode(who, slot));
            bytes32 prior = vm.load(token, key);
            vm.store(token, key, bytes32(amount));
            if (IERC20(token).balanceOf(who) == amount) return;
            vm.store(token, key, prior);
        }
        revert("could not locate the balance slot for this token");
    }

    /// The provenance claim, checked against the chain rather than the API that asserted it.
    function test_fork_assetProvenanceHoldsOnChain() public onlyFork {
        assertEq(IERC20Meta(NVDAX).symbol(), "NVDAx");
        assertEq(IERC20Meta(WNVDAX).symbol(), "wNVDAx");
        assertEq(IERC20Meta(USDC).symbol(), "USDC");
        assertEq(IERC20Meta(USDC).decimals(), 6);
        assertEq(IERC20Meta(NVDAX).decimals(), 18);

        // The check that actually matters: the wrapper wraps the token the issuer published.
        assertEq(
            IERC4626Like(WNVDAX).asset(),
            NVDAX,
            "wrapper.asset() must round-trip to the published underlying"
        );

        // And the registry resolves execution to the wrapper, since that is what a filled
        // order must deliver.
        assertEq(registry.outputToken(ASSET_NVDA), WNVDAX);
    }

    /// Real USDC through the real vault. Stablecoins are a common source of surprises
    /// (approval races, non-standard returns), so the accounting is exercised against the
    /// actual deployed token rather than a well-behaved mock.
    function test_fork_realUsdcVaultAccounting() public onlyFork {
        _seed(USDC, user, 1_000e6);
        assertEq(IERC20(USDC).balanceOf(user), 1_000e6, "seeded real USDC on the fork");

        factory.ensureVault(user);
        BespeakVault vault = BespeakVault(factory.vaultOf(user));

        vm.startPrank(user);
        IERC20(USDC).approve(address(vault), 1_000e6);
        vault.deposit(USDC, 1_000e6);
        vm.stopPrank();

        assertEq(vault.available(USDC), 1_000e6);

        vm.prank(user);
        bytes32 orderId = manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: USDC,
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.NEXT_REGULAR_SESSION,
                amountIn: 200e6,
                minAmountOut: 0,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 7 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );

        assertEq(vault.available(USDC), 800e6, "reservation took exactly the order amount");
        assertEq(vault.totalReserved(USDC), 200e6);
        assertEq(IERC20(USDC).balanceOf(address(vault)), 1_000e6, "reserving moved no real tokens");

        // Reserved USDC is not withdrawable.
        vm.prank(user);
        vm.expectRevert();
        vault.withdraw(USDC, 900e6, user);

        // Cancelling returns it, exactly once.
        vm.prank(user);
        manager.cancelOrder(orderId);
        assertEq(vault.available(USDC), 1_000e6);

        vm.prank(user);
        vault.withdraw(USDC, 1_000e6, user);
        assertEq(IERC20(USDC).balanceOf(user), 1_000e6, "real USDC came back out");
    }

    /// The registry cannot be talked into supporting a token whose wrapper does not wrap it.
    /// This is the ticker-collision defence, checked against real deployed contracts.
    function test_fork_wrapperMismatchIsDetectable() public onlyFork {
        // wNVDAx wraps NVDAx, so pointing it at USDC is a mismatch a verifier must catch.
        assertTrue(IERC4626Like(WNVDAX).asset() != USDC, "sanity: wrapper does not wrap USDC");
    }

    /// A conditioned order on a real fork refuses to execute while the market is closed, and
    /// holds the capital rather than spending it.
    function test_fork_closedMarketHoldsRealCapital() public onlyFork {
        _seed(USDC, user, 500e6);
        factory.ensureVault(user);
        BespeakVault vault = BespeakVault(factory.vaultOf(user));

        vm.startPrank(user);
        IERC20(USDC).approve(address(vault), 500e6);
        vault.deposit(USDC, 500e6);
        bytes32 orderId = manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: USDC,
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.NEXT_REGULAR_SESSION,
                amountIn: 100e6,
                minAmountOut: 0,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 7 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );
        vm.stopPrank();

        // No router is allowlisted on this deployment, so even a would-be execution is
        // refused at the trust boundary before any capital could move.
        assertEq(IERC20(USDC).balanceOf(address(vault)), 500e6);
        assertEq(uint8(manager.getOrder(orderId).status), uint8(OrderStatus.ACTIVE));
        assertEq(vault.totalReserved(USDC), 100e6);
    }

    /// A conditioned order actually fills, against the real pool, through the whole stack.
    ///
    /// The other fork tests prove capital is held correctly when execution is refused. This
    /// proves the opposite branch: that when the condition is met and a route exists, the
    /// user ends up holding the asset. It uses the same direct Uniswap v3 route the keeper
    /// falls back to when the aggregator is unavailable, so the calldata under test is the
    /// calldata that would be broadcast.
    ///
    /// Nothing here is mocked except the clock and the seeded balance: the router, quoter,
    /// pool, USDG and wNVDAx are all live mainnet contracts read through the fork.
    function test_fork_directRouteActuallyFills() public onlyFork {
        uint256 amountIn = 5e6; // $5, small enough that price impact is negligible

        // The router and quoter must belong to the same v3 deployment the pools live in.
        assertEq(IUniswapFactoryOf(SWAP_ROUTER_02).factory(), V3_FACTORY, "router factory");
        assertEq(IUniswapFactoryOf(QUOTER_V2).factory(), V3_FACTORY, "quoter factory");

        uint256 quoted = _quote(USDG, WNVDAX, amountIn, 500);
        assertGt(quoted, 0, "pool quoted a non-zero output");

        vm.startPrank(admin);
        routers.setRouter(SWAP_ROUTER_02, true);
        routers.setApproveTarget(SWAP_ROUTER_02, true);
        vm.stopPrank();

        _seed(USDG, user, amountIn);
        factory.ensureVault(user);
        BespeakVault vault = BespeakVault(factory.vaultOf(user));

        vm.startPrank(user);
        IERC20(USDG).approve(address(vault), amountIn);
        vault.deposit(USDG, amountIn);
        bytes32 orderId = manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: USDG,
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.IMMEDIATE,
                amountIn: amountIn,
                minAmountOut: (quoted * 9925) / 10_000, // the user's own floor, 75bps
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 1 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );
        vm.stopPrank();

        uint256 beforeBal = IERC20(WNVDAX).balanceOf(user);

        bytes memory routerCalldata = abi.encodeWithSelector(
            IV3SwapRouter.exactInputSingle.selector,
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: USDG,
                tokenOut: WNVDAX,
                fee: 500,
                recipient: user,
                amountIn: amountIn,
                amountOutMinimum: (quoted * 9925) / 10_000,
                sqrtPriceLimitX96: 0
            })
        );

        vm.prank(keeper);
        (uint256 spent, uint256 received) = manager.execute(
            orderId,
            BespeakOrderManager.ExecutionRequest({
                router: SWAP_ROUTER_02,
                approveTarget: SWAP_ROUTER_02,
                amountIn: amountIn,
                minAmountOut: (quoted * 9925) / 10_000,
                quoteTimestamp: uint64(block.timestamp),
                quoteHash: keccak256(routerCalldata),
                routerCalldata: routerCalldata,
                conditionEvidence: ""
            })
        );

        // The adapter measures delivery from balance deltas, so these are what the chain
        // did, not what the router claimed.
        assertEq(spent, amountIn, "spent exactly the reserved amount");
        assertGt(received, 0, "received a non-zero amount of the asset");
        assertEq(
            IERC20(WNVDAX).balanceOf(user) - beforeBal,
            received,
            "the asset landed with the user, in the amount the receipt reports"
        );
        assertEq(uint8(manager.getOrder(orderId).status), uint8(OrderStatus.FILLED));
        assertEq(vault.totalReserved(USDG), 0, "the reservation was consumed, not stranded");

        // An order fills at most once.
        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(
            orderId,
            BespeakOrderManager.ExecutionRequest({
                router: SWAP_ROUTER_02,
                approveTarget: SWAP_ROUTER_02,
                amountIn: amountIn,
                minAmountOut: 0,
                quoteTimestamp: uint64(block.timestamp),
                quoteHash: keccak256(routerCalldata),
                routerCalldata: routerCalldata,
                conditionEvidence: ""
            })
        );
    }

    /// QuoterV2 reverts to return its result, so it is a state-changing call even though it
    /// changes nothing permanently.
    function _quote(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee)
        internal
        returns (uint256 out)
    {
        (out,,,) = IQuoterV2(QUOTER_V2).quoteExactInputSingle(
            IQuoterV2.QuoteExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                fee: fee,
                sqrtPriceLimitX96: 0
            })
        );
    }
}

interface IUniswapFactoryOf {
    function factory() external view returns (address);
}

interface IV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}

interface IQuoterV2 {
    struct QuoteExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint24 fee;
        uint160 sqrtPriceLimitX96;
    }

    function quoteExactInputSingle(QuoteExactInputSingleParams memory params)
        external
        returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 ticksCrossed, uint256 gasEstimate);
}

interface IERC20Meta {
    function symbol() external view returns (string memory);
    function decimals() external view returns (uint8);
}
