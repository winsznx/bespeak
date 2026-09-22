// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {AssetStatus} from "./BespeakTypes.sol";

/// @title AssetRegistry
/// @notice Canonical identity for the official tokenized equities Bespeak will execute.
///
/// The registry is the only place that decides "is this address really NVDAx". A ticker
/// string never decides anything. Promotion to SUPPORTED requires an operator to supply
/// the provenance of the deployment (source URI + payload hash + source timestamp), and
/// every change emits that provenance so the registry's history is auditable from logs
/// alone (PRD 18.3).
///
/// The registry does NOT hold funds and cannot move them. Its worst-case compromise is
/// pointing at a wrong token, which the adapter's output-asset postcondition and the
/// order's pinned `assetRegistryRevision` both independently constrain.
contract AssetRegistry is Ownable {
    struct Asset {
        bytes32 assetId;
        string symbol;
        /// @dev Canonical xStocks identifier from the provenance source, not a ticker guess.
        string canonicalId;
        /// @dev The rebasing xStock itself on X Layer. Zero until a deployment is proven.
        address underlying;
        /// @dev Current ERC-4626 wrapper, if the executable route uses one. Zero if unused.
        address wrapper;
        uint16 wrapperVersion;
        AssetStatus status;
        /// @dev Corporate action (xStocks multiplier) protection window (PRD 20).
        uint64 multiplierActivationTime;
        uint32 protectionWindowSeconds;
        /// @dev Provenance of the current values.
        bytes32 sourcePayloadHash;
        uint64 sourceFetchedAt;
        string sourceUri;
    }

    /// @notice Bumped on every mutation. Orders pin the revision they were created under so
    /// a later registry edit can never rewrite the asset identity inside a historical
    /// receipt (INV-15).
    bytes32 public revision;
    uint256 public revisionCounter;

    mapping(bytes32 assetId => Asset) private _assets;
    bytes32[] private _assetIds;
    mapping(bytes32 assetId => bool) private _known;

    event AssetUpserted(
        bytes32 indexed assetId,
        string symbol,
        address underlying,
        address wrapper,
        uint16 wrapperVersion,
        AssetStatus status,
        bytes32 sourcePayloadHash,
        uint64 sourceFetchedAt,
        string sourceUri,
        bytes32 newRevision
    );
    event AssetStatusChanged(bytes32 indexed assetId, AssetStatus from, AssetStatus to, bytes32 newRevision);
    event CorporateActionScheduled(
        bytes32 indexed assetId, uint64 activationTime, uint32 windowSeconds, bytes32 newRevision
    );

    error UnknownAsset(bytes32 assetId);
    error UnderlyingRequired();
    error InvalidProtectionWindow();

    constructor(address initialOwner) Ownable(initialOwner) {
        _bumpRevision();
    }

    function _bumpRevision() internal {
        unchecked {
            revisionCounter++;
        }
        revision = keccak256(abi.encodePacked(address(this), block.chainid, revisionCounter));
    }

    /// @notice Provenance-bearing input for an upsert. Passed as a struct because the
    /// flat parameter list exceeds the EVM stack depth, and because it keeps the source
    /// fields physically adjacent to the values they justify.
    struct AssetInput {
        bytes32 assetId;
        string symbol;
        string canonicalId;
        address underlying;
        address wrapper;
        uint16 wrapperVersion;
        AssetStatus status;
        bytes32 sourcePayloadHash;
        uint64 sourceFetchedAt;
        string sourceUri;
    }

    /// @notice Create or update an asset entry together with the provenance that justifies it.
    /// @dev Promotion to SUPPORTED requires a non-zero underlying address: an asset with no
    /// proven X Layer deployment stays DISCOVERED/UNAVAILABLE and therefore cannot execute.
    function upsertAsset(AssetInput calldata input) external onlyOwner {
        if (input.status == AssetStatus.SUPPORTED && input.underlying == address(0)) {
            revert UnderlyingRequired();
        }

        bytes32 assetId = input.assetId;
        Asset storage a = _assets[assetId];
        if (!_known[assetId]) {
            _known[assetId] = true;
            _assetIds.push(assetId);
            a.assetId = assetId;
            a.protectionWindowSeconds = 900; // PRD 20 initial default: 15 minutes each side.
        }
        a.symbol = input.symbol;
        a.canonicalId = input.canonicalId;
        a.underlying = input.underlying;
        a.wrapper = input.wrapper;
        a.wrapperVersion = input.wrapperVersion;
        a.status = input.status;
        a.sourcePayloadHash = input.sourcePayloadHash;
        a.sourceFetchedAt = input.sourceFetchedAt;
        a.sourceUri = input.sourceUri;

        _bumpRevision();
        emit AssetUpserted(
            assetId,
            input.symbol,
            input.underlying,
            input.wrapper,
            input.wrapperVersion,
            input.status,
            input.sourcePayloadHash,
            input.sourceFetchedAt,
            input.sourceUri,
            revision
        );
    }

    function setStatus(bytes32 assetId, AssetStatus status) external onlyOwner {
        if (!_known[assetId]) revert UnknownAsset(assetId);
        Asset storage a = _assets[assetId];
        if (status == AssetStatus.SUPPORTED && a.underlying == address(0)) revert UnderlyingRequired();
        AssetStatus from = a.status;
        a.status = status;
        _bumpRevision();
        emit AssetStatusChanged(assetId, from, status, revision);
    }

    /// @notice Schedule an xStocks multiplier activation. Execution is refused inside
    /// [activationTime - window, activationTime + window].
    function scheduleCorporateAction(bytes32 assetId, uint64 activationTime, uint32 windowSeconds)
        external
        onlyOwner
    {
        if (!_known[assetId]) revert UnknownAsset(assetId);
        if (windowSeconds > 7 days) revert InvalidProtectionWindow();
        Asset storage a = _assets[assetId];
        a.multiplierActivationTime = activationTime;
        a.protectionWindowSeconds = windowSeconds;
        _bumpRevision();
        emit CorporateActionScheduled(assetId, activationTime, windowSeconds, revision);
    }

    function getAsset(bytes32 assetId) external view returns (Asset memory) {
        if (!_known[assetId]) revert UnknownAsset(assetId);
        return _assets[assetId];
    }

    function isKnown(bytes32 assetId) external view returns (bool) {
        return _known[assetId];
    }

    function assetCount() external view returns (uint256) {
        return _assetIds.length;
    }

    function assetIdAt(uint256 i) external view returns (bytes32) {
        return _assetIds[i];
    }

    /// @notice The token a successful execution must actually deliver to the receiver.
    /// Wrapper when one is configured, otherwise the underlying rebasing xStock.
    function outputToken(bytes32 assetId) external view returns (address) {
        if (!_known[assetId]) revert UnknownAsset(assetId);
        Asset storage a = _assets[assetId];
        return a.wrapper == address(0) ? a.underlying : a.wrapper;
    }

    function isSupported(bytes32 assetId) external view returns (bool) {
        return _known[assetId] && _assets[assetId].status == AssetStatus.SUPPORTED;
    }

    /// @notice True while the asset sits inside its protected corporate-action interval.
    function inCorporateActionWindow(bytes32 assetId) public view returns (bool) {
        if (!_known[assetId]) return false;
        Asset storage a = _assets[assetId];
        uint64 t = a.multiplierActivationTime;
        if (t == 0) return false;
        uint256 w = a.protectionWindowSeconds;
        uint256 start = t > w ? uint256(t) - w : 0;
        uint256 end = uint256(t) + w;
        return block.timestamp >= start && block.timestamp <= end;
    }
}
