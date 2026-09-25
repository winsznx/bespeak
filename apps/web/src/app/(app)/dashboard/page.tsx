import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY, deployment, observeSessionsWithin} from "@/lib/server";
import {nextRegularSessionOpen, formatUtcShort} from "@/lib/format";
import {DashboardClient} from "@/components/app/DashboardClient";

import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Overview",
  robots: {index: false, follow: false},
};

export const revalidate = 20;

/// Overview. Server-renders the market facts that do not depend on a wallet, and hands the
/// wallet-dependent modules to the client so they can show real skeletons rather than
/// blocking the whole page on a connection that may never happen.
export default async function DashboardPage() {
  const symbols = REGISTRY.assets.map((a) => a.symbol);

  // Everything on this page except the open-now markers comes from the pinned manifest and
  // is already in memory. The issuer read is the only slow part, and awaiting it held the
  // entire page behind loading.tsx for ten seconds on a cold isolate — a first visit to the
  // product looked like a page that never finished loading.
  //
  // It is raced against a short deadline instead. A warm catalogue wins easily and the
  // markers appear; a cold one loses and the page renders without them rather than not at
  // all. Showing the shell without a marker is a smaller lie than showing nothing.
  const sessions = await observeSessionsWithin(observeSessions(symbols));

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
