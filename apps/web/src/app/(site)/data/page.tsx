import type {Metadata} from "next";
import Link from "next/link";
import {SpreadChart} from "@/components/data/SpreadChart";
import {AssetIdentity} from "@/components/identity";
import {coverage, latestPerAsset, perAssetBySession, sessionLabel, sessionStats} from "@/lib/dataset";

export const metadata: Metadata = {
  title: "Open data: what xStocks cost to trade on X Layer",
  description:
    "An open, continuously sampled dataset of executable round-trip cost for official " +
    "xStocks on X Layer, tagged with the underlying equity's session state. CSV and API, " +
    "free for anyone.",
  alternates: {canonical: "/data"},
  openGraph: {
    title: "Bespeak open data: xStocks execution cost on X Layer",
    description:
      "Executable round-trip cost for official xStocks on X Layer, by session state. " +
      "CSV and API.",
    url: "/data",
  },
};

export const revalidate = 60;

function bps(v: number | null | undefined, digits = 1): string {
  return v === null || v === undefined ? "n/a" : `${v.toFixed(digits)} bps`;
}

function when(ts: number | null): string {
  if (!ts) return "n/a";
  return new Date(ts * 1000).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/// The open dataset.
///
/// Everyone in tokenized equities repeats that off-hours pricing is an estimate rather than
/// a market. Nobody on X Layer measures it. Bespeak already runs the two instruments the
/// measurement needs, a session oracle it trusts enough to gate real capital on and an
/// executable quote path, so the marginal cost of publishing this is two API calls per
/// asset per sample, and the result belongs to the ecosystem rather than to us.
///
/// The page leads with the limitation rather than burying it. What is measured is execution
/// cost on X Layer, not basis against the listed equity, and a reader who takes the second
/// claim from a page that only supports the first has been misled by us.
export default async function DataPage() {
  const [cov, stats, byAsset, latest] = await Promise.all([
    coverage(),
    sessionStats(),
    perAssetBySession(),
    latestPerAsset(),
  ]);

  const open = stats.find((s) => s.session === "market");
  const closed = stats.filter((s) => s.session !== "market");
  const closedSamples = closed.reduce((n, s) => n + s.samples, 0);
  const closedMean =
    closedSamples > 0
      ? closed.reduce((n, s) => n + (s.meanBps ?? 0) * s.samples, 0) / closedSamples
      : null;

  const started = cov.firstTs;
  const hasData = cov.totalSamples > 0;

  return (
    <section className="site-inner" style={{padding: "var(--s-12) 0 var(--s-16)"}}>
      <div style={{maxWidth: 940, margin: "0 auto"}}>
        <p className="t-label" style={{color: "var(--brand)", marginBottom: 10}}>
          Open dataset
        </p>
        <h1 className="t-h1" style={{marginBottom: 12}}>
          What an xStock actually costs to trade on X Layer
        </h1>
        <p className="t-body-lg muted prose" style={{maxWidth: 660, margin: "0 0 var(--s-8)"}}>
          Every few minutes Bespeak buys a fixed notional of each official xStock and
          immediately sells back exactly what that bought, as quotes rather than as trades, and
          records what the round trip would have cost. Each sample is tagged with the
          underlying equity&rsquo;s session state. The series is free to read, in JSON or
          CSV, by anyone.
        </p>

        {!hasData ? (
          <div className="module module-pad" style={{marginBottom: "var(--s-8)"}}>
            <h2 className="t-h4" style={{marginBottom: 6}}>
              Collection has not started
            </h2>
            <p className="t-sm muted prose" style={{margin: 0}}>
              No samples are stored yet. The keeper writes one run every few minutes; this
              page will fill in on its own. Nothing is estimated in the meantime.
            </p>
          </div>
        ) : (
          <>
            {open && closedMean !== null && (
              <div className="module module-pad" style={{marginBottom: "var(--s-6)"}}>
                <h2 className="t-h4" style={{marginBottom: 10}}>
                  The finding so far
                </h2>
                <p className="t-body prose" style={{margin: "0 0 4px"}}>
                  A round trip costs{" "}
                  <strong>{bps(open.medianBps)}</strong> while the underlying equity is in
                  its regular session, against <strong>{bps(closedMean)}</strong> when it is
                  not.
                </p>
                <p className="t-sm faint prose" style={{margin: 0}}>
                  Medians at a ${cov.notional ?? 100} quote size, over{" "}
                  {cov.quotedSamples.toLocaleString()} successful samples since{" "}
                  {when(started)}. A short series is a weak claim; this one grows every few
                  minutes and the raw rows are below.
                </p>
              </div>
            )}

            <div className="module module-pad" style={{marginBottom: "var(--s-6)"}}>
              <h2 className="t-h4" style={{marginBottom: 4}}>
                Round-trip cost by session state
              </h2>
              <p className="t-sm muted prose" style={{margin: "0 0 20px"}}>
                Session state as published by the issuer, the same Tier 3 source Bespeak
                gates real orders on.
              </p>
              <SpreadChart stats={stats} />
            </div>

            <div className="facts" style={{marginBottom: "var(--s-8)"}}>
              <div className="fact">
                <div className="t-label muted">Samples</div>
                <div className="t-figure-sm">{cov.totalSamples.toLocaleString()}</div>
              </div>
              <div className="fact">
                <div className="t-label muted">Quoted</div>
                <div className="t-figure-sm">{cov.quotedSamples.toLocaleString()}</div>
              </div>
              <div className="fact">
                <div className="t-label muted">Assets</div>
                <div className="t-figure-sm">{cov.assets}</div>
              </div>
              <div className="fact">
                <div className="t-label muted">Quote size</div>
                <div className="t-figure-sm">${cov.notional ?? 100}</div>
              </div>
            </div>

            {byAsset.length > 0 && (
              <div className="module module-pad" style={{marginBottom: "var(--s-6)"}}>
                <h2 className="t-h4" style={{marginBottom: 16}}>
                  By asset
                </h2>
                <div style={{overflowX: "auto"}}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th style={{textAlign: "right"}}>Session open</th>
                        <th style={{textAlign: "right"}}>Session closed</th>
                        <th style={{textAlign: "right"}}>Samples</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAsset.map((r) => (
                        <tr key={r.symbol}>
                          <td>
                            <AssetIdentity
                              symbol={r.symbol}
                              underlyingSymbol={r.underlying}
                              variant="compact"
                            />
                          </td>
                          <td className="num" style={{textAlign: "right"}}>
                            {bps(r.openBps)}
                          </td>
                          <td className="num" style={{textAlign: "right"}}>
                            {bps(r.closedBps)}
                          </td>
                          <td className="num faint" style={{textAlign: "right"}}>
                            {r.samples.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="t-xs faint prose" style={{margin: "14px 0 0"}}>
                  Means, in basis points of the round trip. An empty cell means that asset
                  has not yet been sampled in that session state.
                </p>
              </div>
            )}

            {latest.length > 0 && (
              <div className="module module-pad" style={{marginBottom: "var(--s-6)"}}>
                <h2 className="t-h4" style={{marginBottom: 4}}>
                  Latest sample
                </h2>
                <p className="t-sm muted prose" style={{margin: "0 0 16px"}}>
                  {when(cov.lastTs)}, cheapest first.
                </p>
                <div style={{overflowX: "auto"}}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset</th>
                        <th>Session</th>
                        <th style={{textAlign: "right"}}>Pool mid</th>
                        <th style={{textAlign: "right"}}>Buy</th>
                        <th style={{textAlign: "right"}}>Sell</th>
                        <th style={{textAlign: "right"}}>Round trip</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latest.map((r) => (
                        <tr key={r.symbol}>
                          <td>
                            <AssetIdentity
                              symbol={r.symbol}
                              underlyingSymbol={r.underlying}
                              variant="compact"
                            />
                          </td>
                          <td className="t-sm muted">{sessionLabel(r.session)}</td>
                          <td className="num" style={{textAlign: "right"}}>
                            {r.mid_px === null ? "n/a" : r.mid_px.toFixed(2)}
                          </td>
                          <td className="num" style={{textAlign: "right"}}>
                            {r.buy_px === null ? "n/a" : r.buy_px.toFixed(2)}
                          </td>
                          <td className="num" style={{textAlign: "right"}}>
                            {r.sell_px === null ? "n/a" : r.sell_px.toFixed(2)}
                          </td>
                          <td className="num" style={{textAlign: "right"}}>
                            {bps(r.round_trip_bps)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        <div className="module module-pad" style={{marginBottom: "var(--s-6)"}}>
          <h2 className="t-h4" style={{marginBottom: 14}}>
            How it is measured
          </h2>
          <dl className="kv">
            <dt>Round trip</dt>
            <dd>
              Quote ${cov.notional ?? 100} of the payment stablecoin into the xStock, then
              quote exactly that many tokens back out. The difference, in basis points, is
              the number plotted. It contains spread, aggregator fee and depth together,
              which is what a user pays.
            </dd>
            <dt>Pool mid</dt>
            <dd>
              Read from the Uniswap v3 pool&rsquo;s <code>slot0</code> at the same moment:
              zero size, no fee. It is the reference the two executable quotes are measured
              against.
            </dd>
            <dt>Quote source</dt>
            <dd>OKX DEX aggregator v6, the same route Bespeak executes through.</dd>
            <dt>Session source</dt>
            <dd>
              The xStocks issuer&rsquo;s published trading state, operator-attested. The same
              Tier 3 source a real Bespeak order is gated on.
            </dd>
          </dl>
        </div>

        <div className="module module-pad" style={{marginBottom: "var(--s-8)"}}>
          <h2 className="t-h4" style={{marginBottom: 12}}>
            What this is not
          </h2>
          <ul className="t-sm muted prose" style={{margin: 0, paddingLeft: 20}}>
            <li style={{marginBottom: 8}}>
              <strong>Not basis against the listed equity.</strong> There is no equity price
              oracle on X Layer and the issuer publishes no price, so any number here
              claiming to be the gap to NASDAQ would be invented. This measures cost on X
              Layer and nothing else.
            </li>
            <li style={{marginBottom: 8}}>
              <strong>Quotes, not fills.</strong> These are executable prices from the
              aggregator. A real fill can differ, and Bespeak&rsquo;s own receipts record
              what actually moved.
            </li>
            <li>
              <strong>One size.</strong> Every row is quoted at ${cov.notional ?? 100}. Cost
              at other sizes will differ, which is why the size is stored on every row rather
              than assumed.
            </li>
          </ul>
        </div>

        <div className="module module-pad">
          <h2 className="t-h4" style={{marginBottom: 6}}>
            Take the data
          </h2>
          <p className="t-sm muted prose" style={{margin: "0 0 18px"}}>
            Public, CORS-open, no key. Use it, check it, or disagree with it.
          </p>
          <div className="row g3 wrap">
            <a className="btn btn-primary" href="/api/basis.csv">
              Download CSV
            </a>
            <a className="btn btn-quiet" href="/api/basis">
              JSON API
            </a>
            <Link className="btn btn-quiet" href="/markets">
              Markets
            </Link>
          </div>
          <dl className="kv" style={{marginTop: 22}}>
            <dt>
              <code>/api/basis</code>
            </dt>
            <dd>Aggregates, per-asset breakdown and the latest sample. <code>?since=</code> in unix seconds.</dd>
            <dt>
              <code>/api/basis/NVDAx</code>
            </dt>
            <dd>One asset&rsquo;s series, newest first. <code>?since=</code>, <code>?limit=</code>.</dd>
            <dt>
              <code>/api/basis.csv</code>
            </dt>
            <dd>
              Every column, spreadsheet-ready. <code>?symbol=</code>, <code>?since=</code>,{" "}
              <code>?limit=</code>.
            </dd>
          </dl>
        </div>
      </div>
    </section>
  );
}
