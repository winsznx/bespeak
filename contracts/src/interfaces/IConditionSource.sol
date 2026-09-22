// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ConditionObservation, SourceTier} from "../BespeakTypes.sol";

/// @notice One rung of the condition-source ladder (PRD 21.1).
///
/// Every source answers the same question — what market session is this asset in right
/// now, and how strongly can that be supported — and every source must state its own trust
/// tier. The order manager compares that tier against the tier the user authorized, which
/// is what makes a downgrade impossible to perform silently.
interface IConditionSource {
    /// @notice Trust tier this source can honestly claim. Constant per deployment.
    function tier() external view returns (SourceTier);

    /// @notice Stable identifier for the source, recorded in receipts.
    function sourceId() external view returns (bytes32);

    /// @notice Authoritative path. May write (an oracle verifier call is state-changing).
    /// @param evidence Source-specific proof: a signed attestation, or an oracle report.
    /// @return obs The observation. `valid == false` means the evidence did not support a
    /// conclusion; callers must treat that as UNKNOWN and never as eligibility.
    function observe(bytes32 assetId, bytes calldata evidence)
        external
        returns (ConditionObservation memory obs);

    /// @notice Best-effort read-only path used by `checkExecution` simulation.
    /// @dev A source that cannot verify without writing returns `valid == false` here. That
    /// is a limit of the simulation, not a market conclusion.
    function peek(bytes32 assetId, bytes calldata evidence)
        external
        view
        returns (ConditionObservation memory obs);
}
