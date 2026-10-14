import Link from "next/link";
import {notFound} from "next/navigation";
import {getOrder, REGISTRY, deployment, OrderStatus, TriggerType} from "@/lib/server";
import {formatAmount} from "@/lib/format";
import {loadReceipt} from "@/lib/receipts";
import {ReceiptView} from "@/components/ReceiptView";
import {ReceiptFromStore} from "@/components/ReceiptFromStore";
import {TradeCardExport} from "@/components/app/TradeCardExport";
import {tradeCardFromReceipt} from "@/lib/tradeCardFrom";

export const dynamic = "force-dynamic";

/// The receipt answers, in order, what a person actually asks: what happened, did my
/// condition hold, what did I spend, what did I receive, where is it. Routers, tiers,
/// block numbers and hashes are kept — one layer down, where they belong.
export default async function ReceiptPage({params}: {params: Promise<{orderId: string}>}) {
  const {orderId} = await params;
  if (!deployment()) notFound();

  const order = await getOrder(orderId as `0x${string}`);
  if (!order) notFound();

  const asset = REGISTRY.assets.find(
    (a) => a.assetId.toLowerCase() === order.assetId.toLowerCase(),
  );
  const stable = Object.values(REGISTRY.stables).find(
    (s) => s.address.toLowerCase() === order.inputToken.toLowerCase(),
  );
  const receipt = await loadReceipt(orderId);

  if (order.status !== OrderStatus.FILLED) {
    return (
      <section style={{maxWidth: 560}}>
        <h1 className="t-h2" style={{marginBottom: 8}}>{headingFor(order.status)}</h1>
        <p className="t-body muted prose" style={{marginBottom: 28}}>
          ${formatAmount(order.amountIn, stable?.decimals ?? 6)} of {asset?.underlyingSymbol}.{" "}
          {order.status === OrderStatus.ACTIVE
            ? "This order has not executed yet."
            : "Your funds were returned to your vault."}
        </p>
        <Link href="/orders" className="btn">
          Back to orders
        </Link>
      </section>
    );
  }

  // A sell spends the asset and receives the stablecoin, so input and output are the
  // reverse of a buy's. `stable` is resolved from inputToken, which on a sell is the asset
  // and therefore resolves to nothing: the proceeds token comes from the order instead.
  const selling = order.side === 1;
  const proceeds = Object.values(REGISTRY.stables).find(
    (s) => s.address.toLowerCase() === (order.outputToken ?? "").toLowerCase(),
  );
  const assetSide = {
    symbol: asset?.wrapper ? `w${asset.symbol}` : (asset?.symbol ?? ""),
    decimals: asset?.wrapper ? (asset.wrapperDecimals ?? 18) : (asset?.underlyingDecimals ?? 18),
  };
  const stableSide = {
    symbol: (selling ? proceeds?.symbol : stable?.symbol) ?? "",
    decimals: (selling ? proceeds?.decimals : stable?.decimals) ?? 6,
  };

  const viewProps = {
    symbol: asset?.symbol ?? "",
    underlyingSymbol: asset?.underlyingSymbol ?? "",
    assetName: asset?.name.replace(" xStock", "") ?? "",
    inputSymbol: selling ? assetSide.symbol : stableSide.symbol,
    inputDecimals: selling ? assetSide.decimals : stableSide.decimals,
    outputSymbol: selling ? stableSide.symbol : assetSide.symbol,
    outputDecimals: selling ? stableSide.decimals : assetSide.decimals,
    receiver: order.receiver,
    conditionLabel: conditionLabel(order.triggerType),
    selling,
  };

  // A receipt the server could not find is looked up from the store in the browser, which
  // is the only place the binding is reachable. Without this a brand new order always read
  // as unconfirmed, whatever the chain said.
  // A sell spends the asset and receives the stablecoin, so the card's input and output
  // sides are the reverse of a buy's. Taken from the order rather than assumed.
  // viewProps already carries the correct sides, so the card reuses them directly.
  const cardCtx = {
    symbol: viewProps.symbol,
    underlying: viewProps.underlyingSymbol,
    assetName: viewProps.assetName,
    inputSymbol: viewProps.inputSymbol,
    inputDecimals: viewProps.inputDecimals,
    outputSymbol: viewProps.outputSymbol,
    outputDecimals: viewProps.outputDecimals,
  };

  return (
    <section style={{maxWidth: 660}}>
      {receipt ? (
        <>
          <ReceiptView receipt={receipt} {...viewProps} />
          <div style={{marginTop: 20}}>
            <TradeCardExport data={tradeCardFromReceipt(receipt, cardCtx)} />
          </div>
        </>
      ) : (
        <ReceiptFromStore orderId={orderId} cardContext={cardCtx} {...viewProps} />
      )}
    </section>
  );
}

function headingFor(status: number): string {
  if (status === OrderStatus.CANCELLED) return "Order cancelled";
  if (status === OrderStatus.EXPIRED) return "Order expired";
  return "Order still waiting";
}

function conditionLabel(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Bought immediately";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "Regular session";
  return "On availability";
}
