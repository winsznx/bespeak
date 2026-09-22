"use client";

import {useMemo, useState} from "react";
import {useAccount} from "wagmi";
import {parseUnits} from "viem";
import {TriggerType} from "@bespeak/shared";
import {formatLocal, nextRegularSessionOpen} from "@/lib/format";
import {useVault} from "@/lib/useVault";
import {useCreateOrder} from "@/lib/useCreateOrder";

export interface ComposerAsset {
  assetId: `0x${string}`;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  outputToken: `0x${string}`;
  outputDecimals: number;
  deliveredInstrument: "wrapped" | "underlying";
}

interface Stable {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

type Condition = "IMMEDIATE" | "NEXT_REGULAR_SESSION" | "WHEN_AVAILABLE" | "RECURRING";

const CONDITIONS: Array<{key: Condition; title: string; blurb: string}> = [
  {
    key: "IMMEDIATE",
    title: "Buy now",
    blurb: "Execute straight away at the current X Layer price, within your limits.",
  },
  {
    key: "NEXT_REGULAR_SESSION",
    title: "Next regular session",
    blurb: "Wait until the underlying US stock is in its regular trading session, then buy.",
  },
  {
    key: "WHEN_AVAILABLE",
    title: "When available on X Layer",
    blurb: "Reserve funds now and execute once this asset becomes tradable on X Layer.",
  },
  {
    key: "RECURRING",
    title: "Repeat",
    blurb: "Buy on a schedule. Each purchase still respects the market condition you choose.",
  },
];

/// The order composer. One component serves all four execution paths because they are one
/// primitive underneath; only the trigger and the deadline semantics differ.
export function OrderComposer({
  asset,
  stables,
  sessionOpen,
}: {
  asset: ComposerAsset;
  stables: Stable[];
  sessionOpen: boolean;
}) {
  const {address, isConnected} = useAccount();
  const [condition, setCondition] = useState<Condition>("NEXT_REGULAR_SESSION");
  const [stableSymbol, setStableSymbol] = useState(stables[0]?.symbol ?? "USDC");
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(75);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [intervalDays, setIntervalDays] = useState(7);
  const [occurrences, setOccurrences] = useState(4);
  const [advanced, setAdvanced] = useState(false);

  const stable = stables.find((s) => s.symbol === stableSymbol) ?? stables[0]!;
  const vault = useVault(address, stable);
  const create = useCreateOrder();

  const amountRaw = useMemo(() => {
    if (!amount || Number.isNaN(Number(amount))) return 0n;
    try {
      return parseUnits(amount, stable.decimals);
    } catch {
      return 0n;
    }
  }, [amount, stable.decimals]);

  const perOccurrence = condition === "RECURRING" ? amountRaw : amountRaw;
  const needsTopUp = vault.available !== null && perOccurrence > vault.available;
  const shortfall = vault.available !== null ? perOccurrence - vault.available : 0n;

  const canSubmit =
    isConnected && amountRaw > 0n && !needsTopUp && !create.isPending && vault.address !== null;

  const deadline = new Date(Date.now() + deadlineDays * 86_400_000);

  return (
    <div className="card">
      <h2>Create an order</h2>

      {/* ---- amount ---- */}
      <div className="grid grid-2" style={{marginBottom: 20}}>
        <div>
          <label className="label" htmlFor="amount">
            Amount to spend {condition === "RECURRING" ? "per purchase" : ""}
          </label>
          <input
            id="amount"
            className="input"
            inputMode="decimal"
            placeholder="200"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </div>
        <div>
          <label className="label" htmlFor="stable">
            Pay with
          </label>
          <select
            id="stable"
            className="select"
            value={stableSymbol}
            onChange={(e) => setStableSymbol(e.target.value)}
          >
            {stables.map((s) => (
              <option key={s.symbol} value={s.symbol}>
                {s.symbol} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---- condition ---- */}
      <label className="label">When should this execute?</label>
      <div className="grid grid-2" style={{marginBottom: 20}}>
        {CONDITIONS.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCondition(c.key)}
            className="card"
            style={{
              textAlign: "left",
              cursor: "pointer",
              borderColor: condition === c.key ? "var(--accent)" : "var(--border)",
              borderWidth: 1,
              outline: condition === c.key ? "1px solid var(--accent)" : "none",
              font: "inherit",
              color: "inherit",
              background: "var(--surface)",
            }}
          >
            <h3 style={{marginBottom: 4}}>{c.title}</h3>
            <p className="tiny muted" style={{margin: 0}}>
              {c.blurb}
            </p>
          </button>
        ))}
      </div>

      {condition === "NEXT_REGULAR_SESSION" && (
        <div className="notice" style={{marginBottom: 20}}>
          {sessionOpen ? (
            <>
              The regular session is open right now, so this order becomes eligible
              immediately and should execute on the next keeper pass.
            </>
          ) : (
            <>
              The regular session is closed. This order will wait, and is expected to become
              eligible around {formatLocal(nextRegularSessionOpen())}. Your funds stay
              reserved and withdrawable by cancelling at any point before it executes.
            </>
          )}
        </div>
      )}

      {condition === "RECURRING" && (
        <div className="grid grid-2" style={{marginBottom: 20}}>
          <div>
            <label className="label" htmlFor="interval">
              Repeat every
            </label>
            <select
              id="interval"
              className="select"
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value))}
            >
              <option value={7}>Week</option>
              <option value={14}>2 weeks</option>
              <option value={30}>Month</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="count">
              Number of purchases
            </label>
            <input
              id="count"
              className="input"
              type="number"
              min={2}
              max={52}
              value={occurrences}
              onChange={(e) => setOccurrences(Number(e.target.value))}
            />
          </div>
          <p className="tiny muted" style={{gridColumn: "1 / -1", margin: 0}}>
            Only the next purchase is funded at a time. Bespeak will not lock{" "}
            {occurrences} purchases worth of capital today — it reserves each one as it comes
            due, and tells you if you need to top up.
          </p>
        </div>
      )}

      {/* ---- limits ---- */}
      <div className="between" style={{marginBottom: 10}}>
        <label className="label" style={{margin: 0}}>
          Execution limits
        </label>
        <button type="button" className="btn btn-sm" onClick={() => setAdvanced(!advanced)}>
          {advanced ? "Hide advanced" : "Advanced"}
        </button>
      </div>
      <div className="grid grid-2" style={{marginBottom: 20}}>
        <div>
          <label className="label" htmlFor="slip">
            Maximum slippage
          </label>
          <select
            id="slip"
            className="select"
            value={slippageBps}
            onChange={(e) => setSlippageBps(Number(e.target.value))}
          >
            <option value={25}>0.25%</option>
            <option value={50}>0.50%</option>
            <option value={75}>0.75% (default)</option>
            <option value={100}>1.00%</option>
          </select>
        </div>
        {condition !== "IMMEDIATE" && (
          <div>
            <label className="label" htmlFor="deadline">
              Cancel if not executed within
            </label>
            <select
              id="deadline"
              className="select"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(Number(e.target.value))}
            >
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
            </select>
          </div>
        )}
      </div>

      {advanced && (
        <div className="notice" style={{marginBottom: 20}}>
          <dl className="kv">
            <dt>Quote freshness</dt>
            <dd>30s — a route older than this is refused</dd>
            <dt>Condition freshness</dt>
            <dd>60s — a market reading older than this cannot make the order eligible</dd>
            <dt>Receiver</dt>
            <dd>{address ?? "your connected wallet"}</dd>
            <dt>You will receive</dt>
            <dd>
              {asset.deliveredInstrument === "wrapped" ? "wrapped " : ""}
              {asset.symbol} at {asset.outputToken}
            </dd>
          </dl>
        </div>
      )}

      {/* ---- funding ---- */}
      <div className="notice" style={{marginBottom: 16}}>
        <div className="between">
          <span>Vault available</span>
          <strong className="mono">
            {vault.available === null ? "—" : `${vault.availableFormatted} ${stable.symbol}`}
          </strong>
        </div>
        <div className="between">
          <span>Reserved by existing orders</span>
          <span className="mono">
            {vault.reserved === null ? "—" : `${vault.reservedFormatted} ${stable.symbol}`}
          </span>
        </div>
        <div className="between">
          <span>Required for this order</span>
          <span className="mono">
            {amount || "0"} {stable.symbol}
          </span>
        </div>
      </div>

      {needsTopUp && (
        <div className="notice notice-wait" style={{marginBottom: 16}}>
          You need {vault.format(shortfall)} more {stable.symbol} in your vault.{" "}
          <a href="/vault" style={{textDecoration: "underline"}}>
            Deposit to your vault
          </a>
        </div>
      )}

      {/* ---- confirm ---- */}
      {amountRaw > 0n && (
        <div className="card" style={{background: "var(--surface-2)", marginBottom: 16}}>
          <div className="stack" style={{gap: 6}}>
            <div className="between">
              <span className="muted small">Buy</span>
              <strong>
                {amount} {stable.symbol} of {asset.underlyingSymbol}
                {condition === "RECURRING" ? `, ${occurrences} times` : ""}
              </strong>
            </div>
            <div className="between">
              <span className="muted small">Condition</span>
              <span>{CONDITIONS.find((c) => c.key === condition)!.title}</span>
            </div>
            <div className="between">
              <span className="muted small">Maximum slippage</span>
              <span>{(slippageBps / 100).toFixed(2)}%</span>
            </div>
            {condition !== "IMMEDIATE" && (
              <div className="between">
                <span className="muted small">Deadline</span>
                <span>{formatLocal(deadline)}</span>
              </div>
            )}
            <div className="between">
              <span className="muted small">Delivered to</span>
              <span className="mono">{address ?? "connect a wallet"}</span>
            </div>
          </div>
        </div>
      )}

      <button
        className="btn btn-primary"
        style={{width: "100%"}}
        disabled={!canSubmit}
        onClick={() =>
          create.submit({
            asset,
            stable,
            amountRaw,
            condition:
              condition === "RECURRING"
                ? TriggerType.NEXT_REGULAR_SESSION
                : condition === "IMMEDIATE"
                  ? TriggerType.IMMEDIATE
                  : condition === "WHEN_AVAILABLE"
                    ? TriggerType.WHEN_AVAILABLE
                    : TriggerType.NEXT_REGULAR_SESSION,
            recurring: condition === "RECURRING" ? {intervalDays, occurrences} : null,
            slippageBps,
            deadlineDays,
            receiver: address!,
          })
        }
      >
        {!isConnected
          ? "Connect a wallet to continue"
          : amountRaw === 0n
            ? "Enter an amount"
            : needsTopUp
              ? "Not enough in your vault"
              : create.isPending
                ? "Confirm in your wallet…"
                : "Confirm and reserve"}
      </button>

      {create.error && (
        <p className="tiny" style={{color: "var(--negative)", marginBottom: 0}}>
          {create.error}
        </p>
      )}
      {create.orderId && (
        <p className="tiny" style={{marginBottom: 0}}>
          Order created.{" "}
          <a href="/orders" style={{textDecoration: "underline"}}>
            View your orders
          </a>
        </p>
      )}

      <p className="tiny muted" style={{marginTop: 12, marginBottom: 0}}>
        You can cancel while the order is still waiting and your reserved funds become
        available again immediately.
      </p>
    </div>
  );
}
