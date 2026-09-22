import {ActivityClient} from "@/components/ActivityClient";
import {REGISTRY} from "@/lib/server";

export default function ActivityPage() {
  return (
    <ActivityClient
      assets={REGISTRY.assets.map((a) => ({
        assetId: a.assetId,
        symbol: a.symbol,
        underlyingSymbol: a.underlyingSymbol,
      }))}
      stables={Object.values(REGISTRY.stables)}
    />
  );
}
