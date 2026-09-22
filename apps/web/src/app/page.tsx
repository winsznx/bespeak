import Link from "next/link";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {REGISTRY} from "@/lib/server";
import {SessionPill} from "@/components/Status";
import {nextRegularSessionOpen, formatLocal} from "@/lib/format";

export const revalidate = 30;

const PREVIEW = ["NVDAx", "TSLAx", "AAPLx", "SPYx"];

export default async function Home() {
  let sessions = new Map<string, SessionObservation>();
  try {
    sessions = await observeSessions(PREVIEW);
  } catch {
    // The issuer API being briefly unreachable must not take the homepage down; the market
    // preview degrades to Unknown, which is also the honest reading.
  }

  const preview = PREVIEW.map((symbol) => ({
    asset: REGISTRY.assets.find((a) => a.symbol === symbol),
    status: sessions.get(symbol)?.marketStatus ?? 0,
  })).filter((p) => p.asset);

  const nextOpen = nextRegularSessionOpen();

  return (
    <>
      <section className="section" style={{paddingTop: 56, paddingBottom: 40}}>
        <h1 style={{fontSize: 40, maxWidth: "14ch", lineHeight: 1.12}}>Set the market moment.</h1>
        <p className="lede" style={{fontSize: 17}}>
          Choose a tokenized stock and tell Bespeak when it may buy. Reserve stablecoins in
          your own vault, close the tab, and come back to either a verified purchase or a
          plain explanation of why it is still waiting.
        </p>
        <div className="row">
          <Link href="/markets" className="btn btn-primary">
            Set an order
          </Link>
          <Link href="/markets" className="btn">
            Explore markets
          </Link>
        </div>
      </section>

      <section className="section" style={{paddingTop: 0}}>
        <div className="between" style={{marginBottom: 12}}>
          <h2 style={{margin: 0}}>Markets</h2>
          <Link href="/markets" className="small muted">
            All {REGISTRY.assets.length} assets &rarr;
          </Link>
        </div>
        <div className="card" style={{padding: 0, overflowX: "auto"}}>
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
              {preview.map(({asset, status}) => (
                <tr key={asset!.symbol}>
                  <td>
                    <div className="stack">
                      <strong>{asset!.underlyingSymbol}</strong>
                      <span className="tiny muted">{asset!.name}</span>
                    </div>
                  </td>
                  <td>
                    <SessionPill status={status} />
                  </td>
                  <td>
                    <span className="pill pill-open">
                      <span className="dot" />
                      Trading
                    </span>
                  </td>
                  <td className="num">
                    <Link href={`/asset/${asset!.symbol}`} className="btn btn-sm">
                      Schedule
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted" style={{marginTop: 10}}>
          The underlying US market session and X Layer trading are different things. A
          tokenized stock can be tradable around the clock while the stock behind it is
          closed. Next regular session opens {formatLocal(nextOpen)}.
        </p>
      </section>

      <section className="section">
        <h2>How it works</h2>
        <div className="grid grid-3">
          <div className="card">
            <h3>1. Choose your condition</h3>
            <p className="small muted" style={{margin: 0}}>
              Buy now, wait for the next regular US session, wait until an asset becomes
              tradable on X Layer, or repeat on a schedule.
            </p>
          </div>
          <div className="card">
            <h3>2. Reserve the funds</h3>
            <p className="small muted" style={{margin: 0}}>
              Stablecoins sit in a vault only you can withdraw from. Nothing is pooled, and
              an order can never spend more than you reserved for it.
            </p>
          </div>
          <div className="card">
            <h3>3. Receive the asset</h3>
            <p className="small muted" style={{margin: 0}}>
              When the condition holds, Bespeak executes within your limits and sends the
              stock straight to your wallet. Then it checks the chain to confirm it arrived.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>What you get for reserving capital</h2>
        <div className="grid grid-2">
          <div className="card">
            <h3>It runs without you</h3>
            <p className="small muted" style={{margin: 0}}>
              The order survives after you close the browser. No bot to maintain, no alarm
              set for the opening bell.
            </p>
          </div>
          <div className="card">
            <h3>It stays inside your limits</h3>
            <p className="small muted" style={{margin: 0}}>
              Maximum slippage, minimum output and a deadline are set before you leave.
              Nothing executes outside them, and a retry never loosens them.
            </p>
          </div>
          <div className="card">
            <h3>Waiting is explained</h3>
            <p className="small muted" style={{margin: 0}}>
              Every order that has not executed says why in plain language, and you can
              cancel and take your funds back at any time.
            </p>
          </div>
          <div className="card">
            <h3>The result is checked, not claimed</h3>
            <p className="small muted" style={{margin: 0}}>
              A sent transaction is not a completed purchase. Bespeak re-reads X Layer
              through a separate connection to confirm the asset actually reached you before
              it calls the order done.
            </p>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="notice">
          Built on X Layer (chain 196). Assets are official xStocks, pinned from the
          issuer&apos;s public API and re-verified on chain. Routing through OKX DEX.
          Market session is operator-attested from the issuer&apos;s published trading state
          — see any receipt for the exact source and its limitations.
        </div>
      </section>
    </>
  );
}
