"use client";

import {useMemo, useState} from "react";
import {useAccount} from "wagmi";
import {parseUnits} from "viem";
import {TriggerType} from "@bespeak/shared";
import {formatUtcShort, nextRegularSessionOpen} from "@/lib/format";
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

/// The signature Bespeak control.
///
/// The differentiated choice is not an order-type dropdown, it is "when should Bespeak
/// buy?". That question owns the screen; the selected condition expands to reveal only the
/// context and fields it actually needs, and the review panel restates the instruction as
/// a sentence so what is being authorized is never buried inside controls.
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
  const [condition, setCondition] = useState<Condition>(
    sessionOpen ? "IMMEDIATE" : "NEXT_REGULAR_SESSION",
  );
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

  const hasAmount = amountRaw > 0n;
  const needsTopUp = vault.available !== null && amountRaw > vault.available;
  const shortfall = vault.available !== null ? amountRaw - vault.available : 0n;
  const canSubmit = isConnected && hasAmount && !needsTopUp && !create.isPending;
  const routeMismatch = Boolean(asset.routeQuoteSymbol && stableSymbol !== asset.routeQuoteSymbol);

  const CHOICES: Array<{key: Condition; name: string; what: string}> = [
    {key: "IMMEDIATE", name: "Now", what: "Buy immediately"},
    {key: "NEXT_REGULAR_SESSION", name: "Next session", what: "Wait for the underlying market"},
    {key: "WHEN_AVAILABLE", name: "When available", what: "Reserve until it reaches X Layer"},
    {key: "RECURRING", name: "Repeat", what: "Make it a standing instruction"},
  ];

  function submit() {
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
    });
  }

  const cta = !isConnected
    ? "Connect a wallet"
    : !hasAmount
      ? "Enter an amount"
      : needsTopUp
        ? "Not enough in your vault"
        : create.isPending
          ? "Confirm in your wallet…"
          : condition === "IMMEDIATE"
            ? "Review and buy"
            : "Confirm and reserve";

  return (
    <div className="composer-grid">
      <div>
        {/* ---------- when ---------- */}
        <h2 className="t-h2" style={{marginBottom: 18}}>
          When should Bespeak buy?
        </h2>

        <div className="conditions" role="group" aria-label="Execution condition">
          {CHOICES.map((c) => (
            <button
              key={c.key}
              type="button"
              className="condition"
              aria-pressed={condition === c.key}
              onClick={() => setCondition(c.key)}
            >
              <span className="condition-name">{c.name}</span>
              <span className="condition-what">{c.what}</span>
            </button>
          ))}
        </div>

        <div className="condition-detail enter" key={condition}>
          {condition === "IMMEDIATE" && (
            <>
              <DetailRow label="X Layer market" value="Available now" tone="var(--success)" />
              <DetailRow label="Expected payment asset" value={stable.symbol} />
              <p className="t-sm muted prose" style={{margin: "12px 0 0"}}>
                Executes on the next keeper pass, inside the limits you set below.
              </p>
            </>
          )}

          {condition === "NEXT_REGULAR_SESSION" && (
            <>
              <DetailRow
                label="Underlying market"
                value={sessionOpen ? "Open now" : "Currently closed"}
                tone={sessionOpen ? "var(--success)" : undefined}
              />
              <DetailRow
                label="Next regular session"
                value={formatUtcShort(nextOpen)}
                extra={<Countdown to={nextOpen.toISOString()} />}
              />
              <DetailRow label="Expected payment asset" value={stable.symbol} />
              {!sessionOpen && (
                <p className="t-sm muted prose" style={{margin: "12px 0 0"}}>
                  Your funds stay reserved and withdrawable by cancelling at any point before
                  it executes.
                </p>
              )}
            </>
          )}

          {condition === "WHEN_AVAILABLE" && (
            <>
              <DetailRow label="Status" value="Waiting for X Layer availability" />
              <DetailRow label="Expected payment asset" value={stable.symbol} />
              <p className="t-sm muted prose" style={{margin: "12px 0 0"}}>
                Funds stay reserved until the asset is tradable here or your deadline passes —
                whichever comes first. Nothing is spent meanwhile.
              </p>
            </>
          )}

          {condition === "RECURRING" && (
            <>
              <div className="row wrap g4" style={{marginBottom: 14}}>
                <div style={{flex: "1 1 150px"}}>
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
                <div style={{flex: "1 1 150px"}}>
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
              <p className="t-sm muted prose" style={{margin: 0}}>
                Bespeak reserves one purchase at a time. The other {Math.max(occurrences - 1, 0)}{" "}
                are not holding your money, and you are told if the next one needs a top-up.
              </p>
            </>
          )}
        </div>

        {/* ---------- amount ---------- */}
        <div style={{marginTop: 28}}>
          <label className="field-label" htmlFor="amount">
            Amount to spend{condition === "RECURRING" ? " each time" : ""}
          </label>
          <div className="amount-field">
            <span className="prefix">$</span>
            <input
              id="amount"
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            />
            {stables.length > 1 ? (
              <select
                className="suffix"
                aria-label="Payment asset"
                value={stableSymbol}
                onChange={(e) => setStableSymbol(e.target.value)}
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

          <div className="row wrap g2" style={{marginTop: 12}}>
            {QUICK.map((v) => (
              <button
                key={v}
                type="button"
                className="btn btn-sm"
                onClick={() => setAmount(String(v))}
                style={
                  amount === String(v)
                    ? {borderColor: "var(--brand)", color: "var(--brand)"}
                    : undefined
                }
              >
                ${v}
              </button>
            ))}
          </div>

          {routeMismatch && (
            <p className="t-sm" style={{color: "var(--waiting)", margin: "12px 0 0"}}>
              {asset.underlyingSymbol} has its X Layer liquidity against{" "}
              {asset.routeQuoteSymbol}. An order paid in {stableSymbol} may find no route and
              stay waiting.
            </p>
          )}
        </div>

        {/* ---------- limits ---------- */}
        <div style={{marginTop: 28}}>
          <div className="between" style={{marginBottom: 12}}>
            <label className="field-label" style={{margin: 0}}>
              Execution limits
            </label>
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              onClick={() => setAdvanced(!advanced)}
              aria-expanded={advanced}
            >
              {advanced ? "Hide" : "Advanced"}
            </button>
          </div>

          <div className="row wrap g4">
            <div style={{flex: "1 1 180px"}}>
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
              <div style={{flex: "1 1 180px"}}>
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
            <dl
              className="kv enter"
              style={{
                marginTop: 16,
                background: "var(--surface-2)",
                borderRadius: "var(--r-control)",
                padding: 16,
              }}
            >
              <dt>Quote freshness</dt>
              <dd>30s — an older route is refused</dd>
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
      </div>

      {/* ---------- review ---------- */}
      <aside className="review-panel">
        <div className="module module-pad">
          <div className="t-label" style={{marginBottom: 14}}>
            Review
          </div>

          <p
            className="t-body prose"
            style={{margin: "0 0 18px", color: "var(--ink-3)", lineHeight: 1.5}}
          >
            Buy{" "}
            <strong style={{color: "var(--ink)", fontWeight: 600}}>
              {hasAmount ? `$${amount}` : "an amount"} of {asset.underlyingSymbol}
            </strong>{" "}
            <br />
            <strong style={{color: "var(--ink)", fontWeight: 600}}>
              {sentenceFor(condition, intervalDays, occurrences)}
            </strong>
            <br />
            within {(slippageBps / 100).toFixed(2)}% slippage
            {condition !== "IMMEDIATE" ? `, expiring in ${deadlineDays} days` : ""}.
          </p>

          <div style={{borderTop: "1px solid var(--line)", paddingTop: 14, marginBottom: 16}}>
            <ReviewRow label="Paying with" value={stable.symbol} />
            <ReviewRow
              label="You receive"
              value={asset.deliveredInstrument === "wrapped" ? `w${asset.symbol}` : asset.symbol}
            />
            {isConnected && (
              <ReviewRow
                label="Vault available"
                value={`${vault.availableFormatted} ${stable.symbol}`}
              />
            )}
          </div>

          {needsTopUp && (
            <p className="t-sm" style={{color: "var(--waiting)", marginBottom: 14}}>
              Add {vault.format(shortfall)} {stable.symbol} to your vault.{" "}
              <a href="/vault" style={{textDecoration: "underline"}}>
                Deposit
              </a>
            </p>
          )}

          <div className="desktop-cta">
            <button className="btn btn-primary btn-block" disabled={!canSubmit} onClick={submit}>
              {cta}
            </button>
          </div>

          {create.error && (
            <p className="t-sm" style={{color: "var(--danger)", margin: "12px 0 0"}}>
              {create.error}
            </p>
          )}
          {create.orderId && (
            <p className="t-sm" style={{margin: "12px 0 0"}}>
              Order created.{" "}
              <a href="/orders" style={{textDecoration: "underline"}}>
                View orders
              </a>
            </p>
          )}

          <p className="t-xs faint prose" style={{margin: "12px 0 0"}}>
            You can cancel while the order is waiting; reserved funds become available
            immediately.
          </p>
        </div>

        <div className="sticky-cta">
          <button className="btn btn-primary btn-lg btn-block" disabled={!canSubmit} onClick={submit}>
            {cta}
          </button>
        </div>
      </aside>
    </div>
  );
}

function DetailRow({
  label,
  value,
  tone,
  extra,
}: {
  label: string;
  value: string;
  tone?: string | undefined;
  extra?: React.ReactNode;
}) {
  return (
    <div className="between" style={{padding: "5px 0"}}>
      <span className="t-sm muted">{label}</span>
      <span className="t-sm" style={{fontWeight: 500, color: tone}}>
        {extra ? <>{extra} · </> : null}
        {value}
      </span>
    </div>
  );
}

function ReviewRow({label, value}: {label: string; value: string}) {
  return (
    <div className="between" style={{padding: "4px 0"}}>
      <span className="t-sm muted">{label}</span>
      <span className="t-sm" style={{fontWeight: 500}}>
        {value}
      </span>
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
      return `every ${
        intervalDays === 7 ? "week" : intervalDays === 14 ? "2 weeks" : "month"
      }, ${occurrences} times, at the regular session`;
  }
}
