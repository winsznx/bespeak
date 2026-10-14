import {headers} from "next/headers";
import {REGISTRY} from "@/lib/server";

import type {Metadata} from "next";
import {OnChainRef} from "@/components/ui/OnChainRef";

export const metadata: Metadata = {
  title: "Automations",
  description:
    "Bespeak's read API for agents and integrators. Every state change stays a wallet-authorized transaction the caller builds themselves.",
  alternates: {canonical: "/automations"},
};

export const dynamic = "force-dynamic";

/// Automations is a connection surface, not an AI marketing page. It documents the
/// read API an agent or integrator actually uses, and states plainly that Bespeak never
/// signs or custodies on someone's behalf.
export default async function AutomationsPage() {
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = host.startsWith("localhost") ? "http" : "https";
  const base = `${proto}://${host}`;

  const OPS = [
    {method: "GET", path: "/api/assets", what: "Supported assets, provenance and the executable pair per asset"},
    {method: "GET", path: "/api/markets", what: "Live session state; eligibleForRegularSession decides eligibility"},
    {method: "GET", path: "/api/vault/:wallet", what: "Available and reserved balance, read from the vault contract"},
    {method: "GET", path: "/api/orders/:wallet", what: "Orders read from the order manager, never from a cache"},
    {method: "GET", path: "/api/demand", what: "Committed capital on active WHEN_AVAILABLE orders"},
    {method: "GET", path: "/api/receipts/:id", what: "The canonical machine-readable receipt"},
    {method: "GET", path: "/api/health", what: "Chain, condition source and deployment status"},
    {method: "GET", path: "/api/basis", what: "Open dataset: measured round-trip cost per asset, by session state"},
    {method: "GET", path: "/api/basis/:symbol", what: "One asset's cost series, newest first"},
    {method: "GET", path: "/api/basis.csv", what: "The whole dataset as a file. ?symbol= ?since= ?limit="},
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Automations</h1>
          <p className="t-sm muted prose" style={{margin: 0, maxWidth: "58ch"}}>
            Bespeak exposes the same product to agents and integrators through a read API.
            Every state change stays a wallet-authorized transaction the caller builds
            themselves. Nothing here signs or takes custody on your behalf.
          </p>
        </div>
      </div>

      <section className="module module-pad" style={{marginBottom: 16}}>
        <div className="t-label" style={{marginBottom: 10}}>
          Base URL
        </div>
        <div className="mono" style={{fontSize: 14}}>
          {base}
        </div>
      </section>

      <section className="module" style={{padding: "4px 24px", marginBottom: 16, overflowX: "auto"}}>
        <table className="table table-stack">
          <thead>
            <tr>
              <th style={{width: 70}}>Method</th>
              <th>Endpoint</th>
              <th>Returns</th>
            </tr>
          </thead>
          <tbody>
            {OPS.map((o) => (
              <tr key={o.path}>
                <td>
                  <span className="chip chip-outline">{o.method}</span>
                </td>
                <td className="mono">{o.path}</td>
                <td className="t-sm muted">{o.what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="module module-pad" style={{marginBottom: 16}}>
        <h2 className="t-h3" style={{marginBottom: 10}}>
          Model Context Protocol
        </h2>
        <p className="t-sm muted prose" style={{margin: "0 0 16px", maxWidth: "62ch"}}>
          The same product as tools an agent can call. Bespeak does something an autonomous
          agent cannot easily do for itself: hold a funded, bounded instruction somewhere
          that will act on it while the agent is not running.
        </p>
        <dl className="kv">
          <dt>Endpoint</dt>
          <dd>
            <span className="mono">https://bespeak-mcp.timjosh507.workers.dev/mcp</span>
          </dd>
          <dt>Transport</dt>
          <dd>Streamable HTTP, JSON-RPC 2.0, protocol 2025-06-18. No authentication.</dd>
          <dt>Tools</dt>
          <dd className="mono t-sm">
            list_assets, market_state, spread, build_order, order_status, receipt
          </dd>
          <dt>Signing</dt>
          <dd>
            Stays with the caller. <span className="mono">build_order</span> returns an
            ordered list of unsigned transactions for your own signer. The server holds no
            key, takes no custody and cannot move funds, which is why it needs no auth.
          </dd>
        </dl>
      </section>

      <section className="module module-pad">
        <h2 className="t-h3" style={{marginBottom: 10}}>
          Status
        </h2>
        <dl className="kv">
          <dt>Registry revision</dt>
          <dd>
            <OnChainRef value={REGISTRY.sourceRevision} kind="hash" />
          </dd>
          <dt>Supported assets</dt>
          <dd>{REGISTRY.assets.length}</dd>
          <dt>Authentication</dt>
          <dd>None. All endpoints are public reads.</dd>
          <dt>Write operations</dt>
          <dd>
            Built and signed by the caller's own wallet against the published contract
            addresses. Bespeak has no endpoint that moves funds.
          </dd>
        </dl>
      </section>
    </>
  );
}
