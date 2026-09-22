"use client";

import {useState} from "react";
import {usePublicClient, useWriteContract} from "wagmi";
import type {Address} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, formatLocal} from "@/lib/format";
import type {OrderRecord} from "@/lib/useOrders";
import type {MarketState} from "@/lib/useMarketState";
import {Countdown} from "./Countdown";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
}
interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

const CONDITION: Record<number, string> = {
  [TriggerType.IMMEDIATE]: "Buy now",
  [TriggerType.NEXT_REGULAR_SESSION]: "the next regular session",
  [TriggerType.WHEN_AVAILABLE]: "availability on X Layer",
};

/// A standing instruction, rendered as the object it is.
///
/// Waiting is a calm, stable state — Bespeak is holding the instruction, nothing is broken
/// — so it gets breathing room, a single quiet amber accent and no spinner. A filled order
/// is a different object entirely rather than the same card with a different badge.
export function OrderCard({
  order,
  assets,
  stables,
  market,
  sourceReachable,
  onChanged,
}: {
  order: OrderRecord;
  assets: AssetLite[];
  stables: Stable[];
  market: MarketState | undefined;
  sourceReachable: boolean;
  onChanged: () => void;
}) {
  const asset = assets.find((a) => a.assetId.toLowerCase() === order.assetId.toLowerCase());
  const stable = stables.find((s) => s.address.toLowerCase() === order.inputToken.toLowerCase());
  const d = clientDeployment();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = stable ? formatAmount(order.amountIn, stable.decimals) : "—";
  const symbol = asset?.underlyingSymbol ?? "Asset";

  async function cancel() {
    if (!d || !publicClient) return;
    setBusy(true);
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: "cancelOrder",
        args: [order.id],
      });
      await publicClient.waitForTransactionReceipt({hash});
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? (e.message.split("\n")[0] ?? "Could not cancel") : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  // ---- filled: decisive, green, the asset becomes the dominant figure ----
  if (order.status === OrderStatus.FILLED) {
    return (
      <article className="panel panel-pad settle" style={{borderColor: "var(--filled-line)"}}>
        <div className="between mb-16" style={{alignItems: "flex-start"}}>
          <div className="row gap-12">
            <CheckMark />
            <div>
              <div className="h2">{symbol} purchased</div>
              <div className="tiny faint">
                Executed under {CONDITION[order.triggerType] ?? "your condition"}
              </div>
            </div>
          </div>
          <a className="btn btn-sm" href={`/receipt/${order.id}`}>
            Receipt
          </a>
        </div>
        <div className="figure" style={{color: "var(--filled)"}}>
          ${amount}
        </div>
        <div className="tiny faint mt-4">spent from your vault</div>
      </article>
    );
  }

  // ---- terminal, historical: neutral, never alarming ----
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
    return (
      <article
        className="panel panel-pad"
        style={{background: "var(--surface-quiet)", boxShadow: "none"}}
      >
        <div className="between">
          <div>
            <div className="strong">
              ${amount} of {symbol}
            </div>
            <div className="tiny faint mt-4">
              {order.status === OrderStatus.CANCELLED
                ? "Cancelled — funds returned to your vault"
                : "Expired without executing — funds returned to your vault"}
            </div>
          </div>
          <span className="badge badge-neutral">
            {order.status === OrderStatus.CANCELLED ? "Cancelled" : "Expired"}
          </span>
        </div>
      </article>
    );
  }

  // ---- waiting: Bespeak is holding the instruction ----
  const explain = explainWait(order, market, sourceReachable);

  return (
    <article className="panel panel-pad">
      <div className="between mb-24" style={{alignItems: "flex-start"}}>
        <div>
          <div className="h2 mb-4">{symbol}</div>
          <div className="tiny faint">
            {order.triggerType === TriggerType.WHEN_AVAILABLE
              ? "Waiting for availability on X Layer"
              : order.triggerType === TriggerType.IMMEDIATE
                ? "Queued for execution"
                : "Waiting for the regular session"}
          </div>
        </div>
        <span className="badge badge-waiting">
          <span className="dot" />
          {explain.attention ? "Needs attention" : "Waiting"}
        </span>
      </div>

      <div className="figure-sm mb-4">${amount}</div>
      <div className="tiny faint mb-24">reserved · {stable?.symbol ?? ""}</div>

      <div
        className="quiet mb-16"
        style={
          explain.attention
            ? {background: "var(--waiting-soft)", border: "1px solid var(--waiting-line)"}
            : undefined
        }
      >
        <div className="small" style={{color: explain.attention ? "var(--waiting)" : "var(--text)"}}>
          {explain.headline}
        </div>
        {explain.detail && (
          <div className="tiny muted mt-4" style={{fontVariantNumeric: "normal"}}>
            {explain.detail}
          </div>
        )}
      </div>

      <div className="between">
        <span className="tiny faint">
          Expires {formatLocal(new Date(Number(order.expiresAt) * 1000))}
        </span>
        <button className="btn btn-sm" onClick={cancel} disabled={busy}>
          {busy ? "Cancelling…" : "Cancel"}
        </button>
      </div>

      {err && (
        <p className="tiny mt-12" style={{color: "var(--failed)", marginBottom: 0}}>
          {err}
        </p>
      )}
    </article>
  );
}

