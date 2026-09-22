import {formatUnits} from "viem";

/// Money, formatted the way a consumer product should: grouped, fixed precision, and never
/// exponential notation for an amount someone is about to spend.
export function formatAmount(raw: bigint, decimals: number, maxFractionDigits = 2): string {
  const asNumber = Number(formatUnits(raw, decimals));
  return asNumber.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(2, maxFractionDigits),
    maximumFractionDigits: maxFractionDigits,
  });
}

export function formatUsd(raw: bigint, decimals: number): string {
  return `$${formatAmount(raw, decimals, 2)}`;
}

/// Token amounts need more precision than currency: a fractional share of NVDA rounded to
/// two places would read as zero.
export function formatToken(raw: bigint, decimals: number): string {
  const n = Number(formatUnits(raw, decimals));
  if (n === 0) return "0";
  if (n < 0.0001) return n.toExponential(2);
  return n.toLocaleString("en-US", {maximumFractionDigits: 6});
}

/// User-facing times are local with an explicit zone, because a schedule shown in the wrong
/// timezone is a schedule the user cannot act on. Receipts stay UTC (PRD 47).
export function formatLocal(date: Date): string {
  const zone = new Intl.DateTimeFormat("en-US", {timeZoneName: "short"})
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${date.toLocaleString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })} ${zone}`;
}

export function formatUtc(date: Date): string {
  return date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

/// When the US regular session next opens, in the user's own timezone.
/// Weekends and the current session are handled; market holidays are not, which is why this
/// is only ever used as a display hint and never as an execution trigger (PRD 21.3).
export function nextRegularSessionOpen(from = new Date()): Date {
  const d = new Date(from);
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(Date.UTC(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate() + i,
      13,
      30,
      0,
    ));
    const day = candidate.getUTCDay();
    if (day === 0 || day === 6) continue;
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  return d;
}
