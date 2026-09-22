// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakBase} from "./Base.t.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {AssetStatus, MarketStatus, Order, OrderStatus, Reason, SourceTier, TriggerType} from "../src/BespeakTypes.sol";
import {MockRouter} from "./mocks/Mocks.sol";

/// @notice The execution engine: the happy paths (P0, P1) and the boundaries that decide
/// whether unattended spending is safe (P3-P8, P12, P14).
contract ExecutionTest is BespeakBase {
    // ------------------------------------------------------------ P0: immediate control

    /// @dev P0. IMMEDIATE runs the same routing, postcondition and receipt path as a
    /// conditioned order, with only the session requirement removed.
    function test_P0_immediateFillDeliversToReceiver() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(keeper);
        (uint256 spent, uint256 received) = manager.execute(id, _req(200e6, 0, ""));

        assertEq(spent, 200e6, "spent the offered input");
        assertEq(received, nvdax.balanceOf(user), "receiver got the output");
        assertGt(received, 0);
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.FILLED));
        assertEq(manager.executionCount(id), 1);
        assertEq(v.available(address(usdc)), 800e6, "unspent capital stays available");
        assertEq(v.totalReserved(address(usdc)), 0, "reservation fully settled");
    }

    // ------------------------------------------------------------ P1: conditioned fill

    /// @dev P1. A session order fills only when the attested observation says REGULAR.
    function test_P1_conditionedFillUnderRegularSession() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);

        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.REGULAR, uint64(block.timestamp));
        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ev));

        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.FILLED));
        assertGt(nvdax.balanceOf(user), 0);
    }

    // ------------------------------------------------------------ P2/P3: condition boundaries

    /// @dev P2. A closed market leaves the order active and the capital untouched.
    function test_P2_closedMarketDoesNotExecute() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);
        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.CLOSED, uint64(block.timestamp));

        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ev))), uint8(Reason.MARKET_CLOSED));

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.MARKET_CLOSED)
        );
        manager.execute(id, _req(200e6, 0, ev));

        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE), "order survives");
        assertEq(v.totalReserved(address(usdc)), 200e6, "capital still reserved, not spent");
        assertEq(nvdax.balanceOf(user), 0);
    }

    /// @dev Pre-market is not the regular session. Only an affirmative REGULAR qualifies.
    function test_P2_preMarketIsNotRegularSession() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);
        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.PRE_MARKET, uint64(block.timestamp));
        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ev))), uint8(Reason.MARKET_CLOSED));
    }

    /// @dev P3. INV-10: a stale observation is never eligibility, even if it says REGULAR.
    function test_P3_staleObservationDoesNotExecute() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);

        uint64 observedAt = uint64(block.timestamp);
        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.REGULAR, observedAt);
        vm.warp(block.timestamp + 61); // maxAge is 60s

        assertEq(
            uint8(manager.checkExecution(id, _req(200e6, 0, ev))), uint8(Reason.CONDITION_REPORT_STALE)
        );

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.CONDITION_REPORT_STALE)
        );
        manager.execute(id, _req(200e6, 0, ev));
        assertEq(v.totalReserved(address(usdc)), 200e6);
    }

    /// @dev An UNKNOWN market state holds rather than executing.
    function test_P3_unknownMarketHolds() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);
        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.UNKNOWN, uint64(block.timestamp));
        // A fresh observation that cannot name the session is MARKET_UNKNOWN, which is a
        // different user-facing reason from a report that arrived too late.
        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ev))), uint8(Reason.MARKET_UNKNOWN));
    }

    /// @dev An attestation from a key the verifier does not authorize is an attack, and
    /// reverts rather than degrading to a market conclusion.
    function test_forgedAttestationReverts() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.ATTESTED_SESSION);
        bytes memory forged = _attestSignedBy(ASSET_NVDA, MarketStatus.REGULAR, uint64(block.timestamp), 0xBADBAD);

        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(id, _req(200e6, 0, forged));
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE));
    }

    /// @dev INV-16. An order demanding a stronger tier than the deployed source can supply
    /// keeps waiting instead of quietly accepting the weaker one.
    function test_P13_forbiddenTierDowngradeKeepsWaiting() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _sessionOrder(200e6, 0, SourceTier.VERIFIED_DATA_STREAMS);
        bytes memory ev = _attest(ASSET_NVDA, MarketStatus.REGULAR, uint64(block.timestamp));

        assertEq(
            uint8(manager.checkExecution(id, _req(200e6, 0, ev))),
            uint8(Reason.CONDITION_TIER_NOT_AUTHORIZED)
        );

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.ExecutionRefused.selector, Reason.CONDITION_TIER_NOT_AUTHORIZED
            )
        );
        manager.execute(id, _req(200e6, 0, ev));
    }

    // ------------------------------------------------------------ P4: user limits

    /// @dev P4. An unacceptable quote holds; the keeper cannot lower the user's floor.
    function test_P4_keeperCannotLoosenMinimumOutput() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 1e18);

        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0.5e18, ""))), uint8(Reason.MIN_OUTPUT));

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.MIN_OUTPUT)
        );
        manager.execute(id, _req(200e6, 0.5e18, ""));
    }

    /// @dev The adapter enforces the floor even if everything upstream agreed, because the
    /// real output is only known after the route runs.
    function test_P4_underDeliveringRouteReverts() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 1e18);
        router.setDeliverBps(5_000); // route delivers half of what the quote implied

        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(id, _req(200e6, 1e18, ""));
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE), "failed attempt does not consume the order");
    }

    // ------------------------------------------------------------ P5: duplicate execution

    /// @dev P5 / INV-02. A second invocation of the same occurrence cannot fill again.
    function test_P5_duplicateExecutionImpossible() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ""));
        uint256 balAfterFirst = nvdax.balanceOf(user);

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.ORDER_NOT_ACTIVE)
        );
        manager.execute(id, _req(200e6, 0, ""));

        assertEq(nvdax.balanceOf(user), balAfterFirst, "no second delivery");
        assertEq(manager.executionCount(id), 1, "execution count stays at one");
    }

    // ------------------------------------------------------------ P6: corporate action

    /// @dev P6 / INV-14. The protected multiplier window holds execution, then releases it
    /// automatically with no user action.
    function test_P6_corporateActionWindowHoldsThenResumes() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        uint64 activation = uint64(block.timestamp + 1 hours);
        vm.prank(admin);
        registry.scheduleCorporateAction(ASSET_NVDA, activation, 900);

        vm.warp(activation - 100); // inside the window
        assertEq(
            uint8(manager.checkExecution(id, _req(200e6, 0, ""))), uint8(Reason.CORPORATE_ACTION_WINDOW)
        );
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.ExecutionRefused.selector, Reason.CORPORATE_ACTION_WINDOW
            )
        );
        manager.execute(id, _req(200e6, 0, ""));

        vm.warp(activation + 901); // window passed
        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ""))), uint8(Reason.OK));
        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ""));
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.FILLED));
    }

    // ------------------------------------------------------------ P7: partial input

    /// @dev P7 / INV-12. The documented Uniswap-v3 case: the route consumes part of the
    /// input and refunds the rest. Actual spend is measured, and the unused capital becomes
    /// available again rather than being reported as spent.
    function test_P7_partialInputRefundsUnusedCapital() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setConsumeBps(6_000); // route only takes 60% of the offered input

        vm.prank(keeper);
        (uint256 spent,) = manager.execute(id, _req(200e6, 0, ""));

        assertEq(spent, 120e6, "actual spend is measured, not assumed");
        assertEq(v.balance(address(usdc)), 880e6, "80 USDC came back to the vault");
        assertEq(v.available(address(usdc)), 880e6, "and is available again");
        assertEq(v.totalReserved(address(usdc)), 0);
    }

    // ------------------------------------------------------------ P8: expiry

    /// @dev P8 / INV-04. An expired order releases its reservation and can never fill.
    function test_P8_expiryReleasesReservationAndBlocksFill() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.warp(block.timestamp + 2 days);
        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ""))), uint8(Reason.ORDER_EXPIRED));

        manager.expireOrder(id); // permissionless
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.EXPIRED));
        assertEq(v.available(address(usdc)), 1_000e6, "capital released exactly once");

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.ORDER_NOT_ACTIVE)
        );
        manager.execute(id, _req(200e6, 0, ""));
    }

    // ------------------------------------------------------------ P12: cancellation

    /// @dev P12 / INV-03. A cancelled order can never execute.
    function test_P12_cancelledOrderCannotFill() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(user);
        manager.cancelOrder(id);

        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.ORDER_NOT_ACTIVE)
        );
        manager.execute(id, _req(200e6, 0, ""));
        assertEq(nvdax.balanceOf(user), 0);
    }

    function test_onlyOwnerCancels() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        vm.prank(address(0xBAD));
        vm.expectRevert(BespeakOrderManager.NotOrderOwner.selector);
        manager.cancelOrder(id);
    }

    // ------------------------------------------------------------ P14: router boundary

    /// @dev P14 / INV-06. An unapproved router cannot spend vault funds, whatever the API
    /// returned.
    function test_P14_unapprovedRouterCannotSpend() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        MockRouter rogue = new MockRouter(usdc, nvdax, RATE);
        BespeakOrderManager.ExecutionRequest memory req = _req(200e6, 0, "");
        req.router = address(rogue);

        assertEq(uint8(manager.checkExecution(id, req)), uint8(Reason.ROUTER_UNAPPROVED));
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakOrderManager.ExecutionRefused.selector, Reason.ROUTER_UNAPPROVED)
        );
        manager.execute(id, req);
        assertEq(v.balance(address(usdc)), 1_000e6, "not a single token moved");
    }

    /// @dev The approval target is checked independently of the router, because the OKX API
    /// returns them separately and either alone would be enough to drain the input.
    function test_P14_unapprovedApproveTargetCannotSpend() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        BespeakOrderManager.ExecutionRequest memory req = _req(200e6, 0, "");
        req.approveTarget = address(0xBADBAD);

        assertEq(uint8(manager.checkExecution(id, req)), uint8(Reason.APPROVE_TARGET_UNAPPROVED));
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.ExecutionRefused.selector, Reason.APPROVE_TARGET_UNAPPROVED
            )
        );
        manager.execute(id, req);
    }

    /// @dev INV-17. API calldata cannot redirect the purchased asset away from the receiver
    /// the user authorized: the receiver's balance delta is what must satisfy the minimum.
    function test_INV17_routeCannotRedirectOutput() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 1e18);
        router.setHijackReceiver(address(0xBAD));

        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(id, _req(200e6, 1e18, ""));

        assertEq(nvdax.balanceOf(user), 0);
        assertEq(nvdax.balanceOf(address(0xBAD)), 0, "hijack reverted with the whole tx");
    }

    /// @dev A route that ignores the receiver parameter and pays the caller still ends with
    /// the user holding the asset, because the adapter forwards and then measures.
    function test_routeThatPaysCallerStillDeliversToReceiver() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        BespeakOrderManager.ExecutionRequest memory req = _req(200e6, 0, "");
        req.routerCalldata = abi.encodeCall(MockRouter.swapToCaller, (200e6));

        vm.prank(keeper);
        (, uint256 received) = manager.execute(id, req);
        assertGt(received, 0);
        assertEq(nvdax.balanceOf(user), received, "receiver ends up holding it either way");
        assertEq(nvdax.balanceOf(address(adapter)), 0, "adapter retains nothing");
    }

    /// @dev INV-18. No standing allowance survives an execution.
    function test_INV18_noLingeringAllowance() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setConsumeBps(5_000);

        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ""));
        assertEq(usdc.allowance(address(adapter), address(router)), 0, "allowance cleared");
    }

    // ------------------------------------------------------------ asset boundaries

    /// @dev P18 / INV-05. A paused asset cannot execute.
    function test_P18_pausedAssetCannotExecute() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(admin);
        registry.setStatus(ASSET_NVDA, AssetStatus.PAUSED);

        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ""))), uint8(Reason.ASSET_NOT_SUPPORTED));
        vm.prank(keeper);
        vm.expectRevert(
            abi.encodeWithSelector(
                BespeakOrderManager.ExecutionRefused.selector, Reason.ASSET_NOT_SUPPORTED
            )
        );
        manager.execute(id, _req(200e6, 0, ""));
    }

    /// @dev An asset with no proven X Layer deployment cannot be promoted to SUPPORTED at
    /// all, so a ticker string can never become executable (INV-05, PRD 18.2).
    function test_P18_assetWithoutDeploymentCannotBeSupported() public {
        vm.prank(admin);
        vm.expectRevert(AssetRegistry.UnderlyingRequired.selector);
        registry.upsertAsset(
            AssetRegistry.AssetInput({
                assetId: keccak256("FAKEx"),
                symbol: "FAKEx",
                canonicalId: "",
                underlying: address(0),
                wrapper: address(0),
                wrapperVersion: 0,
                status: AssetStatus.SUPPORTED,
                sourcePayloadHash: bytes32(0),
                sourceFetchedAt: 0,
                sourceUri: ""
            })
        );
    }

    // ------------------------------------------------------------ authority

    function test_onlyKeeperMayExecute() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        vm.prank(user);
        vm.expectRevert(BespeakOrderManager.NotKeeper.selector);
        manager.execute(id, _req(200e6, 0, ""));
    }

    /// @dev INV-19 in contract terms: admin has no function that can spend, redirect or
    /// rewrite a user's order. The only admin surface is pause/config.
    function test_adminCannotTouchUserOrder() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(admin);
        vm.expectRevert(BespeakOrderManager.NotOrderOwner.selector);
        manager.cancelOrder(id);

        Order memory o = manager.getOrder(id);
        assertEq(o.receiver, user);
        assertEq(o.amountIn, 200e6);
    }

    function test_pausedSystemRefusesExecution() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        vm.prank(admin);
        manager.setPaused(true);
        assertEq(uint8(manager.checkExecution(id, _req(200e6, 0, ""))), uint8(Reason.SYSTEM_PAUSED));
    }

    /// @dev A quote older than the freshness window cannot be executed on.
    function test_staleQuoteRefused() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        BespeakOrderManager.ExecutionRequest memory req = _req(200e6, 0, "");
        vm.warp(block.timestamp + 31); // quoteFreshnessSeconds is 30
        assertEq(uint8(manager.checkExecution(id, req)), uint8(Reason.QUOTE_STALE));
    }
}
