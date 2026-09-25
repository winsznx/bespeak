import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY, observeSessionsWithin} from "@/lib/server";
import {Suspense} from "react";
import {MarketsClient} from "@/components/app/MarketsClient";
import {MarketsSkeleton} from "@/components/app/MarketsSkeleton";

import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Markets",
  description:
    "Official xStocks Bespeak can execute on X Layer, each verified on chain, with the executable payment pair and route liquidity for every asset.",
  alternates: {canonical: "/markets"},
};

export const revalidate = 20;

export default async function MarketsPage() {
  const symbols = REGISTRY.assets.map((a) => a.symbol);
  let sessions = new Map<string, SessionObservation>();
  let sourceReachable = true;
  try {
    sessions = await observeSessionsWithin(observeSessions(symbols));
  } catch {
    sourceReachable = false;
  }

  return (
    <Suspense fallback={<MarketsSkeleton />}>
    <MarketsClient
      sourceReachable={sourceReachable}
      registry={{
        sourceUri: REGISTRY.sourceUri,
        sourceRevision: REGISTRY.sourceRevision,
        sourceFetchedAt: REGISTRY.sourceFetchedAt,
        catalogueSize: REGISTRY.catalogueSize,
        chainId: REGISTRY.chainId,
      }}
      rows={REGISTRY.assets.map((a) => {
        const s = sessions.get(a.symbol);
        return {
          assetId: a.assetId,
          symbol: a.symbol,
          underlyingSymbol: a.underlyingSymbol,
          name: a.name.replace(" xStock", ""),
          open: s?.marketStatus === MarketStatus.REGULAR,
          halted: Boolean(s?.halted),
          sessionLabel: label(s?.marketStatus),
          payWith: a.route?.quoteSymbol ?? null,
          depth: a.route?.quoteDepth ?? null,
          pool: a.route?.pool ?? null,
          feeTier: a.route?.feeTier ?? null,
          verified: a.onchainVerified,
        };
      })}
    />
    </Suspense>
  );
}

function label(status: number | undefined): string {
  switch (status) {
    case MarketStatus.REGULAR:
      return "Open";
    case MarketStatus.CLOSED:
      return "Closed";
    case MarketStatus.PRE_MARKET:
      return "Pre-market";
    case MarketStatus.POST_MARKET:
      return "After hours";
    default:
      return "Unknown";
  }
}
