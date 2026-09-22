// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/// @title RouterRegistry
/// @notice Allowlist of execution routers and token-approval targets.
///
/// OKX documents that its router and approval addresses change over time, so Bespeak
/// treats the address returned by the swap API as untrusted input and checks it here
/// before any vault capital moves (PRD 23.1, INV-06). Router and approval target are
/// tracked as two independent sets because the OKX API returns them separately and an
/// attacker who could substitute either one alone would be enough to steal the input.
contract RouterRegistry is Ownable {
    mapping(address router => bool) public isApprovedRouter;
    mapping(address target => bool) public isApprovedApproveTarget;

    /// @notice Bumped on every change so a receipt can pin the configuration it executed under.
    uint256 public configRevision;

    event RouterSet(address indexed router, bool approved, uint256 configRevision, uint64 at);
    event ApproveTargetSet(address indexed target, bool approved, uint256 configRevision, uint64 at);

    error ZeroAddress();

    constructor(address initialOwner) Ownable(initialOwner) {}

    function setRouter(address router, bool approved) external onlyOwner {
        if (router == address(0)) revert ZeroAddress();
        isApprovedRouter[router] = approved;
        unchecked {
            configRevision++;
        }
        emit RouterSet(router, approved, configRevision, uint64(block.timestamp));
    }

    function setApproveTarget(address target, bool approved) external onlyOwner {
        if (target == address(0)) revert ZeroAddress();
        isApprovedApproveTarget[target] = approved;
        unchecked {
            configRevision++;
        }
        emit ApproveTargetSet(target, approved, configRevision, uint64(block.timestamp));
    }
}
