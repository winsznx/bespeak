import Link from "next/link";
import {explorerTx} from "@bespeak/shared";
import {formatAmount, formatUtc} from "@/lib/format";
import type {StoredReceipt} from "@/lib/receipts";

export interface ReceiptViewProps {
  receipt: StoredReceipt | null;
  underlyingSymbol: string;
  assetName: string;
  inputSymbol: string;
  inputDecimals: number;
  outputSymbol: string;
  outputDecimals: number;
  receiver: string;
  conditionLabel: string;
}

/// The receipt, as a presentational component so the real page and the design preview
/// render byte-identical markup. A preview that drifts from the product is worse than none.
export function ReceiptView(p: ReceiptViewProps) {
  const {receipt} = p;
  const verified = receipt?.finalOutcomeStatus === "VERIFIED_FILLED";

  return (
    <>
      <div className="settle">
        <div className="row gap-12 mb-24">
          <Seal verified={verified} />
          <div>
            <h1 style={{marginBottom: 2}}>
              {verified ? "Purchase complete" : "Execution recorded"}
            </h1>
            <div className="tiny faint">{p.assetName}</div>
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
            <div style={{padding: "24px 24px 24px 0"}}>
              <div className="overline mb-8">Spent</div>
              <div className="figure">
                ${formatAmount(BigInt(receipt.actualInputSpent), p.inputDecimals)}
              </div>
              <div className="tiny faint mt-4">{p.inputSymbol}</div>
            </div>
            <div style={{padding: "24px 0"}}>
              <div className="overline mb-8">Received</div>
              <div className="figure" style={{color: "var(--filled)"}}>
                {formatAmount(BigInt(receipt.actualOutputReceived), p.outputDecimals, 6)}
              </div>
              <div className="tiny faint mt-4">{p.outputSymbol}</div>
            </div>
          </div>
        ) : (
          <p className="note mb-24">
            This order is recorded as filled on chain. The verification record is not
            available on this server.
          </p>
        )}

        <div className="mt-24 mb-24">
          {verified ? (
            <div className="row gap-8" style={{color: "var(--filled)"}}>
              <Tick />
              <span className="small strong">Executed under your requested condition</span>
            </div>
          ) : (
            <div className="note note-waiting">
              <strong>{humanOutcome(receipt?.finalOutcomeStatus)}</strong>
              <br />
              The transaction was included, but Bespeak could not independently confirm every
              expected consequence. It is deliberately not shown as complete.
            </div>
          )}
          <div className="small muted mt-8">
            {p.conditionLabel}
            {receipt?.transactionSubmittedAt && (
              <> · {formatUtc(new Date(receipt.transactionSubmittedAt))}</>
            )}
          </div>
        </div>

        <div className="quiet mb-24">
          <div className="overline mb-4">Delivered to your wallet</div>
          <div className="mono">{p.receiver}</div>
        </div>

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
      </div>

      {receipt && (
        <div className="mt-32">
          <details className="tech">
            <summary>Verify execution</summary>
            <div style={{paddingBottom: 24}}>
              <p className="body-2 prose mb-16" style={{marginTop: 0}}>
                Bespeak re-read X Layer through a different connection than the one used to
                send the transaction, and checked each of these independently.
              </p>
              <table className="table mb-24">
                <tbody>
                  {receipt.verificationChecks.map((c) => (
                    <tr key={c.name}>
                      <td style={{width: 22, color: c.passed ? "var(--filled)" : "var(--failed)"}}>
                        {c.passed ? "✓" : "✗"}
                      </td>
                      <td className="small">{c.name}</td>
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
                <dt>Receipt id</dt>
                <dd className="mono">{receipt.receiptId}</dd>
              </dl>
            </div>
          </details>

          <details className="tech">
            <summary>Market condition and its limitations</summary>
            <div style={{paddingBottom: 24}}>
              <dl className="kv mb-16">
                <dt>Source</dt>
                <dd className="mono">{receipt.conditionSource}</dd>
                <dt>Trust tier</dt>
                <dd>{receipt.conditionSourceTier}</dd>
                <dt>Reported session</dt>
                <dd>{receipt.marketStatus}</dd>
                <dt>Observed at</dt>
                <dd className="mono">{receipt.conditionObservationTimestamp ?? "n/a"}</dd>
              </dl>
              <ul className="tiny muted prose" style={{margin: 0, paddingLeft: 18}}>
                {receipt.limitations.map((l) => (
                  <li key={l} style={{marginBottom: 8}}>
                    {l}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      )}

      <div className="mt-24">
        <Link href="/orders" className="tiny muted">
          &larr; Back to orders
        </Link>
      </div>
    </>
  );
}

function Seal({verified}: {verified: boolean}) {
  if (!verified) {
    return (
      <span style={{width: 44, height: 44, flex: "none", display: "grid", placeItems: "center"}}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
          <circle cx="22" cy="22" r="21" fill="var(--waiting-soft)" stroke="var(--waiting-line)" />
          <path d="M22 13v11" stroke="var(--waiting)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="22" cy="30" r="1.5" fill="var(--waiting)" />
        </svg>
      </span>
    );
  }
  return (
    <span style={{width: 44, height: 44, flex: "none", display: "grid", placeItems: "center"}}>
      <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="check-draw">
        <circle cx="22" cy="22" r="21" fill="var(--filled-soft)" stroke="var(--filled-line)" />
        <path
          d="M14 22.4l5.4 5.4L30.6 16.6"
          stroke="var(--filled)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Tick() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
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
