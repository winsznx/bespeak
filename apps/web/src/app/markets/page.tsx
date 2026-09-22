import Link from "next/link";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {REGISTRY} from "@/lib/server";
import {SessionPill} from "@/components/Status";

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

  return (
    <>
      <section className="section">
        <h1>Markets</h1>
        <p className="lede">
          Official xStocks that Bespeak can execute on X Layer. Each asset was pinned from
          the issuer&apos;s public API and then re-read on chain to confirm the token and its
          wrapper are what the issuer says they are.
        </p>

        {!sourceReachable && (
          <div className="notice notice-wait" style={{marginBottom: 16}}>
            The market-session source is unreachable right now, so sessions read as Unknown.
            Orders will hold rather than execute on an unknown session.
          </div>
        )}

        <div className="card" style={{padding: 0, overflowX: "auto"}}>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>xStock</th>
                <th>Underlying market</th>
                <th>X Layer</th>
                <th>Schedule</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {REGISTRY.assets.map((a) => {
                const s = sessions.get(a.symbol);
                return (
                  <tr key={a.symbol}>
                    <td>
                      <div className="stack">
                        <strong>{a.underlyingSymbol}</strong>
                        <span className="tiny muted">{a.name.replace(" xStock", "")}</span>
                      </div>
                    </td>
                    <td className="small muted">{a.symbol}</td>
                    <td>
                      {s?.halted ? (
                        <span className="pill pill-bad">Halted</span>
                      ) : (
                        <SessionPill status={s?.marketStatus ?? 0} />
                      )}
                    </td>
                    <td>
                      {a.onchainVerified ? (
                        <span className="pill pill-open">
                          <span className="dot" />
                          Verified
                        </span>
                      ) : (
                        <span className="pill pill-off">Unverified</span>
                      )}
                    </td>
                    <td className="small muted">
                      {a.tradingHoursMode === "TwentyFourFive" ? "24/5" : a.tradingHoursMode}
                    </td>
                    <td className="num">
                      <Link href={`/asset/${a.symbol}`} className="btn btn-sm">
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details className="tech" style={{marginTop: 16}}>
          <summary>Where this list comes from</summary>
          <dl className="kv">
            <dt>Provenance source</dt>
            <dd>{REGISTRY.sourceUri}</dd>
            <dt>Source revision</dt>
            <dd>{REGISTRY.sourceRevision}</dd>
            <dt>Fetched at</dt>
            <dd>{REGISTRY.sourceFetchedAt}</dd>
            <dt>Issuer catalogue size</dt>
            <dd>{REGISTRY.catalogueSize} assets</dd>
            <dt>Supported here</dt>
            <dd>
              {REGISTRY.assets.length} — restricted to assets with a proven X Layer
              deployment and route, not the whole catalogue
            </dd>
            <dt>Chain</dt>
            <dd>X Layer mainnet, chain id {REGISTRY.chainId}</dd>
          </dl>
        </details>
      </section>
    </>
  );
}
