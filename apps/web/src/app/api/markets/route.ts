import {NextResponse} from "next/server";
import {observeSessions} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY} from "@/lib/server";

export const revalidate = 15;

const NAME: Record<number, string> = {
  [MarketStatus.UNKNOWN]: "UNKNOWN",
  [MarketStatus.CLOSED]: "CLOSED",
  [MarketStatus.PRE_MARKET]: "PRE_MARKET",
  [MarketStatus.REGULAR]: "REGULAR",
  [MarketStatus.POST_MARKET]: "POST_MARKET",
};

/// GET /api/markets — live session state per supported asset.
///
/// `eligibleForRegularSession` is the single field that decides whether a
/// NEXT_REGULAR_SESSION order can execute right now, and it is true only for an
/// affirmative REGULAR reading on an unhalted asset.
export async function GET() {
  try {
    const sessions = await observeSessions(REGISTRY.assets.map((a) => a.symbol));
    return NextResponse.json({
      observedAt: new Date().toISOString(),
      conditionSource: "xstocks.fi/api/v2/public/assets",
      conditionSourceTier: "ATTESTED_SESSION",
      markets: REGISTRY.assets.map((a) => {
        const s = sessions.get(a.symbol);
        return {
          assetId: a.assetId,
          symbol: a.symbol,
          underlyingSymbol: a.underlyingSymbol,
          marketStatus: NAME[s?.marketStatus ?? MarketStatus.UNKNOWN],
          issuerPeriod: s?.raw.currentPeriod ?? null,
          halted: s?.halted ?? false,
          nextChangeAt: s?.raw.nextChangeAt ?? null,
          observedAt: s ? new Date(s.observedAt * 1000).toISOString() : null,
          sourcePayloadHash: s?.payloadHash ?? null,
          eligibleForRegularSession:
            s?.marketStatus === MarketStatus.REGULAR && !s.halted,
        };
      }),
    });
  } catch (e) {
    // An unreachable source is reported as such rather than defaulted to a session, because
    // a wrong default here is the difference between holding and spending.
    return NextResponse.json(
      {
        error: "CONDITION_SOURCE_UNAVAILABLE",
        detail: e instanceof Error ? e.message : String(e),
        observedAt: new Date().toISOString(),
      },
      {status: 503},
    );
  }
}
