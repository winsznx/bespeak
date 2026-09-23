"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import {useAccount} from "wagmi";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {useOrderRecords} from "@/lib/useOrders";
import {AssetIdentity} from "@/components/identity";

interface AssetRow {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  payWith: string | null;
}

/// Real command search. The ⌘K badge in the top bar is only shown because this exists —
/// advertising a shortcut that does nothing is worse than having no shortcut.
///
/// Resolves supported assets by ticker, xStock symbol or company name ("NVIDIA", "NVDA",
/// "Tesla", "TSLA"), and a connected wallet's orders by asset or order id. Keyboard
/// driven throughout, with focus returned to the page on close.
export function CommandSearch({open, onClose}: {open: boolean; onClose: () => void}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const {address} = useAccount();
  const {orders} = useOrderRecords(address);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [open]);

  // The asset list is small and static per deployment; fetch once on first open.
  useEffect(() => {
    if (!open || assets.length > 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/assets");
        if (!res.ok) return;
        const data = (await res.json()) as {
          assets: Array<{
            assetId: string;
            symbol: string;
            underlyingSymbol: string;
            name: string;
            route: {payWith: string} | null;
          }>;
        };
        if (cancelled) return;
        setAssets(
          data.assets.map((a) => ({
            assetId: a.assetId,
            symbol: a.symbol,
            underlyingSymbol: a.underlyingSymbol,
            name: a.name.replace(" xStock", ""),
            payWith: a.route?.payWith ?? null,
          })),
        );
      } catch {
        /* search degrades to orders only */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, assets.length]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out: Array<{
      key: string;
      kind: "asset" | "order";
      href: string;
      asset?: AssetRow;
      label?: string;
      sub?: string;
    }> = [];

    for (const a of assets) {
      if (
        !needle ||
        a.underlyingSymbol.toLowerCase().includes(needle) ||
        a.symbol.toLowerCase().includes(needle) ||
        a.name.toLowerCase().includes(needle)
      ) {
        out.push({key: `a-${a.assetId}`, kind: "asset", href: `/asset/${a.symbol}`, asset: a});
      }
    }

    if (address) {
      for (const o of orders) {
        const a = assets.find((x) => x.assetId.toLowerCase() === o.assetId.toLowerCase());
        const hay = `${a?.underlyingSymbol ?? ""} ${a?.name ?? ""} ${o.id}`.toLowerCase();
        if (needle && !hay.includes(needle)) continue;
        if (!needle && out.length > 6) break;
        out.push({
          key: `o-${o.id}`,
          kind: "order",
          href: o.status === OrderStatus.FILLED ? `/receipt/${o.id}` : "/orders",
          ...(a ? {asset: a} : {}),
          label: `${a?.underlyingSymbol ?? "Order"} · ${statusLabel(o.status)}`,
          sub: `${triggerLabel(o.triggerType)} · order ${o.id.slice(0, 10)}`,
        });
      }
    }

    return out.slice(0, 10);
  }, [q, assets, orders, address]);

  useEffect(() => {
    setCursor(0);
  }, [q]);

  if (!open) return null;

  function go(href: string) {
    onClose();
    router.push(href);
  }

  return (
    <div
      className="cmd-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search markets or orders"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cmd-panel">
        <div className="cmd-input">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search markets or orders"
            aria-label="Search markets or orders"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const r = results[cursor];
                if (r) go(r.href);
              }
            }}
          />
          <button type="button" className="kbd" onClick={onClose}>
            Esc
          </button>
        </div>

        <div className="cmd-results">
          {results.length === 0 ? (
            <div className="cmd-empty">
              <div className="t-sm" style={{fontWeight: 500, marginBottom: 4}}>
                {q ? `Nothing matches “${q}”` : "Start typing"}
              </div>
              <p className="t-xs muted prose" style={{margin: 0}}>
                Search by ticker, company name or xStock symbol — NVDA, NVIDIA, NVDAx.
                {address ? " Your orders are searchable too." : ""}
              </p>
            </div>
          ) : (
            results.map((r, i) => (
              <button
                key={r.key}
                type="button"
                className="cmd-row"
                data-active={i === cursor}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(r.href)}
              >
                {r.asset ? (
                  <AssetIdentity
                    symbol={r.asset.symbol}
                    underlyingSymbol={r.label ?? r.asset.underlyingSymbol}
                    variant="row"
                    sub={r.sub ?? r.asset.name}
                  />
                ) : (
                  <span className="t-sm">{r.label}</span>
                )}
                <span className="t-xs faint" style={{marginLeft: "auto"}}>
                  {r.kind === "asset" ? (r.asset?.payWith ?? "") : "Order"}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function statusLabel(s: number): string {
  if (s === OrderStatus.FILLED) return "completed";
  if (s === OrderStatus.CANCELLED) return "cancelled";
  if (s === OrderStatus.EXPIRED) return "expired";
  return "waiting";
}

function triggerLabel(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Buy now";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "Next regular session";
  return "When available";
}

