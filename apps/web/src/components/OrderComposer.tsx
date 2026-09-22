"use client";

import {useMemo, useState} from "react";
import {useAccount} from "wagmi";
import {parseUnits} from "viem";
import {TriggerType} from "@bespeak/shared";
import {formatLocal, nextRegularSessionOpen} from "@/lib/format";
import {useVault} from "@/lib/useVault";
import {useCreateOrder} from "@/lib/useCreateOrder";
import {Countdown} from "./Countdown";

export interface ComposerAsset {
  assetId: `0x${string}`;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  outputToken: `0x${string}`;
  outputDecimals: number;
  deliveredInstrument: "wrapped" | "underlying";
  /// The stablecoin this asset actually has liquidity against on X Layer. Discovered on
  /// chain, and used as the default so a user cannot land on an unexecutable pair.
  routeQuoteSymbol: string | null;
}

interface Stable {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
}

type Condition = "IMMEDIATE" | "NEXT_REGULAR_SESSION" | "WHEN_AVAILABLE" | "RECURRING";

const QUICK = [50, 100, 200, 500];

/// The order composer.
///
/// The product's differentiated control is not an order-type dropdown, it is the question
/// "when should Bespeak buy?". That question is the visual heart of this screen, and
/// everything else is deliberately quieter than it.
///
/// Fields reveal progressively: only what the chosen condition actually needs appears, and
/// the advanced envelope stays folded until asked for. The user's instruction is rendered
/// back to them as a sentence throughout, so what they are authorizing is never hidden
/// inside a set of controls.
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
  const [stableSymbol, setStableSymbol] = useState(
    asset.routeQuoteSymbol ?? stables[0]?.symbol ?? "USDC",
  );
  const [amount, setAmount] = useState("");
  const [slippageBps, setSlippageBps] = useState(75);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [intervalDays, setIntervalDays] = useState(7);
  const [occurrences, setOccurrences] = useState(4);
  const [advanced, setAdvanced] = useState(false);

  const stable = stables.find((s) => s.symbol === stableSymbol) ?? stables[0]!;
  const vault = useVault(address, stable);
  const create = useCreateOrder();
  const nextOpen = nextRegularSessionOpen();

  const amountRaw = useMemo(() => {
    if (!amount) return 0n;
    try {
      return parseUnits(amount, stable.decimals);
    } catch {
      return 0n;
    }
  }, [amount, stable.decimals]);

  const needsTopUp = vault.available !== null && amountRaw > vault.available;
  const shortfall = vault.available !== null ? amountRaw - vault.available : 0n;
  const hasAmount = amountRaw > 0n;
  const canSubmit = isConnected && hasAmount && !needsTopUp && !create.isPending;

  const choices: Array<{key: Condition; name: string; what: string; ctx: React.ReactNode}> = [
    {
      key: "IMMEDIATE",
      name: "Now",
      what: "Buy immediately at the current X Layer price.",
      ctx: <span style={{color: "var(--filled)"}}>X Layer market available now</span>,
    },
    {
      key: "NEXT_REGULAR_SESSION",
      name: "Next session",
      what: "Wait for the underlying US stock to reach its regular session.",
      ctx: sessionOpen ? (
        <span style={{color: "var(--filled)"}}>Open now — eligible immediately</span>
      ) : (
        <>
          Opens in <Countdown to={nextOpen.toISOString()} />
        </>
      ),
    },
    {
      key: "WHEN_AVAILABLE",
      name: "When available",
      what: "Reserve until this asset becomes tradable on X Layer.",
      ctx: "Funds released automatically at your deadline",
    },
    {
      key: "RECURRING",
      name: "Repeat",
      what: "Make this a standing instruction on a schedule.",
      ctx: "Only the next purchase is ever funded",
    },
  ];

  return (
    <div className="panel panel-pad">
      {/* ---------- 1. amount ---------- */}
      <div className="mb-32">
        <label className="field-label" htmlFor="amount">
          How much do you want to spend
          {condition === "RECURRING" ? " each time" : ""}?
        </label>
        <div className="amount-field">
          <span className="prefix">$</span>
          <input
            id="amount"
            inputMode="decimal"
            placeholder="0"
            autoComplete="off"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
          {stables.length > 1 ? (
            <select
              aria-label="Pay with"
              value={stableSymbol}
              onChange={(e) => setStableSymbol(e.target.value)}
              className="suffix"
              style={{
                border: 0,
                font: "inherit",
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-2)",
                cursor: "pointer",
                appearance: "none",
                textAlign: "center",
              }}
            >
              {stables.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol}
                </option>
              ))}
            </select>
          ) : (
            <span className="suffix">{stable.symbol}</span>
          )}
        </div>

        <div className="wrap-row gap-8 mt-12">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              className="btn btn-sm"
              onClick={() => setAmount(String(q))}
              style={{
                borderColor: amount === String(q) ? "var(--accent)" : "var(--line-strong)",
                color: amount === String(q) ? "var(--accent)" : "var(--text-2)",
              }}
            >
              ${q}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 2. when: the heart of the product ---------- */}
      <div className="mb-32">
        <h2 className="mb-16">When should Bespeak buy?</h2>
        <div className="choices">
          {choices.map((c) => (
            <button
              key={c.key}
              type="button"
              className="choice"
              data-selected={condition === c.key}
              aria-pressed={condition === c.key}
              onClick={() => setCondition(c.key)}
            >
              <span className="choice-dot" aria-hidden="true" />
              <span style={{minWidth: 0}}>
                <span className="choice-name">{c.name}</span>
                <span className="choice-what" style={{display: "block"}}>
                  {c.what}
                </span>
                <span className="choice-ctx">{c.ctx}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- 3. only the fields this condition needs ---------- */}
      {condition === "RECURRING" && (
        <div className="mb-32 enter">
          <div style={{display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr"}}>
            <div>
              <label className="field-label" htmlFor="interval">
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
              <label className="field-label" htmlFor="count">
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
          </div>
          <p className="note mt-16">
            Bespeak reserves one purchase at a time. The other {Math.max(occurrences - 1, 0)}{" "}
            are not holding your money, and you will be told if the next one needs a top-up.
          </p>
        </div>
      )}

      {condition === "NEXT_REGULAR_SESSION" && !sessionOpen && (
        <p className="note note-waiting mb-32 enter">
          The regular session is closed, so this order will wait. It becomes eligible around{" "}
          {formatLocal(nextOpen)}, and you can cancel and take the funds back at any point
          before it executes.
        </p>
      )}

      {condition === "WHEN_AVAILABLE" && (
        <p className="note mb-32 enter">
          Your funds stay reserved until this asset is tradable on X Layer, or until your
          deadline — whichever comes first. Nothing is spent in the meantime.
        </p>
      )}

      {/* ---------- 4. limits, folded ---------- */}
      <div className="mb-32">
        <div className="between mb-12">
          <label className="field-label" style={{margin: 0}}>
            Execution limits
          </label>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "Hide" : "Advanced"}
          </button>
        </div>

        <div style={{display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr"}}>
          <div>
            <label className="field-label" htmlFor="slip">
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
              <option value={75}>0.75%</option>
              <option value={100}>1.00%</option>
            </select>
          </div>
          {condition !== "IMMEDIATE" && (
            <div>
              <label className="field-label" htmlFor="deadline">
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
          <dl className="kv quiet mt-16 enter">
            <dt>Quote freshness</dt>
            <dd>30s — a route older than this is refused</dd>
            <dt>Condition freshness</dt>
            <dd>60s — an older market reading cannot make this eligible</dd>
            <dt>Delivered to</dt>
            <dd className="mono">{address ?? "your connected wallet"}</dd>
            <dt>You receive</dt>
            <dd>
              {asset.deliveredInstrument === "wrapped" ? "wrapped " : ""}
              {asset.symbol}
            </dd>
          </dl>
        )}
      </div>

      {/* ---------- 5. the instruction, said back ---------- */}
      <div className="quiet mb-24">
        <p className="sentence" style={{margin: 0}}>
          Buy{" "}
          <span className={hasAmount ? "said" : "pending"}>
            {hasAmount ? `$${amount}` : "some amount"} of {asset.underlyingSymbol}
          </span>
          <br />
          <span className="said">{sentenceFor(condition, intervalDays, occurrences)}</span>
          <br />
          within {(slippageBps / 100).toFixed(2)}% slippage
          {condition !== "IMMEDIATE" ? `, expiring in ${deadlineDays} days` : ""}.
        </p>
      </div>

      {/* ---------- 6. funding + confirm ---------- */}
      {isConnected && (
        <div className="between small mb-16">
          <span className="muted">Available in your vault</span>
          <span className="strong">
            {vault.availableFormatted} {stable.symbol}
          </span>
        </div>
      )}

      {needsTopUp && (
        <p className="note note-waiting mb-16">
          You need {vault.format(shortfall)} more {stable.symbol}.{" "}
          <a href="/vault" style={{textDecoration: "underline"}}>
            Add funds to your vault
          </a>
        </p>
      )}

      <button
        className="btn btn-primary btn-lg btn-block"
        disabled={!canSubmit}
        onClick={() =>
          create.submit({
            asset,
            stable,
            amountRaw,
            condition:
              condition === "IMMEDIATE"
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
          : !hasAmount
            ? "Enter an amount"
            : needsTopUp
              ? "Not enough in your vault"
              : create.isPending
                ? "Confirm in your wallet…"
                : condition === "IMMEDIATE"
                  ? "Review and buy"
                  : "Confirm and reserve"}
      </button>

      {create.error && (
        <p className="tiny mt-12" style={{color: "var(--failed)", marginBottom: 0}}>
          {create.error}
        </p>
      )}
      {create.orderId && (
        <p className="tiny mt-12" style={{marginBottom: 0}}>
          Order created.{" "}
          <a href="/orders" style={{textDecoration: "underline"}}>
            View your orders
          </a>
        </p>
      )}

      <p className="tiny faint mt-12" style={{marginBottom: 0}}>
        You can cancel while the order is waiting, and your reserved funds become available
        again immediately.
      </p>
    </div>
  );
}

function sentenceFor(c: Condition, intervalDays: number, occurrences: number): string {
  switch (c) {
    case "IMMEDIATE":
      return "right now";
    case "NEXT_REGULAR_SESSION":
      return "at the next regular session";
    case "WHEN_AVAILABLE":
      return "when it becomes available on X Layer";
    case "RECURRING":
      return `every ${intervalDays === 7 ? "week" : intervalDays === 14 ? "2 weeks" : "month"}, ${occurrences} times, at the regular session`;
  }
}
