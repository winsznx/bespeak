"use client";

import Link from "next/link";
import {useMemo, useState} from "react";
import {useSearchParams} from "next/navigation";
import {AssetGlyph} from "@/components/ui/AssetGlyph";
import {Icon} from "@/components/ui/Icon";

export interface MarketRow {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  open: boolean;
  halted: boolean;
  sessionLabel: string;
  payWith: string | null;
  depth: number | null;
  pool: string | null;
  feeTier: number | null;
  verified: boolean;
}

type Filter = "all" | "open" | "usdg" | "usdc";

/// Markets. A dense, useful table on desktop; stacked rows on mobile.
///
/// "Pay with" is a real per-asset fact, not a global default: liquidity for NVDA is quoted
/// in USDG and for TSLA in USDC, and offering the wrong one produces an order that can
/// never route.
export function MarketsClient({
  rows,
  sourceReachable,
  registry,
}: {
  rows: MarketRow[];
  sourceReachable: boolean;
  registry: {
    sourceUri: string;
    sourceRevision: string;
    sourceFetchedAt: string;
    catalogueSize: number;
    chainId: number;
  };
}) {
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "open" && !r.open) return false;
      if (filter === "usdg" && r.payWith !== "USDG") return false;
      if (filter === "usdc" && r.payWith !== "USDC") return false;
      if (!needle) return true;
      return (
        r.underlyingSymbol.toLowerCase().includes(needle) ||
        r.symbol.toLowerCase().includes(needle) ||
        r.name.toLowerCase().includes(needle)
      );
    });
  }, [rows, q, filter]);

  const openCount = rows.filter((r) => r.open).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Markets</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            Official xStocks Bespeak can execute on X Layer, each verified on chain.
          </p>
        </div>
      </div>

      <div className="row wrap g3" style={{marginBottom: 20}}>
        <div className="searchfield" style={{maxWidth: 320, flex: "1 1 240px"}}>
          <Icon name="search" size={17} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter assets"
            aria-label="Filter assets"
          />
        </div>
        <div className="row g1" role="tablist" aria-label="Market filters">
          {(
            [
              ["all", `All ${rows.length}`],
              ["open", `In session ${openCount}`],
              ["usdg", "USDG"],
              ["usdc", "USDC"],
            ] as Array<[Filter, string]>
          ).map(([k, lbl]) => (
            <button
              key={k}
              role="tab"
              aria-selected={filter === k}
              className="btn btn-sm"
              onClick={() => setFilter(k)}
              style={
                filter === k
                  ? {background: "var(--ink)", borderColor: "var(--ink)", color: "var(--surface)"}
                  : undefined
              }
            >
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {!sourceReachable && (
        <p
          className="t-sm"
          style={{
            color: "var(--waiting)",
            background: "var(--waiting-soft)",
            border: "1px solid var(--waiting-line)",
            borderRadius: "var(--r-control)",
            padding: "12px 14px",
            marginBottom: 18,
          }}
        >
          The market-session source is unreachable, so sessions read as unknown. Orders hold
          rather than execute on an unknown session.
        </p>
      )}

      {/* Desktop table */}
      <div className="module" style={{padding: "4px 24px", overflowX: "auto"}} data-desktop-table>
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Underlying market</th>
              <th>X Layer</th>
              <th>Pay with</th>
              <th className="num">Route liquidity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.assetId}>
                <td>
                  <Link href={`/asset/${r.symbol}`} className="row g3">
                    <AssetGlyph symbol={r.symbol} size={32} />
                    <span style={{minWidth: 0}}>
                      <span className="t-h4" style={{display: "block"}}>
                        {r.underlyingSymbol}
                      </span>
                      <span className="t-xs faint truncate" style={{display: "block"}}>
                        {r.name}
                      </span>
                    </span>
                  </Link>
                </td>
                <td>
                  {r.halted ? (
                    <span className="chip chip-danger">Halted</span>
                  ) : (
                    <span className="t-sm muted">{r.sessionLabel}</span>
                  )}
                </td>
                <td>
                  <span className="t-sm" style={{color: r.payWith ? "var(--success)" : "var(--ink-3)"}}>
                    {r.payWith ? "Trading" : "No route"}
                  </span>
                </td>
                <td>
                  {r.payWith ? (
                    <span className="chip chip-outline">{r.payWith}</span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td className="num t-sm muted">
                  {r.depth !== null
                    ? `$${r.depth.toLocaleString("en-US", {maximumFractionDigits: 0})}`
                    : "—"}
                </td>
                <td className="num">
                  <Link href={`/asset/${r.symbol}`} className="btn btn-sm">
                    {r.open ? "Buy now" : "Schedule"}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile rows */}
      <div className="col g3" data-mobile-rows>
        {shown.map((r) => (
          <Link href={`/asset/${r.symbol}`} className="module module-pad" key={r.assetId}>
            <div className="row g3" style={{marginBottom: 14}}>
              <AssetGlyph symbol={r.symbol} size={36} />
              <div className="grow" style={{minWidth: 0}}>
                <div className="t-h4">{r.underlyingSymbol}</div>
                <div className="t-xs faint truncate">{r.name}</div>
              </div>
              {r.halted ? (
                <span className="chip chip-danger">Halted</span>
              ) : (
                <span className={r.open ? "chip chip-success" : "chip chip-inactive"}>
                  {r.sessionLabel}
                </span>
              )}
            </div>
            <div className="row wrap g4 t-xs muted">
              <span>
                Pay with <strong style={{color: "var(--ink)"}}>{r.payWith ?? "—"}</strong>
              </span>
              <span>
                Liquidity{" "}
                <strong style={{color: "var(--ink)"}}>
                  {r.depth !== null
                    ? `$${r.depth.toLocaleString("en-US", {maximumFractionDigits: 0})}`
                    : "—"}
                </strong>
              </span>
            </div>
          </Link>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="empty-state">
          <div className="t-h3">No assets match</div>
          <p className="t-sm muted">Try a different search or filter.</p>
        </div>
      )}

      <details className="tech" style={{marginTop: 28}}>
        <summary>Where this list comes from</summary>
        <dl className="kv" style={{paddingBottom: 24}}>
          <dt>Provenance source</dt>
          <dd className="mono">{registry.sourceUri}</dd>
          <dt>Source revision</dt>
          <dd className="mono">{registry.sourceRevision}</dd>
          <dt>Fetched at</dt>
          <dd className="mono">{registry.sourceFetchedAt}</dd>
          <dt>Issuer catalogue</dt>
          <dd>{registry.catalogueSize} assets</dd>
          <dt>Supported here</dt>
          <dd>
            {rows.length} — restricted to assets with a verified X Layer deployment and a
            discovered executable route
          </dd>
          <dt>Route discovery</dt>
          <dd>
            Executable pairs and depth were found by scanning the X Layer V3 factory on
            chain, not assumed from issuer metadata.
          </dd>
          <dt>Chain</dt>
          <dd>X Layer mainnet · {registry.chainId}</dd>
        </dl>
      </details>
    </>
  );
}
