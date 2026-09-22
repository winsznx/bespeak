"use client";

import {Skeleton} from "@/components/ui/Skeleton";

/// Available versus reserved, as a semicircular gauge.
///
/// The gauge only appears when there is a balance to divide. A ring drawn over a zero
/// balance would imply a state that does not exist, so an empty vault gets an explanation
/// instead of a graphic.
export function VaultAllocation({
  available,
  reserved,
  connected,
  pending,
  symbol,
}: {
  available: bigint | null;
  reserved: bigint | null;
  connected: boolean;
  pending: boolean;
  symbol: string;
}) {
  if (pending) {
    return (
      <div className="col g4" style={{alignItems: "center", paddingTop: 8}}>
        <Skeleton w={190} h={96} r={12} />
        <Skeleton w={130} h={11} />
      </div>
    );
  }

  const total = (available ?? 0n) + (reserved ?? 0n);

  if (!connected || total === 0n) {
    return (
      <div style={{paddingTop: 4}}>
        <p className="t-sm muted prose" style={{margin: "0 0 16px"}}>
          {connected
            ? `Your vault holds no ${symbol} yet. Deposit to reserve capital for an order.`
            : "Connect a wallet to see how your capital is allocated."}
        </p>
        <a href="/vault" className="btn btn-sm">
          {connected ? "Deposit" : "Open vault"}
        </a>
      </div>
    );
  }

  const pct = Number((available! * 10_000n) / total) / 100;
  // Semicircle: 180 degrees of an r=70 arc.
  const R = 70;
  const LEN = Math.PI * R;

  return (
    <div>
      <div style={{position: "relative", display: "grid", placeItems: "center", marginBottom: 8}}>
        <svg width="190" height="112" viewBox="0 0 190 112" role="img" aria-label={`${pct.toFixed(0)}% available`}>
          <path
            d={`M 25 100 A ${R} ${R} 0 0 1 165 100`}
            fill="none"
            stroke="var(--surface-3)"
            strokeWidth="18"
            strokeLinecap="round"
          />
          <path
            d={`M 25 100 A ${R} ${R} 0 0 1 165 100`}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="18"
            strokeLinecap="round"
            strokeDasharray={`${(pct / 100) * LEN} ${LEN}`}
          />
        </svg>
        <div style={{position: "absolute", bottom: 4, textAlign: "center"}}>
          <div className="t-figure-sm">{pct.toFixed(0)}%</div>
          <div className="t-xs faint">Available</div>
        </div>
      </div>

      <div className="row wrap g5">
        <span className="row g2 t-xs muted">
          <span style={{width: 9, height: 9, borderRadius: 3, background: "var(--brand)"}} />
          Available
        </span>
        <span className="row g2 t-xs muted">
          <span style={{width: 9, height: 9, borderRadius: 3, background: "var(--surface-3)"}} />
          Reserved
        </span>
      </div>
    </div>
  );
}
