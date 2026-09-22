/// Mirrors the Solidity enums in contracts/src/BespeakTypes.sol. The numeric values are
/// load-bearing: they are what the contract actually stores and what the receipt records.

export const OrderStatus = {
  NONE: 0,
  ACTIVE: 1,
  FILLED: 2,
  CANCELLED: 3,
  EXPIRED: 4,
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const TriggerType = {
  IMMEDIATE: 0,
  NEXT_REGULAR_SESSION: 1,
  WHEN_AVAILABLE: 2,
} as const;
export type TriggerType = (typeof TriggerType)[keyof typeof TriggerType];

export const AssetStatus = {
  DISCOVERED: 0,
  SUPPORTED: 1,
  PAUSED: 2,
  DEPRECATED: 3,
  UNAVAILABLE: 4,
} as const;
export type AssetStatus = (typeof AssetStatus)[keyof typeof AssetStatus];

export const MarketStatus = {
  UNKNOWN: 0,
  CLOSED: 1,
  PRE_MARKET: 2,
  REGULAR: 3,
  POST_MARKET: 4,
} as const;
export type MarketStatus = (typeof MarketStatus)[keyof typeof MarketStatus];

export const SourceTier = {
  NONE: 0,
  VERIFIED_DATA_STREAMS: 1,
  SECONDARY_VERIFIED_ORACLE: 2,
  ATTESTED_SESSION: 3,
} as const;
export type SourceTier = (typeof SourceTier)[keyof typeof SourceTier];

/// Order of this list must match the Solidity `Reason` enum exactly; the index IS the
/// contract's return value.
export const REASONS = [
  "OK",
  "ORDER_NOT_ACTIVE",
  "ORDER_EXPIRED",
  "NOT_YET_VALID",
  "MARKET_CLOSED",
  "MARKET_UNKNOWN",
  "CONDITION_SOURCE_UNAVAILABLE",
  "CONDITION_REPORT_STALE",
  "CONDITION_TIER_NOT_AUTHORIZED",
  "ASSET_NOT_SUPPORTED",
  "ASSET_HALTED",
  "CORPORATE_ACTION_WINDOW",
  "ASSET_NOT_AVAILABLE",
  "WRAPPER_MISMATCH",
  "REGISTRY_REVISION_CHANGED",
  "NO_ROUTE",
  "ROUTER_UNAPPROVED",
  "APPROVE_TARGET_UNAPPROVED",
  "QUOTE_STALE",
  "MIN_OUTPUT",
  "INSUFFICIENT_RESERVED_BALANCE",
  "EXECUTION_POSTCONDITION",
  "SYSTEM_PAUSED",
] as const;
export type Reason = (typeof REASONS)[number];

export function reasonFromCode(code: number): Reason {
  return REASONS[code] ?? "OK";
}

/// Plain-language rendering of a hold. The UI shows these; the codes stay in the receipt.
export const REASON_COPY: Record<Reason, string> = {
  OK: "Ready to execute.",
  ORDER_NOT_ACTIVE: "This order is no longer active.",
  ORDER_EXPIRED: "The deadline passed before the condition was met.",
  NOT_YET_VALID: "This order has not reached its start time yet.",
  MARKET_CLOSED: "Waiting for the regular US market session to open.",
  MARKET_UNKNOWN: "We cannot currently confirm the market session, so we are not executing.",
  CONDITION_SOURCE_UNAVAILABLE: "The market data source is unreachable right now.",
  CONDITION_REPORT_STALE: "The latest market reading is too old to act on.",
  CONDITION_TIER_NOT_AUTHORIZED:
    "This order requires a stronger market-data source than is currently available.",
  ASSET_NOT_SUPPORTED: "This asset is not currently available for execution.",
  ASSET_HALTED: "Trading in the underlying stock is halted.",
  CORPORATE_ACTION_WINDOW: "Paused around a stock split or dividend adjustment.",
  ASSET_NOT_AVAILABLE: "Waiting for this asset to become tradable on X Layer.",
  WRAPPER_MISMATCH: "The asset's on-chain identity did not match our records.",
  REGISTRY_REVISION_CHANGED: "The asset record changed since this order was created.",
  NO_ROUTE: "No trading route is available at the moment.",
  ROUTER_UNAPPROVED: "The proposed trading route is not on our approved list.",
  APPROVE_TARGET_UNAPPROVED: "The proposed spending contract is not on our approved list.",
  QUOTE_STALE: "The price quote expired before we could execute.",
  MIN_OUTPUT: "The current price is outside the limit you set.",
  INSUFFICIENT_RESERVED_BALANCE: "Not enough funds are reserved for this order.",
  EXECUTION_POSTCONDITION: "The trade did not deliver what was required, so it was reverted.",
  SYSTEM_PAUSED: "Bespeak is paused.",
};
