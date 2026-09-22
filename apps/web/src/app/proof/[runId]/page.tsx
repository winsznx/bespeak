import Link from "next/link";
import {notFound} from "next/navigation";
import {explorerTx} from "@bespeak/shared";
import {loadReceiptById, listReceipts} from "@/lib/receipts";
import {REGISTRY} from "@/lib/server";
import {formatAmount} from "@/lib/format";

export const dynamic = "force-dynamic";

/// Compact judge-facing proof surface (PRD 77).
///
/// Secondary by design. It compresses one canonical run into something a reviewer can check
/// in a couple of minutes, and it is deliberately not the homepage: a normal user never
/// needs to come here, and the product has to stand up without it.
export default async function ProofPage({params}: {params: Promise<{runId: string}>}) {
  const {runId} = await params;
  const receipt = await loadReceiptById(runId);
  if (!receipt) {
    const all = await listReceipts();
    return (
      <section className="section">
        <h1>Proof</h1>
        <p className="lede">No run with that id.</p>
        {all.length > 0 && (
          <ul>
            {all.map((r) => (
              <li key={r.receiptId}>
                <Link href={`/proof/${r.receiptId}`} className="mono">
                  {r.receiptId}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const asset = REGISTRY.assets.find(
    (a) => a.symbol.toLowerCase() === String(receipt.assetSymbol ?? "").toLowerCase(),
  );
  const stable = Object.values(REGISTRY.stables).find(
    (s) => s.address.toLowerCase() === String(receipt.inputToken).toLowerCase(),
  );
  const failed = receipt.verificationChecks.filter((c) => !c.passed);

  return (
    <section className="section">
      <div className="between" style={{marginBottom: 6}}>
        <h1 style={{margin: 0}}>Run {runId.slice(0, 12)}</h1>
        <span className={receipt.finalOutcomeStatus === "VERIFIED_FILLED" ? "pill pill-done" : "pill pill-wait"}>
          {receipt.finalOutcomeStatus}
        </span>
      </div>
      <p className="lede">
        One end-to-end Bespeak execution on X Layer mainnet, from user instruction to
        independently verified delivery.
      </p>

      <Numbered n={1} title="User instruction">
        <dl className="kv">
          <dt>Trigger</dt>
          <dd>{String(receipt.triggerType)}</dd>
          <dt>Intent</dt>
          <dd>{String(receipt.conditionIntent)}</dd>
          <dt>Reserved</dt>
          <dd>
            {formatAmount(BigInt(receipt.amountReserved), stable?.decimals ?? 6)} {stable?.symbol}
          </dd>
          <dt>Receiver</dt>
          <dd>{String(receipt.receiver)}</dd>
        </dl>
      </Numbered>

      <Numbered n={2} title="Condition source and tier">
        <dl className="kv">
          <dt>Source</dt>
          <dd>{receipt.conditionSource}</dd>
          <dt>Tier</dt>
          <dd>{receipt.conditionSourceTier}</dd>
          <dt>Reported session</dt>
          <dd>{receipt.marketStatus}</dd>
          <dt>Observed at (UTC)</dt>
          <dd>{receipt.conditionObservationTimestamp ?? "n/a"}</dd>
          <dt>Source payload hash</dt>
          <dd>{receipt.conditionSourcePayloadHash ?? "n/a"}</dd>
        </dl>
      </Numbered>

      <Numbered n={3} title="Asset provenance">
        <dl className="kv">
          <dt>Asset</dt>
          <dd>{String(receipt.assetSymbol)}</dd>
          <dt>Underlying on X Layer</dt>
          <dd>{asset?.underlying ?? String(receipt.underlyingAddress)}</dd>
          <dt>Current wrapper</dt>
          <dd>{asset?.wrapper ?? "none"}</dd>
          <dt>Registry source</dt>
          <dd>{REGISTRY.sourceUri}</dd>
          <dt>Registry revision</dt>
          <dd>{REGISTRY.sourceRevision}</dd>
        </dl>
      </Numbered>

      <Numbered n={4} title="Execution on X Layer">
        <dl className="kv">
          <dt>Router</dt>
          <dd>{receipt.routerAddress ?? "n/a"}</dd>
          <dt>Approval target</dt>
          <dd>{receipt.approvalTarget ?? "n/a"}</dd>
          <dt>Transaction</dt>
          <dd>
            <a href={explorerTx(receipt.transactionHash)} target="_blank" rel="noreferrer">
              {receipt.transactionHash}
            </a>
          </dd>
          <dt>Block</dt>
          <dd>{receipt.blockNumber ?? "n/a"}</dd>
        </dl>
      </Numbered>

      <Numbered n={5} title="What actually moved">
        <dl className="kv">
          <dt>Input spent</dt>
          <dd>
            {formatAmount(BigInt(receipt.actualInputSpent), stable?.decimals ?? 6)} {stable?.symbol}
          </dd>
          <dt>Unused input released</dt>
          <dd>
            {formatAmount(BigInt(receipt.unusedInputReleased), stable?.decimals ?? 6)}{" "}
            {stable?.symbol}
          </dd>
          <dt>Output received</dt>
          <dd>{receipt.actualOutputReceived}</dd>
        </dl>
      </Numbered>

      <Numbered n={6} title="Independent verification">
        <p className="small muted" style={{marginTop: 0}}>
          Broadcast through <code>{receipt.broadcastSource}</code>, verified through{" "}
          <code>{receipt.verificationSource}</code>. The component that sent the transaction
          is not the one that declared the outcome.
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
        {failed.length > 0 && (
          <div className="notice notice-wait" style={{marginTop: 12}}>
            {failed.length} check(s) did not pass, which is why this run is{" "}
            {receipt.finalOutcomeStatus} and not VERIFIED_FILLED.
          </div>
        )}
      </Numbered>

      <Numbered n={7} title="Limitations">
        <ul className="small muted" style={{margin: 0, paddingLeft: 18}}>
          {receipt.limitations.map((l) => (
            <li key={l} style={{marginBottom: 6}}>
              {l}
            </li>
          ))}
        </ul>
      </Numbered>

      <Numbered n={8} title="Reproduce this">
        <p className="small muted" style={{marginTop: 0}}>
          Everything above is derivable from public chain state and a public API. Nothing
          here needs Bespeak&apos;s own server to be trusted.
        </p>
        <pre className="card mono" style={{overflowX: "auto"}}>
{`git clone <repo> && cd bespeak && pnpm install
pnpm --filter @bespeak/worker verify ${runId}
forge test --root contracts`}
        </pre>
      </Numbered>

      <details className="tech">
        <summary>Raw receipt</summary>
        <pre className="card mono" style={{overflowX: "auto", whiteSpace: "pre-wrap"}}>
          {JSON.stringify(receipt, null, 2)}
        </pre>
      </details>

      <p className="tiny muted" style={{marginTop: 20}}>
        This page is a compressed view for reviewers.{" "}
        <Link href="/" style={{textDecoration: "underline"}}>
          The product itself
        </Link>{" "}
        does not require it.
      </p>
    </section>
  );
}

function Numbered({n, title, children}: {n: number; title: string; children: React.ReactNode}) {
  return (
    <div className="card" style={{marginBottom: 10}}>
      <h2 style={{fontSize: 15, marginBottom: 10}}>
        <span className="muted" style={{marginRight: 8}}>
          {n}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}
