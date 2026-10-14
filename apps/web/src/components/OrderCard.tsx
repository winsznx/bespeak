"use client";

import {useState} from "react";
import Link from "next/link";
import {usePublicClient, useWriteContract} from "wagmi";
import type {Address} from "viem";
import {BespeakOrderManagerAbi, BespeakOrderManagerV1Abi} from "@bespeak/sdk";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {clientDeployment, legacyDeployment} from "@/lib/addresses";
import {formatAmount, formatUtcShort} from "@/lib/format";
import type {OrderRecord} from "@/lib/useOrders";
import type {MarketState} from "@/lib/useMarketState";
import {AssetIdentity, TokenIdentity} from "@/components/identity";
import {Countdown} from "./Countdown";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  /// Needed only to render a sell, whose amount is denominated in the asset rather than in
  /// a stablecoin. Every xStock wrapper in the registry is 18dp, so that is the fallback,
  /// but the real value is passed where the caller has it rather than assumed everywhere.
  wrapperDecimals?: number | null;
}
interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

/// A standing instruction as an object, with a different composition per state rather than
/// the same card wearing a different badge.
///
/// Waiting is calm and gives the condition prominence. Bespeak is holding the instruction,
/// nothing is broken. Held raises attention without implying failure. Filled is conclusive
/// and lets the figures dominate. Cancelled and expired recede into history.
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
  const selling = order.side === 1;

  // What was spent. On a buy that is a stablecoin; on a sell it is the xStock itself, which
  // is not in `stables` at all. Resolving only against stables left a sell showing no
  // amount and describing itself as a purchase.
  const stable = stables.find((s) => s.address.toLowerCase() === order.inputToken.toLowerCase());
  const spentToken = selling
    ? asset
      ? {symbol: asset.symbol, decimals: asset.wrapperDecimals ?? 18}
      : undefined
    : stable
      ? {symbol: stable.symbol, decimals: stable.decimals}
      : undefined;
  // A sell is denominated in the asset, so a currency prefix would misstate the number.
  const unitPrefix = selling ? "" : "$";
  const d = clientDeployment();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = spentToken ? formatAmount(order.amountIn, spentToken.decimals) : "n/a";
  const symbol = asset?.underlyingSymbol ?? "Asset";

  async function cancel() {
    if (!d || !publicClient) return;
    setBusy(true);
    setErr(null);
    try {
      // Cancel on the manager that actually holds this order. Sending a v1 order id to the
      // v1.1 manager reverts with UnknownOrder, so the user's capital would stay reserved
      // while the interface told them the cancel had failed for no stated reason.
      const legacy = order.generation === "v1" ? legacyDeployment() : null;
      const manager = legacy?.orderManager ?? d.orderManager;
      const abi = legacy ? BespeakOrderManagerV1Abi : BespeakOrderManagerAbi;

      const hash = await writeContractAsync({
        address: manager,
        abi,
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

  // ---- filled ----
  if (order.status === OrderStatus.FILLED) {
    return (
      <article
        className="module settle"
        style={{borderColor: "var(--success-line)", overflow: "hidden"}}
      >
        <div className="module-pad">
          <div className="between" style={{alignItems: "flex-start", marginBottom: 18}}>
            <div className="row g3">
              <Seal />
              <div>
                <div className="t-h3">{symbol} {selling ? "sold" : "purchased"}</div>
                <div className="t-xs faint">
                  Executed under {conditionPhrase(order.triggerType)}
                </div>
              </div>
            </div>
            <span className="chip chip-success">Verified</span>
          </div>
          <div className="t-figure" style={{color: "var(--success)"}}>
            {unitPrefix}
            {amount}
          </div>
          <div className="row g2 t-xs faint" style={{marginTop: 6}}>
            spent from your vault
            {spentToken && <TokenIdentity symbol={spentToken.symbol} size="xs" muted />}
          </div>
        </div>
        <div
          className="row g2"
          style={{padding: "14px 24px", borderTop: "1px solid var(--line)", background: "var(--surface-2)"}}
        >
          <Link href={`/receipt/${order.id}`} className="btn btn-sm">
            View receipt
          </Link>
        </div>
      </article>
    );
  }

  // ---- historical ----
  if (order.status === OrderStatus.CANCELLED || order.status === OrderStatus.EXPIRED) {
    return (
      <article
        className="module module-pad"
        style={{background: "var(--surface-2)", borderColor: "transparent"}}
      >
        <div className="between">
          <AssetIdentity
            symbol={asset?.symbol ?? ""}
            underlyingSymbol={`$${amount} of ${symbol}`}
            variant="row"
            sub={
              order.status === OrderStatus.CANCELLED
                ? "Cancelled — funds returned to your vault"
                : "Expired without executing — funds returned"
            }
          />
          <span className="chip chip-inactive">
            {order.status === OrderStatus.CANCELLED ? "Cancelled" : "Expired"}
          </span>
        </div>
      </article>
    );
  }

  // ---- waiting / held ----
  const explain = explainWait(order, market, sourceReachable);

  return (
    <article className="module module-pad">
      <div className="between" style={{alignItems: "flex-start", marginBottom: 20}}>
        <AssetIdentity
          symbol={asset?.symbol ?? ""}
          underlyingSymbol={symbol}
          variant="header"
          sub={conditionPhrase(order.triggerType)}
        />
        <span className="row g2">
          {selling && <span className="chip chip-outline">Sell</span>}
          <span className="chip chip-waiting">
            <span className="dot" />
            {explain.attention ? "Needs attention" : "Waiting"}
          </span>
        </span>
      </div>

      <div className="row wrap g8" style={{marginBottom: 20}}>
        <div>
          <div className="t-label" style={{marginBottom: 6}}>
            Reserved
          </div>
          <div className="t-figure-sm">
            {unitPrefix}
            {amount}
          </div>
          {spentToken && (
            <div style={{marginTop: 6}}>
              <TokenIdentity symbol={spentToken.symbol} size="xs" muted />
            </div>
          )}
        </div>
        {order.triggerType === TriggerType.NEXT_REGULAR_SESSION && market?.nextChangeAt && (
          <div>
            <div className="t-label" style={{marginBottom: 6}}>
              Session changes in
            </div>
            <div className="t-figure-sm">
              <Countdown to={market.nextChangeAt} />
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          borderRadius: "var(--r-control)",
          padding: "14px 16px",
          marginBottom: 16,
          background: explain.attention ? "var(--waiting-soft)" : "var(--surface-2)",
          border: `1px solid ${explain.attention ? "var(--waiting-line)" : "transparent"}`,
        }}
      >
        <div
          className="t-sm"
          style={{color: explain.attention ? "var(--waiting)" : "var(--ink)", fontWeight: 500}}
        >
          {explain.headline}
        </div>
        {explain.detail && (
          <div className="t-xs muted prose" style={{marginTop: 4}}>
            {explain.detail}
          </div>
        )}
      </div>

      <div className="between">
        <span className="t-xs faint">
          Expires {formatUtcShort(new Date(Number(order.expiresAt) * 1000))}
        </span>
        <button className="btn btn-sm" onClick={cancel} disabled={busy}>
          {busy ? "Cancelling…" : "Cancel"}
        </button>
      </div>

      {err && (
        <p className="t-sm" style={{color: "var(--danger)", margin: "12px 0 0"}}>
          {err}
        </p>
      )}
    </article>
  );
}

function Seal() {
  return (
    <span style={{width: 38, height: 38, flex: "none", display: "grid", placeItems: "center"}}>
      <svg width="38" height="38" viewBox="0 0 38 38" fill="none" className="draw">
        <circle cx="19" cy="19" r="18" fill="var(--success-soft)" stroke="var(--success-line)" />
        <path
          d="M12 19.4l4.6 4.6L26 14.6"
          stroke="var(--success)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function explainWait(
  order: OrderRecord,
  market: MarketState | undefined,
  sourceReachable: boolean,
): {headline: string; detail?: React.ReactNode; attention?: boolean} {
  const now = Date.now();

  if (Number(order.validAfter) * 1000 > now) {
    return {
      headline: "Scheduled to start later",
      detail: `Starts ${formatUtcShort(new Date(Number(order.validAfter) * 1000))}.`,
    };
  }
  if (order.triggerType === TriggerType.IMMEDIATE) {
    return {headline: "Queued for execution on the next pass."};
  }
  if (order.triggerType === TriggerType.WHEN_AVAILABLE) {
    return {
      headline: "Waiting for this asset to become tradable on X Layer.",
      detail: "Funds stay reserved until it is, or until the deadline — whichever comes first.",
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
    detail: `Market is ${phrase(market.marketStatus)}. Your funds stay reserved and are released the moment you cancel.`,
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

function conditionPhrase(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Buy now";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "the next regular session";
  return "availability on X Layer";
}
