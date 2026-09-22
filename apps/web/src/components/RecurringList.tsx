"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import type {Address} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, formatLocal} from "@/lib/format";
import {useRecurring, type RecurringRecord} from "@/lib/useRecurring";
import {useVault} from "@/lib/useVault";

interface AssetLite {
  assetId: string;
  underlyingSymbol: string;
}
interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export function RecurringList({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address} = useAccount();
  const {series, isLoading, refetch} = useRecurring(address);

  if (isLoading) return <div className="empty">Loading…</div>;
  if (series.length === 0) {
    return (
      <div className="empty">
        <p style={{marginTop: 0}}>No repeat purchases set up.</p>
        <p className="small muted" style={{maxWidth: "46ch", margin: "0 auto 16px"}}>
          A repeat instruction buys on a schedule, and still waits for the market condition
          you chose each time.
        </p>
        <a className="btn btn-sm" href="/markets">
          Set one up
        </a>
      </div>
    );
  }

  return (
    <div className="grid" style={{gap: 10}}>
      {series.map((r) => (
        <SeriesCard key={r.id} series={r} assets={assets} stables={stables} onChanged={refetch} />
      ))}
    </div>
  );
}

function SeriesCard({
  series,
  assets,
  stables,
  onChanged,
}: {
  series: RecurringRecord;
  assets: AssetLite[];
  stables: Stable[];
  onChanged: () => void;
}) {
  const {address} = useAccount();
  const asset = assets.find((a) => a.assetId.toLowerCase() === series.assetId.toLowerCase());
  const stable =
    stables.find((s) => s.address.toLowerCase() === series.inputToken.toLowerCase()) ?? stables[0]!;
  const vault = useVault(address, stable);
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const done = Number(series.completedOccurrences);
  const total = Number(series.totalOccurrences);
  const created = Number(series.createdOccurrences);
  const remaining = total - created;

  // The series is held when it still has purchases to make, none is currently queued, and
  // the vault cannot fund the next one. This is a presentation state derived from chain
  // data, not a stored status: the contract keeps the series ACTIVE precisely so it can
  // resume without anyone re-creating it.
  const nextCost = series.amountPerOccurrence;
  const needsTopUp =
    series.active &&
    !series.paused &&
    remaining > 0 &&
    created === done &&
    vault.available !== null &&
    vault.available < nextCost;

  async function act(fn: "pauseRecurring" | "cancelRecurring" | "createNextOccurrence", paused?: boolean) {
    const d = clientDeployment();
    if (!d || !publicClient) return;
    setBusy(fn);
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: fn,
        args: fn === "pauseRecurring" ? [series.id, paused!] : [series.id],
      });
      await publicClient.waitForTransactionReceipt({hash});
      onChanged();
      vault.refetch();
    } catch (e) {
      setErr(e instanceof Error ? (e.message.split("\n")[0] ?? "Failed") : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const interval = series.intervalSeconds / 86_400;
  const cadence = interval === 7 ? "week" : interval === 14 ? "2 weeks" : `${interval} days`;

  return (
    <div className="card">
      <div className="between" style={{alignItems: "flex-start", marginBottom: 10}}>
        <div className="stack">
          <strong style={{fontSize: 16}}>
            {formatAmount(series.amountPerOccurrence, stable.decimals)} {stable.symbol} of{" "}
            {asset?.underlyingSymbol ?? "asset"}
          </strong>
          <span className="small muted">Every {cadence}, during the regular session</span>
        </div>
        {!series.active ? (
          <span className="pill pill-off">Finished</span>
        ) : series.paused ? (
          <span className="pill pill-off">Paused</span>
        ) : needsTopUp ? (
          <span className="pill pill-wait">Needs top-up</span>
        ) : (
          <span className="pill pill-open">
            <span className="dot" />
            Active
          </span>
        )}
      </div>

      <div className="between small" style={{marginBottom: 6}}>
        <span className="muted">Completed</span>
        <span className="mono">
          {done} of {total}
        </span>
      </div>
      <div className="between small" style={{marginBottom: 6}}>
        <span className="muted">Funded right now</span>
        <span className="mono">
          {created > done ? "next purchase reserved" : "none reserved"}
        </span>
      </div>
      {remaining > 0 && (
        <div className="between small" style={{marginBottom: 6}}>
          <span className="muted">Still to schedule</span>
          <span className="mono">{remaining}</span>
        </div>
      )}
      {series.active && !series.paused && (
        <div className="between small" style={{marginBottom: 6}}>
          <span className="muted">Next on or after</span>
          <span>{formatLocal(new Date(Number(series.nextEligibleAt) * 1000))}</span>
        </div>
      )}

      <p className="tiny muted" style={{margin: "8px 0 0"}}>
        Only the next purchase is ever funded. The other {Math.max(remaining, 0)} are not
        holding your money.
      </p>

      {needsTopUp && (
        <div className="notice notice-wait" style={{marginTop: 10}}>
          Next purchase is waiting for funds. Add{" "}
          {vault.format(nextCost - (vault.available ?? 0n))} {stable.symbol} to your vault and
          it resumes — the series has not been cancelled.{" "}
          <a href="/vault" style={{textDecoration: "underline"}}>
            Top up
          </a>
        </div>
      )}

      <div className="row" style={{marginTop: 12}}>
        {series.active && (
          <>
            <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => act("pauseRecurring", !series.paused)}>
              {busy === "pauseRecurring" ? "…" : series.paused ? "Resume" : "Pause"}
            </button>
            {needsTopUp && (
              <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => act("createNextOccurrence")}>
                {busy === "createNextOccurrence" ? "…" : "Retry next purchase"}
              </button>
            )}
            <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => act("cancelRecurring")}>
              {busy === "cancelRecurring" ? "…" : "Stop repeating"}
            </button>
          </>
        )}
      </div>
      {err && (
        <p className="tiny" style={{color: "var(--negative)", marginBottom: 0}}>
          {err}
        </p>
      )}
      <p className="tiny muted" style={{marginTop: 8, marginBottom: 0}}>
        Stopping the series leaves completed purchases untouched.
      </p>
    </div>
  );
}
