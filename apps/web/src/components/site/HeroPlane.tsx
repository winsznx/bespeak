"use client";

import Link from "next/link";
import {AssetGlyph} from "@/components/ui/AssetGlyph";
import {Countdown} from "@/components/Countdown";

/// The hero's main product plane: an oversized, real Bespeak order composition rather than
/// an invented illustration. Everything on it — the session state, the payment asset, the
/// next eligible time — is the same information the product shows on the asset page.
export function HeroPlane({
  symbol,
  name,
  open,
  payWith,
  nextOpenIso,
  nextOpenLabel,
}: {
  symbol: string;
  name: string;
  open: boolean;
  payWith: string;
  nextOpenIso: string;
  nextOpenLabel: string;
}) {
  return (
    <div className="hero-plane">
      <div className="between" style={{marginBottom: 22}}>
        <div className="row g3">
          <AssetGlyph symbol={symbol} size={40} />
          <div>
            <div className="t-h3">{name}</div>
            <div className="t-xs faint">{symbol} · Official xStock</div>
          </div>
        </div>
        <span className={open ? "chip chip-success" : "chip chip-waiting"}>
          <span className="dot" />
          {open ? "Regular session" : "After hours"}
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 22,
        }}
      >
        <div style={{padding: "16px 16px 16px 0"}}>
          <div className="t-label" style={{marginBottom: 7}}>
            Underlying market
          </div>
          <div className="t-figure-sm">{open ? "Open" : "Closed"}</div>
        </div>
        <div style={{padding: "16px 0 16px 16px", borderLeft: "1px solid var(--line)"}}>
          <div className="t-label" style={{marginBottom: 7}}>
            X Layer
          </div>
          <div className="t-figure-sm" style={{color: "var(--success)"}}>
            Trading
          </div>
        </div>
      </div>

      <div className="t-label" style={{marginBottom: 12}}>
        When should Bespeak buy?
      </div>

      <div
        className="between"
        style={{
          padding: "14px 16px",
          borderRadius: "var(--r-control)",
          border: "1px solid var(--brand)",
          boxShadow: "0 0 0 1px var(--brand)",
          marginBottom: 18,
        }}
      >
        <div>
          <div className="t-h4" style={{marginBottom: 2}}>
            Next regular session
          </div>
          <div className="t-xs muted">
            Eligible in <Countdown to={nextOpenIso} /> · {nextOpenLabel}
          </div>
        </div>
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--brand)",
            display: "grid",
            placeItems: "center",
            flex: "none",
          }}
        >
          <span style={{width: 6, height: 6, borderRadius: 999, background: "#fff"}} />
        </span>
      </div>

      <div className="between" style={{marginBottom: 18}}>
        <span className="t-sm muted">Amount</span>
        <span className="t-figure-sm">
          $500 <span className="t-sm muted">{payWith}</span>
        </span>
      </div>

      <Link href={`/asset/${symbol}x`} className="btn btn-primary btn-block">
        Review order
      </Link>
    </div>
  );
}
