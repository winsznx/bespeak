import {notFound} from "next/navigation";
import {getOrder, REGISTRY, deployment, OrderStatus, TriggerType} from "@/lib/server";
import {formatAmount, formatUtc} from "@/lib/format";
import {explorerTx} from "@bespeak/shared";
import {loadReceipt} from "@/lib/receipts";

export const dynamic = "force-dynamic";

/// The consumer receipt. A short, plain statement of what happened, with the full
/// machine-readable record folded underneath it rather than replacing it (PRD 35).
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

  const filled = order.status === OrderStatus.FILLED;
  const verified = receipt?.finalOutcomeStatus === "VERIFIED_FILLED";

  return (
    <section className="section">
      <div className="card" style={{maxWidth: 620, margin: "0 auto"}}>
        {filled ? (
          <>
            <h1 style={{marginBottom: 4}}>{asset?.underlyingSymbol ?? "Asset"} bought</h1>
            <div style={{fontSize: 15, marginBottom: 16}} className="muted">
              {receipt ? (
                <>
                  {formatAmount(BigInt(receipt.actualInputSpent), stable?.decimals ?? 6)}{" "}
                  {stable?.symbol} spent
                  <br />
                  {formatAmount(
                    BigInt(receipt.actualOutputReceived),
                    asset?.wrapper ? (asset.wrapperDecimals ?? 18) : (asset?.underlyingDecimals ?? 18),
                  )}{" "}
                  {asset?.wrapper ? `w${asset.symbol}` : asset?.symbol} received
                </>
              ) : (
                <>
                  Up to {formatAmount(order.amountIn, stable?.decimals ?? 6)} {stable?.symbol}{" "}
                  reserved
                </>
              )}
            </div>

            {verified ? (
              <div className="pill pill-done" style={{marginBottom: 16}}>
                <span className="dot" />
                Verified on X Layer
              </div>
            ) : receipt ? (
              <div className="notice notice-wait" style={{marginBottom: 16}}>
                <strong>{humanOutcome(receipt.finalOutcomeStatus)}</strong>
                <br />
                The transaction was included, but Bespeak has not been able to independently
                confirm every expected consequence. This is deliberately not shown as
                completed.
              </div>
            ) : (
              <div className="notice" style={{marginBottom: 16}}>
                The order is recorded as filled on chain. The independent verification record
                is not available on this server.
              </div>
            )}
          </>
        ) : (
          <>
            <h1 style={{marginBottom: 4}}>{statusHeading(order.status)}</h1>
            <p className="muted" style={{marginTop: 0}}>
              {formatAmount(order.amountIn, stable?.decimals ?? 6)} {stable?.symbol} for{" "}
              {asset?.underlyingSymbol}
            </p>
          </>
        )}

        <dl className="kv" style={{marginTop: 20}}>
          <dt>Condition</dt>
          <dd style={{fontFamily: "inherit", fontSize: 13}}>
            {triggerLabel(order.triggerType)}
          </dd>
          {receipt && (
            <>
              <dt>Executed</dt>
              <dd style={{fontFamily: "inherit", fontSize: 13}}>
                {formatUtc(new Date(receipt.transactionSubmittedAt))}
              </dd>
            </>
          )}
          <dt>Delivered to</dt>
          <dd>{order.receiver}</dd>
        </dl>

        {receipt?.transactionHash && (
          <a
            className="btn btn-sm"
            style={{marginTop: 16}}
            href={explorerTx(receipt.transactionHash)}
            target="_blank"
            rel="noreferrer"
          >
            View on OKLink
          </a>
        )}
      </div>

      {receipt && (
        <div style={{maxWidth: 620, margin: "16px auto 0"}}>
          <details className="tech">
            <summary>How this was verified</summary>
            <div className="card" style={{marginTop: 8}}>
              <p className="small muted" style={{marginTop: 0}}>
                Bespeak re-read X Layer through a different connection than the one used to
                send the transaction, and checked each of the following independently.
              </p>
              <table className="table">
                <tbody>
                  {receipt.verificationChecks.map((c) => (
                    <tr key={c.name}>
                      <td style={{width: 24}}>{c.passed ? "✓" : "✗"}</td>
                      <td className="small">{c.name}</td>
                      <td className="num mono">{c.observed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="kv" style={{marginTop: 12}}>
                <dt>Broadcast through</dt>
                <dd>{receipt.broadcastSource}</dd>
                <dt>Verified through</dt>
                <dd>{receipt.verificationSource}</dd>
                <dt>Confirmations</dt>
                <dd>{receipt.confirmations}</dd>
                <dt>Block</dt>
                <dd>{receipt.blockNumber}</dd>
              </dl>
            </div>
          </details>

          <details className="tech">
            <summary>Market condition and its limitations</summary>
            <div className="card" style={{marginTop: 8}}>
              <dl className="kv">
                <dt>Source</dt>
                <dd>{receipt.conditionSource}</dd>
                <dt>Trust tier</dt>
                <dd>{receipt.conditionSourceTier}</dd>
                <dt>Reported session</dt>
                <dd>{receipt.marketStatus}</dd>
                <dt>Observed at</dt>
                <dd>{receipt.conditionObservationTimestamp ?? "n/a"}</dd>
                <dt>Source payload hash</dt>
                <dd>{receipt.conditionSourcePayloadHash ?? "n/a"}</dd>
              </dl>
              <ul className="small muted" style={{marginBottom: 0, paddingLeft: 18}}>
                {receipt.limitations.map((l) => (
                  <li key={l} style={{marginBottom: 6}}>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <details className="tech">
            <summary>Full machine-readable receipt</summary>
            <pre
              className="card mono"
              style={{marginTop: 8, overflowX: "auto", whiteSpace: "pre-wrap"}}
            >
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </section>
  );
}

function statusHeading(status: number): string {
  if (status === OrderStatus.CANCELLED) return "Order cancelled";
  if (status === OrderStatus.EXPIRED) return "Order expired";
  return "Order still waiting";
}

function triggerLabel(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Buy now";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "Next regular US session";
  return "When available on X Layer";
}

function humanOutcome(status: string): string {
  switch (status) {
    case "PARTIALLY_VERIFIED":
      return "Partially verified";
    case "VERIFICATION_TIMEOUT":
      return "Verification timed out";
    case "CONTRADICTED":
      return "Independent check disagreed";
    case "ROLLED_BACK":
      return "Rolled back by a chain reorganisation";
    default:
      return "Outcome not yet confirmed";
  }
}

