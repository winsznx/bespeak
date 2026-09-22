// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakBase} from "./Base.t.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {OrderStatus, Reason} from "../src/BespeakTypes.sol";
import {MockERC20, MockRouter, ReentrantRouter} from "./mocks/Mocks.sol";

/// The adapter is the only place user capital meets an external contract, so its boundary
/// gets its own suite: reentrancy, calldata that points somewhere unexpected, and the
/// accounting that has to survive a router behaving badly.
contract AdapterTest is BespeakBase {
    /// A router that calls back into execute() during the swap must not produce a second
    /// fill. The order is already FILLED before the external call, so the reentrant attempt
    /// finds a non-ACTIVE order; the nonReentrant guards close the path regardless.
    function test_reentrantRouterCannotDoubleFill() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        ReentrantRouter rogue = new ReentrantRouter();
        vm.startPrank(admin);
        routers.setRouter(address(rogue), true);
        routers.setApproveTarget(address(rogue), true);
        vm.stopPrank();

        BespeakOrderManager.ExecutionRequest memory req = _req(200e6, 0, "");
        req.router = address(rogue);
        req.approveTarget = address(rogue);
        req.routerCalldata = hex"deadbeef";

        rogue.arm(
            address(manager),
            abi.encodeCall(BespeakOrderManager.execute, (id, req))
        );

        // The outer call fails its own postconditions (the rogue router delivers nothing),
        // so the whole attempt reverts and the order survives untouched.
        vm.prank(keeper);
        vm.expectRevert();
        manager.execute(id, req);

        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE));
        assertEq(manager.executionCount(id), 0, "no execution was ever counted");
        assertEq(nvdax.balanceOf(user), 0);
    }

    /// A route that delivers nothing at all fails rather than silently completing an order
    /// with a zero-value fill.
    function test_zeroOutputReverts() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setDeliverBps(0);

        vm.prank(keeper);
        vm.expectRevert(OkxExecutionAdapter.NoOutputReceived.selector);
        manager.execute(id, _req(200e6, 0, ""));
        assertEq(uint8(manager.getOrder(id).status), uint8(OrderStatus.ACTIVE));
    }

    /// The adapter refuses to be called by anything other than the order manager, so a
    /// direct call cannot bypass eligibility.
    function test_adapterRejectsDirectCall() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(OkxExecutionAdapter.NotOrderManager.selector);
        adapter.execute(
            OkxExecutionAdapter.ExecParams({
                inputToken: address(usdc),
                outputToken: address(nvdax),
                receiver: user,
                router: address(router),
                approveTarget: address(router),
                amountIn: 1e6,
                minAmountOut: 0,
                refundTo: user,
                routerCalldata: ""
            })
        );
    }

    /// The adapter holds nothing between executions. Anything it retained would be capital
    /// outside any vault's accounting.
    function test_adapterRetainsNothing() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setConsumeBps(7_000);

        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ""));

        assertEq(usdc.balanceOf(address(adapter)), 0, "no input dust left in the adapter");
        assertEq(nvdax.balanceOf(address(adapter)), 0, "no output left in the adapter");
    }

    /// A router that consumed part of the input must not keep a standing claim on the rest.
    function test_allowanceClearedAfterPartialConsumption() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setConsumeBps(4_000);

        vm.prank(keeper);
        manager.execute(id, _req(200e6, 0, ""));
        assertEq(usdc.allowance(address(adapter), address(router)), 0);
    }

    /// The keeper may tighten the user's envelope but the contract still governs. Offering
    /// less input than the order authorized is allowed; offering more is not.
    function test_keeperCannotIncreaseInputAboveOrder() public {
        _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        assertEq(
            uint8(manager.checkExecution(id, _req(300e6, 0, ""))),
            uint8(Reason.INSUFFICIENT_RESERVED_BALANCE)
        );

        // Under-spending is permitted, and the unused reservation comes back.
        BespeakVault v = BespeakVault(factory.vaultOf(user));
        vm.prank(keeper);
        (uint256 spent,) = manager.execute(id, _req(50e6, 0, ""));
        assertEq(spent, 50e6);
        assertEq(v.available(address(usdc)), 950e6, "the other 150 was never spent");
        assertEq(v.totalReserved(address(usdc)), 0);
    }

    /// Accounting stays exact across an arbitrary partial consumption.
    function testFuzz_partialConsumptionAccounting(uint16 rawBps) public {
        // Widened to uint256 before arithmetic: a uint16 operand would otherwise narrow the
        // literal and silently wrap the expected-value computation.
        uint256 consumeBps = bound(uint256(rawBps), 1, 10_000);
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);
        router.setConsumeBps(consumeBps);

        vm.prank(keeper);
        (uint256 spent,) = manager.execute(id, _req(200e6, 0, ""));

        uint256 expectedSpend = (uint256(200e6) * consumeBps) / 10_000;
        assertEq(spent, expectedSpend, "spend is measured, never assumed");
        assertEq(
            v.available(address(usdc)),
            1_000e6 - expectedSpend,
            "everything not actually spent is available again"
        );
        assertEq(v.totalReserved(address(usdc)), 0);
        assertEq(
            v.available(address(usdc)) + v.totalReserved(address(usdc)),
            v.balance(address(usdc)),
            "accounting identity survives a partial fill"
        );
    }
}