function CheckMark() {
  return (
    <span
      style={{
        width: 36,
        height: 36,
        flex: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" className="check-draw">
        <circle cx="18" cy="18" r="17" fill="var(--filled-soft)" stroke="var(--filled-line)" />
        <path
          d="M11.5 18.3l4.4 4.4 8.6-8.8"
          stroke="var(--filled)"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

/// What is actually holding this order, in the user's own terms.
///
/// A projection, not authority: the contract decides eligibility. This explains the most
/// likely current reason so a user never has to ask a developer why nothing has happened.
function explainWait(
  order: OrderRecord,
  market: MarketState | undefined,
  sourceReachable: boolean,
): {headline: string; detail?: React.ReactNode; attention?: boolean} {
  const now = Date.now();

  if (Number(order.validAfter) * 1000 > now) {
    return {
      headline: "Scheduled to start later",
      detail: `Starts ${formatLocal(new Date(Number(order.validAfter) * 1000))}.`,
    };
  }

  if (order.triggerType === TriggerType.IMMEDIATE) {
    return {headline: "Queued for execution on the next pass."};
  }

  if (order.triggerType === TriggerType.WHEN_AVAILABLE) {
    return {
      headline: "Waiting for this asset to become tradable on X Layer.",
      detail: "Your funds stay reserved until it is, or until the deadline — whichever comes first.",
    };
  }

  if (!sourceReachable || !market) {
    return {
      headline: "The market session cannot be read right now.",
      detail: "Nothing will execute. An unknown session is never treated as open.",
      attention: true,
    };
  }

  if (market.halted) {
    return {
      headline: `Trading in ${market.underlyingSymbol} is halted.`,
      detail: "Execution is on hold until the halt lifts.",
      attention: true,
    };
  }

  if (market.eligibleForRegularSession) {
    return {
      headline: "The regular session is open — this order is eligible.",
      detail: "If it has not executed, the current price is outside the limit you set.",
    };
  }

  return {
    headline: "Waiting for the regular session.",
    detail: market.nextChangeAt ? (
      <>
        Market is {phrase(market.marketStatus)}. Session state changes in{" "}
        <Countdown to={market.nextChangeAt} />.
      </>
    ) : (
      `Market is ${phrase(market.marketStatus)}.`
    ),
  };
}

function phrase(status: string): string {
  switch (status) {
    case "CLOSED":
      return "closed";
    case "PRE_MARKET":
      return "in pre-market";
    case "POST_MARKET":
      return "in after-hours trading";
    default:
      return "in an unknown state";
  }
}
