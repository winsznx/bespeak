// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {RouterRegistry} from "./RouterRegistry.sol";

/// @title OkxExecutionAdapter
/// @notice The bounded boundary between user capital and external routing.
///
/// Calldata returned by the OKX DEX API is untrusted input. This contract never reads the
/// API's claims about what a route will do; it allowlists who may be called, caps what may
/// be spent, and then measures the actual result from token balance deltas. If the router
/// lies, under-delivers, or consumes a different amount than quoted, the deltas disagree
/// with the postconditions and the whole transaction reverts.
///
/// The adapter deliberately holds no state about orders, conditions or users. It cannot
/// decide that an order is eligible; that belongs to the order manager (PRD 25).
contract OkxExecutionAdapter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ExecParams {
        address inputToken;
        address outputToken;
        address receiver;
        address router;
        address approveTarget;
        uint256 amountIn;
        uint256 minAmountOut;
        address refundTo;
        bytes routerCalldata;
    }

    address public immutable orderManager;
    RouterRegistry public immutable routerRegistry;

    event Executed(
        address indexed inputToken,
        address indexed outputToken,
        address indexed receiver,
        address router,
        uint256 amountInOffered,
        uint256 actualInputSpent,
        uint256 actualOutputReceived,
        uint256 unusedInputRefunded
    );

    error NotOrderManager();
    error RouterNotApproved(address router);
    error ApproveTargetNotApproved(address target);
    error RouterIsToken(address router);
    error ReceiverIsAdapter();
    error ZeroReceiver();
    error RouterCallFailed(bytes returnData);
    error OverSpent(uint256 spent, uint256 offered);
    error InsufficientOutput(uint256 received, uint256 minRequired);
    error NoOutputReceived();

    modifier onlyOrderManager() {
        if (msg.sender != orderManager) revert NotOrderManager();
        _;
    }

    constructor(address _orderManager, address _routerRegistry) {
        orderManager = _orderManager;
        routerRegistry = RouterRegistry(_routerRegistry);
    }

    /// @notice Spend up to `amountIn` through `router` and prove the receiver actually got
    /// at least `minAmountOut` of `outputToken`.
    /// @dev The input tokens must already have been transferred to this adapter by the
    /// vault. Any input the router does not consume is returned to `refundTo`.
    /// @return spent Actual input consumed, measured by balance delta, never by API claim.
    /// @return received Actual output the receiver gained, measured by balance delta.
    function execute(ExecParams calldata p)
        external
        onlyOrderManager
        nonReentrant
        returns (uint256 spent, uint256 received)
    {
        if (!routerRegistry.isApprovedRouter(p.router)) revert RouterNotApproved(p.router);
        if (!routerRegistry.isApprovedApproveTarget(p.approveTarget)) {
            revert ApproveTargetNotApproved(p.approveTarget);
        }
        // Defence in depth: an allowlisted router should never be a token contract, but if
        // one were ever added by mistake the calldata could become a direct ERC20 call.
        if (p.router == p.inputToken || p.router == p.outputToken) revert RouterIsToken(p.router);
        if (p.receiver == address(0)) revert ZeroReceiver();
        // The output measurement is the receiver's balance delta, so the adapter cannot be
        // the receiver without making that measurement meaningless.
        if (p.receiver == address(this)) revert ReceiverIsAdapter();

        IERC20 tokenIn = IERC20(p.inputToken);
        IERC20 tokenOut = IERC20(p.outputToken);

        uint256 inBefore = tokenIn.balanceOf(address(this));
        uint256 receiverOutBefore = tokenOut.balanceOf(p.receiver);
        uint256 adapterOutBefore = tokenOut.balanceOf(address(this));

        // Approve exactly what this attempt may consume, and no more (INV-18).
        tokenIn.forceApprove(p.approveTarget, p.amountIn);

        (bool ok, bytes memory ret) = p.router.call(p.routerCalldata);
        if (!ok) revert RouterCallFailed(ret);

        // Clear the allowance unconditionally, so a router that consumed only part of the
        // input cannot retain a standing claim on the remainder.
        tokenIn.forceApprove(p.approveTarget, 0);

        uint256 inAfter = tokenIn.balanceOf(address(this));
        spent = inBefore - inAfter;
        if (spent > p.amountIn) revert OverSpent(spent, p.amountIn);

        // Routes that ignore the receiver parameter land the output here instead. Forward
        // it so the user ends up in the same final state either way, then measure the
        // receiver rather than trusting which path was taken.
        uint256 adapterOutAfter = tokenOut.balanceOf(address(this));
        if (adapterOutAfter > adapterOutBefore) {
            tokenOut.safeTransfer(p.receiver, adapterOutAfter - adapterOutBefore);
        }

        received = tokenOut.balanceOf(p.receiver) - receiverOutBefore;
        if (received == 0) revert NoOutputReceived();
        if (received < p.minAmountOut) revert InsufficientOutput(received, p.minAmountOut);

        uint256 unused = p.amountIn - spent;
        if (unused > 0) {
            tokenIn.safeTransfer(p.refundTo, unused);
        }

        emit Executed(
            p.inputToken, p.outputToken, p.receiver, p.router, p.amountIn, spent, received, unused
        );
    }
}
