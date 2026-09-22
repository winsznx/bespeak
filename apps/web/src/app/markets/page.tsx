import Link from "next/link";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY} from "@/lib/server";

export const revalidate = 30;

export default async function MarketsPage() {
  const symbols = REGISTRY.assets.map((a) => a.symbol);
  let sessions = new Map<string, SessionObservation>();
  let sourceReachable = true;
  try {
    sessions = await observeSessions(symbols);
  } catch {
    sourceReachable = false;
  }

  const openCount = [...sessions.values()].filter(
    (s) => s.marketStatus === MarketStatus.REGULAR,
  ).length;

  return (
    <section style={{paddingTop: 48, paddingBottom: 24}}>
      <h1 className="mb-8">Markets</h1>
      <p className="lede mb-32">
        Official xStocks that Bespeak can execute on X Layer. Each one was pinned from the
        issuer&apos;s public record, then re-read on chain to confirm the token and its
        wrapper are what the issuer says.
      </p>

      {!sourceReachable ? (
        <p className="note note-waiting mb-24">
          The market-session source is unreachable, so sessions read as unknown. Orders hold
          rather than execute on an unknown session.
        </p>
      ) : (
        <p className="tiny faint mb-24">
          {openCount} of {symbols.length} underlying markets are in their regular session
          right now. Tokens trade on X Layer regardless.
        </p>
      )}

      <div style={{overflowX: "auto"}}>
        <table className="table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Underlying market</th>
              <th>X Layer</th>
              <th>Hours</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {REGISTRY.assets.map((a) => {
              const s = sessions.get(a.symbol);
              const open = s?.marketStatus === MarketStatus.REGULAR;
              return (
                <tr key={a.symbol} className="row-link">
                  <td>
                    <Link href={`/asset/${a.symbol}`}>
                      <div className="strong">{a.underlyingSymbol}</div>
                      <div className="tiny faint">{a.name.replace(" xStock", "")}</div>
                    </Link>
                  </td>
                  <td>
                    {s?.halted ? (
                      <span className="badge badge-failed">Halted</span>
                    ) : (
                      <span className="small muted">{label(s?.marketStatus)}</span>
                    )}
                  </td>
                  <td>
                    <span className="small" style={{color: "var(--filled)"}}>
                      Trading
                    </span>
                  </td>
                  <td className="small faint">
                    {a.tradingHoursMode === "TwentyFourFive" ? "24/5" : a.tradingHoursMode}
                  </td>
                  <td className="num">
                    <Link href={`/asset/${a.symbol}`} className="btn btn-sm">
                      {open ? "Buy now" : "Schedule"}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="tech mt-32">
        <summary>Where this list comes from</summary>
        <dl className="kv" style={{paddingBottom: 24}}>
          <dt>Provenance source</dt>
          <dd className="mono">{REGISTRY.sourceUri}</dd>
          <dt>Source revision</dt>
          <dd className="mono">{REGISTRY.sourceRevision}</dd>
          <dt>Fetched at</dt>
          <dd className="mono">{REGISTRY.sourceFetchedAt}</dd>
          <dt>Issuer catalogue</dt>
          <dd>{REGISTRY.catalogueSize} assets</dd>
          <dt>Supported here</dt>
          <dd>
            {REGISTRY.assets.length} — restricted to assets with a verified X Layer
            deployment, not the whole catalogue
          </dd>
          <dt>Chain</dt>
          <dd>X Layer mainnet · {REGISTRY.chainId}</dd>
        </dl>
      </details>
    </section>
  );
}

function label(status: number | undefined): string {
  switch (status) {
    case MarketStatus.REGULAR:
      return "Open";
    case MarketStatus.CLOSED:
      return "Closed";
    case MarketStatus.PRE_MARKET:
      return "Pre-market";
    case MarketStatus.POST_MARKET:
      return "After hours";
    default:
      return "Unknown";
  }
}
