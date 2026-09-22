import {keccak256, toHex} from "viem";
import {MarketStatus, SourceTier} from "@bespeak/shared";
import {fetchAllAssets, xLayerDeployment, XSTOCKS_API_BASE, type XStocksAsset} from "@bespeak/assets";

/// A market-session observation, before it is signed.
export interface SessionObservation {
  assetSymbol: string;
  marketStatus: MarketStatus;
  tier: SourceTier;
  /// When the SOURCE considers this observation to have been made, in unix seconds.
  observedAt: number;
  sourceId: `0x${string}`;
  /// Hash over the exact source payload the conclusion was drawn from, so a receipt can be
  /// checked against what the issuer actually published.
  payloadHash: `0x${string}`;
  halted: boolean;
  /// Raw issuer fields, kept for the receipt and for debugging a disputed observation.
  raw: {
    currentPeriod: string;
    openNow: boolean;
    tradingHoursMode: string;
    nextChangeAt: string;
    exchangeMic: string;
    exchangeTimezone: string;
  };
}

/// Identifier of the Tier 3 source, recorded on chain and in every receipt.
export const XSTOCKS_SESSION_SOURCE_ID = keccak256(
  toHex("xstocks.fi/api/v2/public/assets"),
) as `0x${string}`;

/// Map the issuer's trading period onto Bespeak's market status.
///
/// The mapping is deliberately conservative. `NEXT_REGULAR_SESSION` means the underlying's
/// regular cash session, so only "market" qualifies. "extended" and "overnight" are real
/// trading windows for a 24/5 token, but they are not the regular session the user asked
/// for, and anything unrecognised becomes UNKNOWN rather than being guessed at.
export function mapPeriodToStatus(currentPeriod: string | undefined): MarketStatus {
  switch ((currentPeriod ?? "").toLowerCase()) {
    case "market":
      return MarketStatus.REGULAR;
    case "extended":
      return MarketStatus.PRE_MARKET;
    case "overnight":
      return MarketStatus.POST_MARKET;
    case "closed":
      return MarketStatus.CLOSED;
    default:
      return MarketStatus.UNKNOWN;
  }
}

/// "extended" covers both pre- and post-market. Disambiguate using exchange-local time, so
/// the receipt records which side of the session it was. Neither value is ever eligible for
/// a regular-session order, so a wrong guess here cannot cause an execution; it only
/// affects how the hold is described.
export function refineExtended(status: MarketStatus, timezone: string, at: Date): MarketStatus {
  if (status !== MarketStatus.PRE_MARKET) return status;
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "America/New_York",
        hour: "2-digit",
        hour12: false,
      }).format(at),
    );
    return hour < 12 ? MarketStatus.PRE_MARKET : MarketStatus.POST_MARKET;
  } catch {
    return status;
  }
}

export function observeFromAsset(asset: XStocksAsset, now = new Date()): SessionObservation {
  const t = asset.trading;
  const payload = JSON.stringify({
    symbol: asset.symbol,
    isTradingHalted: asset.isTradingHalted,
    trading: t,
  });

  const base = mapPeriodToStatus(t?.currentPeriod);
  const status = refineExtended(base, t?.exchange.timezone ?? "America/New_York", now);

  return {
    assetSymbol: asset.symbol,
    marketStatus: status,
    tier: SourceTier.ATTESTED_SESSION,
    observedAt: Math.floor(now.getTime() / 1000),
    sourceId: XSTOCKS_SESSION_SOURCE_ID,
    payloadHash: keccak256(toHex(payload)),
    halted: Boolean(asset.isTradingHalted || t?.isTradingHalted),
    raw: {
      currentPeriod: t?.currentPeriod ?? "",
      openNow: Boolean(t?.openNow),
      tradingHoursMode: t?.tradingHoursMode ?? "",
      nextChangeAt: t?.nextChangeAt ?? "",
      exchangeMic: t?.exchange.mic ?? "",
      exchangeTimezone: t?.exchange.timezone ?? "",
    },
  };
}

/// Fetch current session state for a set of symbols in one pass over the catalogue.
export async function observeSessions(symbols: string[]): Promise<Map<string, SessionObservation>> {
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  const catalogue = await fetchAllAssets();
  const now = new Date();
  const out = new Map<string, SessionObservation>();

  for (const a of catalogue) {
    if (!wanted.has(a.symbol.toUpperCase())) continue;
    if (!xLayerDeployment(a)) continue;
    out.set(a.symbol, observeFromAsset(a, now));
  }
  return out;
}

export const SESSION_SOURCE_URI = `${XSTOCKS_API_BASE}/public/assets`;
