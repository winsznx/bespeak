// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title BespeakVault
/// @notice One isolated vault per user. Never pooled: a vault's storage can only ever be
/// reached through the one owner it was created for, so no order can reach another user's
/// capital (PRD 3.3).
///
/// The reservation accounting lives here rather than in the order manager on purpose. The
/// vault does not know what an order is, what a market session is, or what a router does.
/// It only knows that capital committed to reservation `id` can be spent up to the amount
/// remaining on that reservation and no further. That makes INV-01 a structural property
/// of the vault instead of a rule the order manager has to remember to obey.
contract BespeakVault {
    using SafeERC20 for IERC20;

    struct Reservation {
        address token;
        uint256 amount; // remaining, decremented as it is spent
        bool active;
    }

    address public immutable owner;
    /// @notice The only contract allowed to reserve, release and spend. Set at construction
    /// and immutable: there is no admin path that can repoint a live vault at a new manager.
    address public immutable orderManager;

    mapping(address token => uint256) public totalReserved;
    mapping(bytes32 id => Reservation) public reservations;

    event Deposited(address indexed token, address indexed from, uint256 amount);
    event Withdrawn(address indexed token, address indexed to, uint256 amount);
    event Reserved(bytes32 indexed id, address indexed token, uint256 amount);
    event Released(bytes32 indexed id, address indexed token, uint256 amount);
    event SpentFromReservation(bytes32 indexed id, address indexed token, address indexed to, uint256 amount);

    error NotOwner();
    error NotOrderManager();
    error InsufficientAvailable(address token, uint256 requested, uint256 available);
    error ReservationExists(bytes32 id);
    error ReservationInactive(bytes32 id);
    error ExceedsReservation(bytes32 id, uint256 requested, uint256 remaining);
    error ZeroAmount();
    error TokenMismatch();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOrderManager() {
        if (msg.sender != orderManager) revert NotOrderManager();
        _;
    }

    constructor(address _owner, address _orderManager) {
        owner = _owner;
        orderManager = _orderManager;
    }

    /// @notice Capital not committed to any active reservation. This is the only balance the
    /// owner may withdraw and the only balance a new order may draw on.
    /// @dev Derived from the live token balance rather than a running total, so a direct
    /// ERC20 transfer into the vault is counted correctly and can never be double-spent
    /// against an existing reservation.
    function available(address token) public view returns (uint256) {
        uint256 bal = IERC20(token).balanceOf(address(this));
        uint256 res = totalReserved[token];
        return bal > res ? bal - res : 0;
    }

    function balance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }

    /// @notice Pull `amount` of `token` from the caller into this vault.
    function deposit(address token, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposited(token, msg.sender, amount);
    }

    /// @notice Withdraw available capital. Reserved capital must first be freed by
    /// cancelling, expiring or completing the order that holds it (PRD 14.4).
    function withdraw(address token, uint256 amount, address to) external onlyOwner {
        if (amount == 0) revert ZeroAmount();
        uint256 avail = available(token);
        if (amount > avail) revert InsufficientAvailable(token, amount, avail);
        IERC20(token).safeTransfer(to, amount);
        emit Withdrawn(token, to, amount);
    }

    function reserve(bytes32 id, address token, uint256 amount) external onlyOrderManager {
        if (amount == 0) revert ZeroAmount();
        Reservation storage r = reservations[id];
        // An id is reservable exactly once, ever. Re-reserving a released id is refused so a
        // recurring occurrence can never reuse capital another occurrence already holds (INV-13).
        if (r.token != address(0)) revert ReservationExists(id);
        uint256 avail = available(token);
        if (amount > avail) revert InsufficientAvailable(token, amount, avail);

        r.token = token;
        r.amount = amount;
        r.active = true;
        totalReserved[token] += amount;
        emit Reserved(id, token, amount);
    }

    /// @notice Return whatever remains of a reservation to available balance and close it.
    /// @dev Closing before transferring makes double-release impossible (INV-11); a second
    /// call reverts on the inactive check rather than releasing again.
    function release(bytes32 id) external onlyOrderManager returns (uint256 released) {
        Reservation storage r = reservations[id];
        if (!r.active) revert ReservationInactive(id);
        released = r.amount;
        r.active = false;
        r.amount = 0;
        totalReserved[r.token] -= released;
        emit Released(id, r.token, released);
    }

    /// @notice Move capital out of a reservation to the execution adapter.
    /// @dev The reservation is debited before the transfer, so the vault can never send more
    /// than was committed to this id even if the recipient re-enters.
    function spendFromReservation(bytes32 id, address token, address to, uint256 amount)
        external
        onlyOrderManager
    {
        Reservation storage r = reservations[id];
        if (!r.active) revert ReservationInactive(id);
        if (r.token != token) revert TokenMismatch();
        if (amount > r.amount) revert ExceedsReservation(id, amount, r.amount);

        r.amount -= amount;
        totalReserved[token] -= amount;
        IERC20(token).safeTransfer(to, amount);
        emit SpentFromReservation(id, token, to, amount);
    }

    function reservationOf(bytes32 id) external view returns (address token, uint256 amount, bool active) {
        Reservation storage r = reservations[id];
        return (r.token, r.amount, r.active);
    }
}
