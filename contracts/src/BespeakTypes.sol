// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice Authoritative onchain order lifecycle (PRD 16.1). Only these states decide
/// whether capital may still be spent. Derived states such as WAITING / HELD / ELIGIBLE
/// are keeper and UI projections and deliberately do not exist onchain.
enum OrderStatus {
    NONE,
    ACTIVE,
    FILLED,
    CANCELLED,
    EXPIRED
}

/// @notice The execution condition the user authorized.
enum TriggerType {
    IMMEDIATE,
    NEXT_REGULAR_SESSION,
    WHEN_AVAILABLE
}

/// @notice Registry lifecycle for an asset (PRD 18.1). Only SUPPORTED may execute.
enum AssetStatus {
    DISCOVERED,
    SUPPORTED,
    PAUSED,
    DEPRECATED,
    UNAVAILABLE
}

/// @notice Market session as reported by a condition source.
enum MarketStatus {
    UNKNOWN,
    CLOSED,
    PRE_MARKET,
    REGULAR,
    POST_MARKET
}

/// @notice Trust tier of the condition source that made an order eligible (PRD 21.1).
/// Recorded on every execution so a receipt can never overstate its provenance.
enum SourceTier {
    NONE,
    VERIFIED_DATA_STREAMS,
    SECONDARY_VERIFIED_ORACLE,
    ATTESTED_SESSION
}

/// @notice Machine-readable non-execution reasons (PRD 17). `checkExecution` returns these
/// and `execute` reverts with the matching custom error, so a simulated refusal and a real
/// refusal always agree.
enum Reason {
    OK,
    ORDER_NOT_ACTIVE,
    ORDER_EXPIRED,
    NOT_YET_VALID,
    MARKET_CLOSED,
    MARKET_UNKNOWN,
    CONDITION_SOURCE_UNAVAILABLE,
    CONDITION_REPORT_STALE,
    CONDITION_TIER_NOT_AUTHORIZED,
    ASSET_NOT_SUPPORTED,
    ASSET_HALTED,
    CORPORATE_ACTION_WINDOW,
    ASSET_NOT_AVAILABLE,
    WRAPPER_MISMATCH,
    REGISTRY_REVISION_CHANGED,
    NO_ROUTE,
    ROUTER_UNAPPROVED,
    APPROVE_TARGET_UNAPPROVED,
    QUOTE_STALE,
    MIN_OUTPUT,
    INSUFFICIENT_RESERVED_BALANCE,
    EXECUTION_POSTCONDITION,
    SYSTEM_PAUSED
}

/// @notice Immutable user intent. Nothing here may be mutated after creation; the keeper,
/// the operator and the admin all lack any path that rewrites these fields.
struct Order {
    bytes32 id;
    address owner;
    address vault;
    address inputToken;
    bytes32 assetId;
    address receiver;
    TriggerType triggerType;
    uint256 amountIn;
    uint256 minAmountOut;
    uint32 maxSlippageBps;
    uint32 maxReferenceDeviationBps;
    uint64 createdAt;
    uint64 validAfter;
    uint64 expiresAt;
    /// @dev Lowest source tier this order will accept. A tier numerically greater than this
    /// is weaker and is refused, which is how "no silent downgrade" (INV-16) is enforced.
    SourceTier minSourceTier;
    bytes32 assetRegistryRevision;
    /// @dev Non-zero only for occurrences belonging to a recurring instruction.
    bytes32 recurringId;
    uint32 occurrenceIndex;
    OrderStatus status;
}

/// @notice A condition observation, produced by a source and consumed by the order manager.
struct ConditionObservation {
    MarketStatus marketStatus;
    SourceTier tier;
    /// @dev Timestamp the SOURCE attributes to the observation, not when we read it.
    uint64 observedAt;
    bytes32 sourceId;
    bytes32 observationHash;
    bool valid;
}
