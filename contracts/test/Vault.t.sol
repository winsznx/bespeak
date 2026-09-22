// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakBase} from "./Base.t.sol";
import {BespeakVault} from "../src/BespeakVault.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {SourceTier, TriggerType} from "../src/BespeakTypes.sol";

/// @notice The vault's job is that `available + reserved == balance` holds no matter what
/// sequence of deposits, orders, cancellations and fills occurred.
contract VaultTest is BespeakBase {
    function test_depositIncreasesAvailable() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        assertEq(v.available(address(usdc)), 1_000e6);
        assertEq(v.balance(address(usdc)), 1_000e6);
        assertEq(v.totalReserved(address(usdc)), 0);
    }

    function test_createOrderMovesAvailableToReserved() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        _immediateOrder(200e6, 0);

        assertEq(v.available(address(usdc)), 800e6, "available should drop by the reservation");
        assertEq(v.totalReserved(address(usdc)), 200e6);
        assertEq(v.balance(address(usdc)), 1_000e6, "reserving moves no tokens");
    }

    /// @dev INV-01 / PRD 14.4: reserved capital is not withdrawable.
    function test_cannotWithdrawReservedCapital() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        _immediateOrder(200e6, 0);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakVault.InsufficientAvailable.selector, address(usdc), 801e6, 800e6)
        );
        v.withdraw(address(usdc), 801e6, user);

        vm.prank(user);
        v.withdraw(address(usdc), 800e6, user);
        assertEq(usdc.balanceOf(user), 800e6);
    }

    function test_onlyOwnerWithdraws() public {
        BespeakVault v = _fundedVault(user, 100e6);
        vm.prank(address(0xBAD));
        vm.expectRevert(BespeakVault.NotOwner.selector);
        v.withdraw(address(usdc), 1e6, address(0xBAD));
    }

    /// @dev One user's order can never reach another user's capital (PRD 3.3).
    function test_vaultsAreIsolated() public {
        address other = address(0xC0FFEE);
        BespeakVault vUser = _fundedVault(user, 1_000e6);
        BespeakVault vOther = _fundedVault(other, 5_000e6);

        assertTrue(address(vUser) != address(vOther));
        _immediateOrder(900e6, 0);

        assertEq(vOther.available(address(usdc)), 5_000e6, "other vault untouched");
        assertEq(vUser.available(address(usdc)), 100e6);
    }

    /// @dev Oversubscription must fail at the vault, independently of any order-level check.
    function test_cannotOversubscribeReservations() public {
        _fundedVault(user, 300e6);
        _immediateOrder(200e6, 0);

        vm.prank(user);
        vm.expectRevert(
            abi.encodeWithSelector(BespeakVault.InsufficientAvailable.selector, address(usdc), 200e6, 100e6)
        );
        manager.createOrder(
            BespeakOrderManager.CreateOrderParams({
                inputToken: address(usdc),
                assetId: ASSET_NVDA,
                receiver: user,
                triggerType: TriggerType.IMMEDIATE,
                amountIn: 200e6,
                minAmountOut: 0,
                maxSlippageBps: 75,
                maxReferenceDeviationBps: 100,
                validAfter: 0,
                expiresAt: uint64(block.timestamp + 1 days),
                minSourceTier: SourceTier.ATTESTED_SESSION
            })
        );
    }

    /// @dev INV-11: cancellation frees the capital exactly once.
    function test_cancelReleasesExactlyOnce() public {
        BespeakVault v = _fundedVault(user, 1_000e6);
        bytes32 id = _immediateOrder(200e6, 0);

        vm.prank(user);
        manager.cancelOrder(id);
        assertEq(v.available(address(usdc)), 1_000e6);

        vm.prank(user);
        vm.expectRevert();
        manager.cancelOrder(id);
        assertEq(v.available(address(usdc)), 1_000e6, "no second release");
    }

    /// @dev Only the order manager may touch reservations, even for the vault's own owner.
    function test_ownerCannotSelfReserveOrSpend() public {
        BespeakVault v = _fundedVault(user, 100e6);
        vm.startPrank(user);
        vm.expectRevert(BespeakVault.NotOrderManager.selector);
        v.reserve(keccak256("x"), address(usdc), 1e6);
        vm.expectRevert(BespeakVault.NotOrderManager.selector);
        v.spendFromReservation(keccak256("x"), address(usdc), user, 1e6);
        vm.stopPrank();
    }

    /// @dev available + reserved == balance across an arbitrary deposit/reserve sequence.
    function testFuzz_accountingIdentityHolds(uint96 deposit, uint96 reserveAmt) public {
        deposit = uint96(bound(deposit, 1e6, 1e15));
        reserveAmt = uint96(bound(reserveAmt, 1e6, deposit));

        BespeakVault v = _fundedVault(user, deposit);
        _immediateOrder(reserveAmt, 0);

        assertEq(
            v.available(address(usdc)) + v.totalReserved(address(usdc)),
            v.balance(address(usdc)),
            "available + reserved must equal balance"
        );
    }
}
