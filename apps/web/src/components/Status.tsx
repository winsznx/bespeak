import {MarketStatus} from "@bespeak/shared";

const SESSION_LABEL: Record<number, string> = {
  [MarketStatus.UNKNOWN]: "Unknown",
  [MarketStatus.CLOSED]: "Closed",
  [MarketStatus.PRE_MARKET]: "Pre-market",
  [MarketStatus.REGULAR]: "Open",
  [MarketStatus.POST_MARKET]: "After hours",
};

/// The underlying US equity session. Deliberately distinct from whether the token can be
/// traded on X Layer: those are two different facts, and conflating them is what makes a
/// conditioned order impossible to reason about (PRD 10.2).
export function SessionPill({status}: {status: number}) {
  const open = status === MarketStatus.REGULAR;
  const cls = open ? "pill pill-open" : status === MarketStatus.UNKNOWN ? "pill pill-off" : "pill pill-wait";
  return (
    <span className={cls}>
      <span className="dot" />
      {SESSION_LABEL[status] ?? "Unknown"}
    </span>
  );
}

export function OrderStatePill({label, tone}: {label: string; tone: "wait" | "done" | "off" | "bad" | "open"}) {
  return <span className={`pill pill-${tone}`}>{label}</span>;
}
