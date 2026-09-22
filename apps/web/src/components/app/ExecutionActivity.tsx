"use client";

import {OrderStatus} from "@bespeak/shared";
import type {OrderRecord} from "@/lib/useOrders";
import {Skeleton} from "@/components/ui/Skeleton";

/// Seven recent sessions of execution outcomes.
///
/// Built from real order history only. With no history there is no invented curve: the
/// component shows an honest empty state instead, because a decorative chart on a product
/// that has executed nothing is the exact kind of fake statistic this design avoids.
export function ExecutionActivity({
  orders,
  pending,
  connected,
}: {
  orders: OrderRecord[];
  pending: boolean;
  connected: boolean;
}) {
  const days = buildDays(orders);
  const hasData = days.some((d) => d.total > 0);
  const max = Math.max(1, ...days.map((d) => d.total));

  if (pending) {
    return (
      <div className="bars">
        {days.map((d) => (
          <div className="bar-col" key={d.label}>
            <Skeleton w="100%" h={148} r={999} style={{maxWidth: 54}} />
            <Skeleton w={14} h={10} />
          </div>
        ))}
      </div>
    );
  }

  if (!hasData) {
    return (
      <div
        style={{
          height: 180,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          borderRadius: "var(--r-control)",
          background: "var(--surface-2)",
        }}
      >
        <div style={{maxWidth: "42ch", padding: "0 20px"}}>
          <div className="t-h4" style={{marginBottom: 5}}>
            No executions yet
          </div>
          <p className="t-sm muted prose" style={{margin: 0}}>
            {connected
              ? "Once your orders start filling, the last seven sessions appear here."
              : "Connect a wallet to see execution history."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="bars">
        {days.map((d) => (
          <div className="bar-col" key={d.label}>
            <div className="bar-track" title={`${d.label}: ${d.total} events`}>
              {d.filled > 0 && (
                <div
                  className="bar-fill"
                  style={{
                    height: `${(d.filled / max) * 100}%`,
                    background: "var(--success)",
                  }}
                />
              )}
              {d.waiting > 0 && (
                <div
                  className="bar-fill"
                  style={{
                    height: `${(d.waiting / max) * 100}%`,
                    background: "var(--brand)",
                  }}
                />
              )}
              {d.ended > 0 && (
                <div
                  className="bar-fill"
                  style={{
                    height: `${(d.ended / max) * 100}%`,
                    background: "var(--surface-3)",
                  }}
                />
              )}
            </div>
            <span className="bar-label">{d.label}</span>
          </div>
        ))}
      </div>

      <div className="row wrap g5" style={{marginTop: 18}}>
        <Legend tone="var(--success)" label="Filled" />
        <Legend tone="var(--brand)" label="Waiting" />
        <Legend tone="var(--surface-3)" label="Ended" />
      </div>
    </>
  );
}

function Legend({tone, label}: {tone: string; label: string}) {
  return (
    <span className="row g2 t-xs muted">
      <span style={{width: 9, height: 9, borderRadius: 3, background: tone}} />
      {label}
    </span>
  );
}

interface Day {
  label: string;
  filled: number;
  waiting: number;
  ended: number;
  total: number;
}

function buildDays(orders: OrderRecord[]): Day[] {
  const out: Day[] = [];
  const now = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
    const end = start + 86_400;

    let filled = 0;
    let waiting = 0;
    let ended = 0;
    for (const o of orders) {
      const t = Number(o.createdAt);
      if (t < start || t >= end) continue;
      if (o.status === OrderStatus.FILLED) filled++;
      else if (o.status === OrderStatus.ACTIVE) waiting++;
      else ended++;
    }

    out.push({
      label: d.toLocaleDateString("en-US", {weekday: "narrow"}),
      filled,
      waiting,
      ended,
      total: filled + waiting + ended,
    });
  }
  return out;
}
