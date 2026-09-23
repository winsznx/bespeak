import Link from "next/link";
import {explorerTx} from "@bespeak/shared";
import {formatAmount, formatUtc} from "@/lib/format";
import type {StoredReceipt} from "@/lib/receipts";
import {AssetIdentity, TokenIdentity} from "./identity";

export interface ReceiptViewProps {
  receipt: StoredReceipt | null;
  symbol: string;
  underlyingSymbol: string;
  assetName: string;
  inputSymbol: string;
  inputDecimals: number;
  outputSymbol: string;
  outputDecimals: number;
  receiver: string;
  conditionLabel: string;
}

/// The completion surface.
///
/// It answers, in order, what a person actually asks: what happened, did my condition hold,
/// what did I spend, what did I receive, and where is it. Routers, tiers, blocks and hashes
/// are all kept — one layer down, under "Verify execution".
export function ReceiptView(p: ReceiptViewProps) {
  const {receipt} = p;
  const verified = receipt?.finalOutcomeStatus === "VERIFIED_FILLED";

  return (
    <>
      <div className="settle">
        <div className="row g4" style={{marginBottom: 28}}>
          <Seal verified={verified} />
          <div style={{minWidth: 0}}>
            <h1 className="t-h1" style={{fontSize: "clamp(26px,3.2vw,38px)", marginBottom: 6}}>
              {verified ? "Purchase complete" : "Execution recorded"}
            </h1>
            <AssetIdentity
              symbol={p.symbol}
              underlyingSymbol={p.underlyingSymbol}
              variant="compact"
              sub={p.assetName}
            />
          </div>
        </div>

        {receipt ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{padding: "26px 26px 26px 0"}}>
              <div className="t-label" style={{marginBottom: 9}}>
                Spent
              </div>
              <div className="t-figure">
                ${formatAmount(BigInt(receipt.actualInputSpent), p.inputDecimals)}
              </div>
              <div style={{marginTop: 8}}>
                <TokenIdentity symbol={p.inputSymbol} size="xs" muted />
              </div>
            </div>
            <div style={{padding: "26px 0 26px 26px", borderLeft: "1px solid var(--line)"}}>
              <div className="t-label" style={{marginBottom: 9}}>
                Received
              </div>
              <div className="t-figure" style={{color: "var(--success)"}}>
                {formatAmount(BigInt(receipt.actualOutputReceived), p.outputDecimals, 6)}
              </div>
              <div className="t-xs faint" style={{marginTop: 5}}>
                {p.outputSymbol}
              </div>
            </div>
          </div>
        ) : (
          <p className="t-sm muted prose" style={{margin: "0 0 24px"}}>
            This order is recorded as filled on chain. The independent verification record is
            not available on this server.
          </p>
        )}

        <div style={{margin: "26px 0"}}>
          {verified ? (
            <div className="row g2" style={{color: "var(--success)"}}>
              <Tick />
              <span className="t-body" style={{fontWeight: 500}}>
                Verified under your requested condition
              </span>
            </div>
          ) : (
            <div
              style={{
                borderRadius: "var(--r-control)",
                background: "var(--waiting-soft)",
                border: "1px solid var(--waiting-line)",
                padding: "14px 16px",
              }}
            >
              <div className="t-h4" style={{color: "var(--waiting)", marginBottom: 4}}>
                {humanOutcome(receipt?.finalOutcomeStatus)}
              </div>
              <p className="t-sm prose" style={{margin: 0, color: "var(--waiting)"}}>
                The transaction was included, but Bespeak could not independently confirm every
                expected consequence. It is deliberately not shown as complete.
              </p>
            </div>
          )}
          <div className="t-sm muted" style={{marginTop: 8}}>
            {p.conditionLabel}
            {receipt?.transactionSubmittedAt && (
              <> · {formatUtc(new Date(receipt.transactionSubmittedAt))}</>
            )}
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            borderRadius: "var(--r-control)",
            padding: "16px 18px",
            marginBottom: 24,
          }}
        >
          <div className="t-label" style={{marginBottom: 6}}>
            Delivered to your wallet
          </div>
          <div className="mono">{p.receiver}</div>
        </div>

        <div className="row wrap g2">
          {receipt?.transactionHash && (
            <a
              className="btn"
              href={explorerTx(receipt.transactionHash)}
              target="_blank"
              rel="noreferrer"
            >
              View on X Layer explorer
            </a>
          )}
          <Link href="/orders" className="btn btn-quiet">
            Back to orders
          </Link>
        </div>
      </div>

      {receipt && (
        <div style={{marginTop: 34}}>
          <details className="tech">
            <summary>Verify execution</summary>
            <div style={{paddingBottom: 26}}>
              <p className="t-sm muted prose" style={{marginTop: 0, marginBottom: 18}}>
                Bespeak re-read X Layer through a different connection than the one used to
                send the transaction, and checked each of these independently.
              </p>
              <table className="table" style={{marginBottom: 24}}>
                <tbody>
                  {receipt.verificationChecks.map((c) => (
                    <tr key={c.name}>
                      <td style={{width: 24, color: c.passed ? "var(--success)" : "var(--danger)"}}>
                        {c.passed ? "✓" : "✗"}
                      </td>
                      <td className="t-sm">{c.name}</td>
                      <td className="num mono">{c.observed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <dl className="kv">
                <dt>Broadcast through</dt>
                <dd className="mono">{receipt.broadcastSource}</dd>
                <dt>Verified through</dt>
                <dd className="mono">{receipt.verificationSource}</dd>
                <dt>Confirmations</dt>
                <dd>{receipt.confirmations}</dd>
                <dt>Block</dt>
                <dd className="mono">{receipt.blockNumber}</dd>
                <dt>Router</dt>
                <dd className="mono">{receipt.routerAddress ?? "n/a"}</dd>
                <dt>Approval target</dt>
                <dd className="mono">{receipt.approvalTarget ?? "n/a"}</dd>
                <dt>Receipt id</dt>
                <dd className="mono">{receipt.receiptId}</dd>
              </dl>
            </div>
          </details>

          <details className="tech">
            <summary>Market condition and its limitations</summary>
            <div style={{paddingBottom: 26}}>
              <dl className="kv" style={{marginBottom: 18}}>
                <dt>Source</dt>
                <dd className="mono">{receipt.conditionSource}</dd>
                <dt>Trust tier</dt>
                <dd>{receipt.conditionSourceTier}</dd>
                <dt>Reported session</dt>
                <dd>{receipt.marketStatus}</dd>
                <dt>Observed at</dt>
                <dd className="mono">{receipt.conditionObservationTimestamp ?? "n/a"}</dd>
                <dt>Source payload hash</dt>
                <dd className="mono">{receipt.conditionSourcePayloadHash ?? "n/a"}</dd>
              </dl>
              <ul className="t-sm muted prose" style={{margin: 0, paddingLeft: 18}}>
                {receipt.limitations.map((l) => (
                  <li key={l} style={{marginBottom: 8}}>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </details>

          <details className="tech">
            <summary>Machine-readable receipt</summary>
            <pre
              className="mono"
              style={{
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                background: "var(--surface-2)",
                borderRadius: "var(--r-control)",
                padding: 16,
                marginBottom: 26,
              }}
            >
              {JSON.stringify(receipt, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </>
  );
}

function Seal({verified}: {verified: boolean}) {
  const size = 52;
  if (!verified) {
    return (
      <span style={{width: size, height: size, flex: "none", display: "grid", placeItems: "center"}}>
        <svg width={size} height={size} viewBox="0 0 52 52" fill="none">
          <circle cx="26" cy="26" r="25" fill="var(--waiting-soft)" stroke="var(--waiting-line)" />
          <path d="M26 15v13" stroke="var(--waiting)" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="26" cy="35" r="1.8" fill="var(--waiting)" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{width: size, height: size, flex: "none", display: "grid", placeItems: "center"}}>
      <svg width={size} height={size} viewBox="0 0 52 52" fill="none" className="draw">
        <circle cx="26" cy="26" r="25" fill="var(--success-soft)" stroke="var(--success-line)" />
        <path
          d="M17 26.6l6.3 6.3L36 20.2"
          stroke="var(--success)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M3 8.4l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function humanOutcome(status: string | undefined): string {
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
