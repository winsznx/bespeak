import {OrdersClient} from "@/components/OrdersClient";
import {REGISTRY} from "@/lib/server";
import {nextRegularSessionOpen, formatUtcShort} from "@/lib/format";

import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Orders",
  robots: {index: false, follow: false},
};

export default function OrdersPage() {
  const nextOpen = nextRegularSessionOpen();
  return (
    <OrdersClient
      nextOpenIso={nextOpen.toISOString()}
      nextOpenLabel={formatUtcShort(nextOpen)}
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
    />
  );
}
