// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ECDSA} from "openzeppelin-contracts/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
import {IConditionSource} from "./interfaces/IConditionSource.sol";
import {ConditionObservation, MarketStatus, SourceTier} from "./BespeakTypes.sol";

/// @title AttestedSessionVerifier
/// @notice Tier 3 condition source: an operator-signed observation of market session state.
///
/// This is the honest bottom rung of the ladder. It does NOT make the market state
/// trustless, and nothing in Bespeak may describe it as oracle-verified.
///
/// What it does buy, relative to a keeper that just calls execute() and implicitly asserts
/// the session: the attestation is an EIP-712 signature over the exact claim, so the
/// observation becomes non-repudiable and independently checkable after the fact. Anyone
/// holding the receipt can recover which key asserted which market state at which
/// timestamp, and compare it against the source payload hash. An implicit assertion leaves
/// no such artifact.
///
/// The underlying observation is read from the xStocks issuer's own published trading
/// state for the exact token being purchased, which also surfaces trading halts. That is
/// better sourced than a hardcoded holiday calendar, but it is the same trust model, so it
/// is tiered accordingly.
contract AttestedSessionVerifier is IConditionSource, EIP712, Ownable {
    bytes32 private constant _ATTESTATION_TYPEHASH = keccak256(
        "SessionAttestation(bytes32 assetId,uint8 marketStatus,uint64 observedAt,bytes32 sourceId,bytes32 payloadHash)"
    );

    /// @notice Keys permitted to attest. A set rather than a single key so an operator can
    /// rotate without a redeploy, and so a compromised key can be revoked immediately.
    mapping(address attestor => bool) public isAttestor;

    /// @notice Maximum age of an attestation, in seconds (PRD 13.1 default: 60).
    uint32 public maxAgeSeconds;

    /// @notice Tolerance for an observation timestamp slightly ahead of block time, to
    /// absorb clock skew between the attestor and the chain.
    uint32 public constant FUTURE_TOLERANCE = 30;

    bytes32 public immutable sourceIdValue;

    event AttestorSet(address indexed attestor, bool allowed);
    event MaxAgeSet(uint32 seconds_);

    error InvalidSignature();
    error UnauthorizedAttestor(address recovered);
    error AttestationTooFarInFuture(uint64 observedAt, uint256 nowTs);

    constructor(address initialOwner, bytes32 _sourceId, uint32 _maxAgeSeconds)
        EIP712("Bespeak.AttestedSession", "1")
        Ownable(initialOwner)
    {
        sourceIdValue = _sourceId;
        maxAgeSeconds = _maxAgeSeconds;
    }

    function setAttestor(address attestor, bool allowed) external onlyOwner {
        isAttestor[attestor] = allowed;
        emit AttestorSet(attestor, allowed);
    }

    function setMaxAge(uint32 seconds_) external onlyOwner {
        maxAgeSeconds = seconds_;
        emit MaxAgeSet(seconds_);
    }

    function tier() external pure returns (SourceTier) {
        return SourceTier.ATTESTED_SESSION;
    }

    function sourceId() external view returns (bytes32) {
        return sourceIdValue;
    }

    function observe(bytes32 assetId, bytes calldata evidence)
        external
        view
        returns (ConditionObservation memory)
    {
        return _verify(assetId, evidence);
    }

    function peek(bytes32 assetId, bytes calldata evidence)
        external
        view
        returns (ConditionObservation memory)
    {
        return _verify(assetId, evidence);
    }

    /// @notice Hash an attestation for off-chain signing. Exposed so the keeper and any
    /// third-party auditor derive the identical digest.
    function hashAttestation(
        bytes32 assetId,
        uint8 marketStatus,
        uint64 observedAt,
        bytes32 sourceId_,
        bytes32 payloadHash
    ) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(abi.encode(_ATTESTATION_TYPEHASH, assetId, marketStatus, observedAt, sourceId_, payloadHash))
        );
    }

    /// @dev `evidence` is abi.encode(uint8 marketStatus, uint64 observedAt, bytes32 payloadHash, bytes signature).
    /// A stale attestation returns `valid == false` rather than reverting, so the order
    /// manager can surface CONDITION_REPORT_STALE as an inspectable reason instead of an
    /// opaque revert. A forged one reverts: a bad signature is an attack, not a market state.
    function _verify(bytes32 assetId, bytes calldata evidence)
        internal
        view
        returns (ConditionObservation memory obs)
    {
        (uint8 rawStatus, uint64 observedAt, bytes32 payloadHash, bytes memory signature) =
            abi.decode(evidence, (uint8, uint64, bytes32, bytes));

        bytes32 digest = hashAttestation(assetId, rawStatus, observedAt, sourceIdValue, payloadHash);
        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError) revert InvalidSignature();
        if (!isAttestor[recovered]) revert UnauthorizedAttestor(recovered);
        if (observedAt > block.timestamp + FUTURE_TOLERANCE) {
            revert AttestationTooFarInFuture(observedAt, block.timestamp);
        }

        obs.marketStatus = rawStatus <= uint8(type(MarketStatus).max)
            ? MarketStatus(rawStatus)
            : MarketStatus.UNKNOWN;
        obs.tier = SourceTier.ATTESTED_SESSION;
        obs.observedAt = observedAt;
        obs.sourceId = sourceIdValue;
        obs.observationHash = keccak256(abi.encode(assetId, rawStatus, observedAt, sourceIdValue, payloadHash));

        // Validity means "this observation is fresh enough to be believed", and nothing
        // more. Whether the session it reports permits execution is the order manager's
        // decision, so a stale report and an unknown market stay distinguishable and the
        // user sees which one actually held their order.
        obs.valid = block.timestamp <= uint256(observedAt) + maxAgeSeconds;
    }
}
