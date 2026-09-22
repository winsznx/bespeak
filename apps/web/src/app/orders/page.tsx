import {OrdersClient} from "@/components/OrdersClient";
import {REGISTRY} from "@/lib/server";

export default function OrdersPage() {
  return (
    <section style={{paddingTop: 48, paddingBottom: 24}}>
      <h1 className="mb-8">Orders</h1>
      <p className="lede mb-32">
        Your standing instructions. Anything still waiting says what it is waiting for, and
        you can take the funds back at any time.
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
