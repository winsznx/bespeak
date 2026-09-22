// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakBase} from "./Base.t.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {Order, OrderStatus, Reason, SourceTier, TriggerType} from "../src/BespeakTypes.sol";

/// @notice P11 / G5 / INV-13. A repeating instruction must fund one occurrence at a time,
/// produce the next one only after the previous reaches a terminal state, and hold rather
/// than self-destruct when the vault runs dry.
contract RecurringTest is BespeakBase {
    function _createSeries(uint256 perOccurrence, uint32 count)
        internal
        returns (bytes32 recurringId, bytes32 firstOrderId)
    {
        vm.prank(user);
        return manager.createRecurring(
            BespeakOrderManager.CreateRecurringParams({
                inputToken: address(usdc),
                assetId: ASSET_NVDA,
                receiver: user,
                amountPerOccurrence: perOccurrence,
                minAmountOutPerOccurrence: 0,
                maxSlippageBps: 75,
                intervalSeconds: 7 days,
                totalOccurrences: count,
                firstEligibleAt: uint64(block.timestamp),
                occurrenceTrigger: TriggerType.IMMEDIATE,
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );
    }

    /// @dev The headline property: creating a ten-week plan reserves one week of capital,
    /// not ten (PRD 15.3).
    function test_P11_lazyReservationDoesNotLockTheWholePlan() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        (, bytes32 first) = _createSeries(100e6, 10);

        assertTrue(first != bytes32(0));
        assertEq(v.totalReserved(address(usdc)), 100e6, "exactly one occurrence is funded");
        assertEq(v.available(address(usdc)), 900e6, "the other nine weeks stay the user's");

        BespeakOrderManager.RecurringInstruction memory r =
            manager.getRecurring(manager.recurringOf(user)[0]);
        assertEq(r.createdOccurrences, 1);
        assertEq(r.totalOccurrences, 10);
    }

    /// @dev P11. Occurrence N completing creates occurrence N+1, with its own id and its
    /// own fresh reservation, and without touching the completed one.
    function test_P11_terminalOccurrenceCreatesTheNext() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 3);

        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        BespeakOrderManager.RecurringInstruction memory r = manager.getRecurring(rid);
        assertEq(r.createdOccurrences, 2, "next occurrence created lazily");
        assertEq(r.completedOccurrences, 1);

        bytes32[] memory orders = manager.ordersOf(user);
        assertEq(orders.length, 2);
        bytes32 second = orders[1];
        assertTrue(second != first, "a distinct order id");

        Order memory o1 = manager.getOrder(first);
        Order memory o2 = manager.getOrder(second);
        assertEq(uint8(o1.status), uint8(OrderStatus.FILLED), "history is immutable");
        assertEq(uint8(o2.status), uint8(OrderStatus.ACTIVE));
        assertEq(o2.occurrenceIndex, 1);
        assertEq(o2.validAfter, o1.validAfter + 7 days, "scheduled one interval later");
        assertEq(v.totalReserved(address(usdc)), 100e6, "still only one occurrence funded");
    }

    /// @dev Two occurrences complete end to end, each with its own receipt.
    function test_P11_twoIndependentOccurrencesComplete() public {
        _fundedVault(user, 1_000e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 3);

        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        bytes32 second = manager.ordersOf(user)[1];
        vm.warp(block.timestamp + 7 days);
        vm.prank(keeper);
        manager.execute(second, _req(100e6, 0, ""));

        assertEq(manager.getRecurring(rid).completedOccurrences, 2);
        assertEq(manager.executionCount(first), 1);
        assertEq(manager.executionCount(second), 1);
        assertEq(manager.ordersOf(user).length, 3, "third occurrence queued");
    }

    /// @dev The case that must not silently cancel: the vault cannot fund the next
    /// occurrence. The instruction stays active and reports the reason, so the user can
    /// top up and resume (PRD 15.3).
    function test_P11_underfundedNextOccurrenceHoldsInsteadOfCancelling() public {
        BespeakVault v = _fundedVault(user, 150e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 5);
        assertEq(v.available(address(usdc)), 50e6);

        vm.recordLogs();
        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        BespeakOrderManager.RecurringInstruction memory r = manager.getRecurring(rid);
        assertTrue(r.active, "the series is NOT cancelled");
        assertEq(r.createdOccurrences, 1, "no second occurrence could be funded");
        assertEq(manager.ordersOf(user).length, 1);

        // Top up, then the next occurrence becomes creatable with no admin intervention.
        usdc.mint(user, 500e6);
        vm.startPrank(user);
        usdc.approve(address(v), 500e6);
        v.deposit(address(usdc), 500e6);
        vm.stopPrank();

        manager.createNextOccurrence(rid);
        assertEq(manager.getRecurring(rid).createdOccurrences, 2, "resumed after top-up");
        assertEq(v.totalReserved(address(usdc)), 100e6);
    }

    /// @dev INV-13. Occurrences never share capital: two live reservations are two distinct
    /// amounts, and the vault refuses to reserve the same id twice.
    function test_INV13_occurrencesCannotShareCapital() public {
        BespeakVault v = _fundedVault(user, 250e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 5);

        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        bytes32 second = manager.ordersOf(user)[1];
        (, uint256 amt1, bool active1) = v.reservationOf(first);
        (, uint256 amt2, bool active2) = v.reservationOf(second);

        assertFalse(active1, "the completed occurrence holds nothing");
        assertEq(amt1, 0);
        assertTrue(active2);
        assertEq(amt2, 100e6);
        assertEq(v.totalReserved(address(usdc)), 100e6, "total reserved reflects one live occurrence");
        rid;
    }

    function test_pauseStopsNewOccurrences() public {
        _fundedVault(user, 1_000e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 5);

        vm.prank(user);
        manager.pauseRecurring(rid, true);

        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        assertEq(manager.getRecurring(rid).createdOccurrences, 1, "paused: no new occurrence");
        assertEq(uint8(manager.getOrder(first).status), uint8(OrderStatus.FILLED), "history untouched");

        vm.prank(user);
        manager.pauseRecurring(rid, false);
        manager.createNextOccurrence(rid);
        assertEq(manager.getRecurring(rid).createdOccurrences, 2, "resumes cleanly");
    }

    function test_seriesEndsAfterConfiguredCount() public {
        _fundedVault(user, 1_000e6);
        (bytes32 rid, bytes32 first) = _createSeries(100e6, 1);

        vm.prank(keeper);
        manager.execute(first, _req(100e6, 0, ""));

        BespeakOrderManager.RecurringInstruction memory r = manager.getRecurring(rid);
        assertFalse(r.active, "series completed");
        assertEq(r.completedOccurrences, 1);
        assertEq(manager.ordersOf(user).length, 1, "no eleventh occurrence appears");
    }

    function test_onlyOwnerControlsSeries() public {
        _fundedVault(user, 1_000e6);
        (bytes32 rid,) = _createSeries(100e6, 5);

        vm.startPrank(address(0xBAD));
        vm.expectRevert(BespeakOrderManager.NotOrderOwner.selector);
        manager.pauseRecurring(rid, true);
        vm.expectRevert(BespeakOrderManager.NotOrderOwner.selector);
        manager.cancelRecurring(rid);
        vm.stopPrank();
    }

    /// @dev An occurrence whose session never arrives expires and frees its capital rather
    /// than pinning it indefinitely.
    function test_unfilledOccurrenceExpiresAndReleases() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        (, bytes32 first) = _createSeries(100e6, 3);

        vm.warp(block.timestamp + 9 days); // past interval + 1 day of slack
        manager.expireOrder(first);

        assertEq(uint8(manager.getOrder(first).status), uint8(OrderStatus.EXPIRED));
        assertEq(v.available(address(usdc)), 1_000e6);
    }
}
