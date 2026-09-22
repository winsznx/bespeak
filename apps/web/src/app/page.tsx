import Link from "next/link";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY} from "@/lib/server";
import {nextRegularSessionOpen} from "@/lib/format";
import {Countdown} from "@/components/Countdown";

export const revalidate = 30;

/// The hero asset. One live product object explains Bespeak faster than any diagram:
/// the underlying market is closed, the token is trading, and here is what you can do.
const HERO = "NVDAx";

export default async function Home() {
  let session: SessionObservation | undefined;
  try {
    session = (await observeSessions([HERO])).get(HERO);
  } catch {
    session = undefined;
  }

  const asset = REGISTRY.assets.find((a) => a.symbol === HERO);
  const open = session?.marketStatus === MarketStatus.REGULAR;
  const nextOpen = nextRegularSessionOpen();

  return (
    <>
      {/* ---- one dominant idea ---- */}
      <section className="hero">
        <div>
          <h1 className="display" style={{marginBottom: 28}}>
            Set the market moment.
          </h1>
          <p className="lede" style={{fontSize: 19, marginBottom: 36}}>
            Buy tokenized stocks now, at the next regular session, when they become
            available, or on a recurring schedule.
          </p>
          <div className="wrap-row gap-12">
            <Link href="/markets" className="btn btn-primary btn-lg">
              Set an order
            </Link>
            <Link href="/markets" className="btn btn-lg" style={{boxShadow: "none"}}>
              Explore markets
            </Link>
          </div>
        </div>

        {/* ---- the live object that explains the product ---- */}
        {asset && (
          <div className="panel enter" style={{overflow: "hidden", alignSelf: "start"}}>
            <div className="panel-pad" style={{paddingBottom: 20}}>
              <div className="between mb-24" style={{alignItems: "flex-start"}}>
                <div>
                  <div className="figure-sm" style={{marginBottom: 2}}>
                    {asset.underlyingSymbol}
                  </div>
                  <div className="tiny faint">{asset.name.replace(" xStock", "")}</div>
                </div>
                <span className={open ? "badge badge-filled" : "badge badge-waiting"}>
                  <span className="dot" />
                  {open ? "Regular session" : "After hours"}
                </span>
              </div>

              <dl style={{margin: 0}}>
                <Line label="Underlying market" value={open ? "Open" : "Closed"} />
                <Line label="X Layer" value="Trading" accent />
                <Line
                  label="Next regular session"
                  value={<Countdown to={nextOpen.toISOString()} />}
                />
              </dl>
            </div>

            <div
              className="wrap-row gap-8"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--line)",
                background: "var(--surface-quiet)",
              }}
            >
              <Link href={`/asset/${asset.symbol}`} className="btn btn-sm">
                Buy now
              </Link>
              <Link href={`/asset/${asset.symbol}`} className="btn btn-sm btn-primary">
                Schedule
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* ---- the narrative, as a sequence rather than a grid of features ---- */}
      <section className="section" style={{borderTop: "1px solid var(--line)"}}>
        <div style={{maxWidth: 680}}>
          <Step
            n="01"
            title="Choose the moment"
            body="Buy now, wait for the next regular US session, wait until an asset becomes tradable on X Layer, or repeat on a schedule."
          />
          <Step
            n="02"
            title="Reserve once"
            body="Stablecoins sit in a vault only you can withdraw from. Your order stays funded without a browser left open or a bot to maintain."
          />
          <Step
            n="03"
            title="Come back to an outcome"
            body="Bespeak either executes inside the limits you set and confirms the asset reached your wallet, or tells you plainly why it is still waiting."
            last
          />
        </div>
      </section>

      {/* ---- then the actual product ---- */}
      <section className="section" style={{borderTop: "1px solid var(--line)"}}>
        <div className="between mb-24">
          <h2>Markets</h2>
          <Link href="/markets" className="small muted">
            All {REGISTRY.assets.length} assets &rarr;
          </Link>
        </div>
        <MarketPreview />
      </section>
    </>
  );
}

function Line({label, value, accent}: {label: string; value: React.ReactNode; accent?: boolean}) {
  return (
    <div
      className="between"
      style={{padding: "11px 0", borderTop: "1px solid var(--line)"}}
    >
      <dt className="small muted" style={{margin: 0}}>
        {label}
      </dt>
      <dd
        className="small strong"
        style={{margin: 0, color: accent ? "var(--filled)" : "var(--text)"}}
      >
        {value}
      </dd>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  last,
}: {
  n: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "56px 1fr",
        gap: 20,
        paddingBottom: last ? 0 : 36,
      }}
    >
      <div className="overline" style={{color: "var(--text-3)", paddingTop: 3}}>
        {n}
      </div>
      <div>
        <h3 className="mb-4">{title}</h3>
        <p className="body-2 prose" style={{margin: 0, maxWidth: "52ch"}}>
          {body}
        </p>
      </div>
    </div>
  );
}

async function MarketPreview() {
  const symbols = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];
  let sessions = new Map<string, SessionObservation>();
  try {
    sessions = await observeSessions(symbols);
  } catch {
    // An unreachable issuer reads as unknown, which is also the correct execution answer.
  }

  const rows = symbols
    .map((s) => ({asset: REGISTRY.assets.find((a) => a.symbol === s), session: sessions.get(s)}))
    .filter((r) => r.asset);

  return (
    <table className="table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>Underlying market</th>
          <th>X Layer</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(({asset, session}) => {
          const open = session?.marketStatus === MarketStatus.REGULAR;
          return (
            <tr key={asset!.symbol}>
              <td>
                <div className="strong">{asset!.underlyingSymbol}</div>
                <div className="tiny faint">{asset!.name.replace(" xStock", "")}</div>
              </td>
              <td className="small muted">{open ? "Open" : "Closed"}</td>
              <td className="small" style={{color: "var(--filled)"}}>
                Trading
              </td>
              <td className="num">
                <Link href={`/asset/${asset!.symbol}`} className="btn btn-sm">
                  Schedule
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
