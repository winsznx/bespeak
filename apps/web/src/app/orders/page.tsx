import {OrdersClient} from "@/components/OrdersClient";
import {REGISTRY} from "@/lib/server";

export default function OrdersPage() {
  return (
    <section className="section">
      <h1>Orders</h1>
      <p className="lede">
        Everything you have asked Bespeak to do. An order that has not executed always says
        why, and you can cancel it and take the funds back at any time.
      </p>
      <OrdersClient
        assets={REGISTRY.assets.map((a) => ({
          assetId: a.assetId,
          symbol: a.symbol,
          underlyingSymbol: a.underlyingSymbol,
          name: a.name,
        }))}
        stables={Object.values(REGISTRY.stables)}
      />
    </section>
  );
}
