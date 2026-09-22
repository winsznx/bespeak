// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "openzeppelin-contracts/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @notice Stands in for the OKX DEX router. Its behaviour is configurable so the tests can
/// reproduce the cases that actually matter: a normal fill, the documented Uniswap-v3
/// partial-consumption refund, an under-delivering route, and a route that sends the output
/// somewhere other than the authorized receiver.
contract MockRouter {
    IERC20 public immutable tokenIn;
    IERC20 public immutable tokenOut;

    /// @notice Output units produced per input unit, scaled by 1e18.
    uint256 public rate;
    /// @notice Fraction of the offered input actually consumed, in bps. 10_000 = all of it.
    uint256 public consumeBps = 10_000;
    /// @notice Multiplier applied to the output, in bps, to simulate under-delivery.
    uint256 public deliverBps = 10_000;
    address public hijackReceiver;

    constructor(IERC20 _in, IERC20 _out, uint256 _rate) {
        tokenIn = _in;
        tokenOut = _out;
        rate = _rate;
    }

    function setConsumeBps(uint256 v) external {
        consumeBps = v;
    }

    function setDeliverBps(uint256 v) external {
        deliverBps = v;
    }

    function setHijackReceiver(address v) external {
        hijackReceiver = v;
    }

    function setRate(uint256 v) external {
        rate = v;
    }

    /// @dev Mirrors the OKX swap shape: the caller has approved this router, and the router
    /// pulls what it needs and pays the receiver directly.
    function swap(uint256 amountIn, address receiver) external {
        uint256 take = (amountIn * consumeBps) / 10_000;
        tokenIn.transferFrom(msg.sender, address(this), take);
        uint256 out = (take * rate) / 1e18;
        out = (out * deliverBps) / 10_000;
        address dest = hijackReceiver == address(0) ? receiver : hijackReceiver;
        MockERC20(address(tokenOut)).mint(dest, out);
    }

    /// @dev A route that ignores the receiver parameter entirely and pays the caller.
    function swapToCaller(uint256 amountIn) external {
        uint256 take = (amountIn * consumeBps) / 10_000;
        tokenIn.transferFrom(msg.sender, address(this), take);
        uint256 out = (take * rate) / 1e18;
        MockERC20(address(tokenOut)).mint(msg.sender, out);
    }
}

contract ReentrantRouter {
    address public target;
    bytes public payload;
    bool public fired;

    function arm(address _target, bytes calldata _payload) external {
        target = _target;
        payload = _payload;
    }

    fallback() external {
        if (!fired) {
            fired = true;
            (bool ok,) = target.call(payload);
            // Swallow the result: the assertion under test is that the reentrant call
            // cannot produce a second fill, not that it reverts in any particular way.
            ok;
        }
    }
}
