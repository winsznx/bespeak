import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY, deployment} from "@/lib/server";
import {nextRegularSessionOpen, formatUtcShort} from "@/lib/format";
import {DashboardClient} from "@/components/app/DashboardClient";

export const revalidate = 20;

/// Overview. Server-renders the market facts that do not depend on a wallet, and hands the
/// wallet-dependent modules to the client so they can show real skeletons rather than
/// blocking the whole page on a connection that may never happen.
export default async function DashboardPage() {
  const symbols = REGISTRY.assets.map((a) => a.symbol);
  let sessions = new Map<string, SessionObservation>();
  try {
    sessions = await observeSessions(symbols);
  } catch {
    // Unreachable issuer reads as unknown, which is the correct execution answer too.
  }

  const openNow = REGISTRY.assets
    .filter((a) => sessions.get(a.symbol)?.marketStatus === MarketStatus.REGULAR)
    .map((a) => a.underlyingSymbol);

  const nextOpen = nextRegularSessionOpen();

  return (
    <DashboardClient
      deployed={deployment() !== null}
      assets={[...REGISTRY.assets]
        .sort((a, b) => (b.route?.quoteDepth ?? 0) - (a.route?.quoteDepth ?? 0))
        .map((a) => ({
        assetId: a.assetId,
        symbol: a.symbol,
        underlyingSymbol: a.underlyingSymbol,
        name: a.name.replace(" xStock", ""),
          payWith: a.route?.quoteSymbol ?? null,
        }))}
      stables={Object.values(REGISTRY.stables)}
      openNow={openNow}
      nextOpenIso={nextOpen.toISOString()}
      nextOpenLabel={formatUtcShort(nextOpen)}
    />
  );
}
