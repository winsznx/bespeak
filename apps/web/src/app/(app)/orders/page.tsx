import {OrdersClient} from "@/components/OrdersClient";
import {REGISTRY} from "@/lib/server";

export default function OrdersPage() {
  return (
    <OrdersClient
      assets={REGISTRY.assets.map((a) => ({
        assetId: a.assetId,
        symbol: a.symbol,
        underlyingSymbol: a.underlyingSymbol,
        name: a.name.replace(" xStock", ""),
      }))}
      stables={Object.values(REGISTRY.stables)}
    />
  );
}
