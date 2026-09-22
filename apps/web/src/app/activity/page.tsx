import {ActivityClient} from "@/components/ActivityClient";
import {REGISTRY} from "@/lib/server";

export default function ActivityPage() {
  return (
    <section className="section">
      <h1>Activity</h1>
      <p className="lede">
        What has happened to your money and your orders, in order. Each entry expands into
        the underlying on-chain detail.
      </p>
      <ActivityClient
        assets={REGISTRY.assets.map((a) => ({assetId: a.assetId, underlyingSymbol: a.underlyingSymbol}))}
        stables={Object.values(REGISTRY.stables)}
      />
    </section>
  );
}
