import Link from "next/link";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {REGISTRY, getDemand, deployment} from "@/lib/server";
import {nextRegularSessionOpen, formatUtcShort} from "@/lib/format";
import {AssetIdentity, TokenIdentity} from "@/components/identity";
import {Countdown} from "@/components/Countdown";
import {HeroPlane} from "@/components/site/HeroPlane";

export const revalidate = 30;

const HERO = "NVDAx";
const STRIP = ["NVDAx", "TSLAx", "SPYx", "AAPLx"];

export default async function Landing() {
  let sessions = new Map<string, SessionObservation>();
  try {
    sessions = await observeSessions([...new Set([HERO, ...STRIP])]);
  } catch {
    // An unreachable issuer reads as unknown, which is also the correct execution answer.
  }

  const hero = REGISTRY.assets.find((a) => a.symbol === HERO);
  const heroSession = sessions.get(HERO);
  const heroOpen = heroSession?.marketStatus === MarketStatus.REGULAR;
  const nextOpen = nextRegularSessionOpen();
  const demand = deployment() ? await getDemand() : [];

  return (
    <>
      {/* ================= HERO ================= */}
      <section className="site-inner" style={{paddingBottom: 0}}>
        <div className="hero">
          <div className="hero-copy">
            <h1 className="t-display">
              Set the market
              <br />
              <span className="serif">moment.</span>
            </h1>
            <p className="t-body-lg hero-lede" style={{margin: "24px 0 32px"}}>
              Choose the condition. Bespeak waits, executes on X Layer and delivers the
              xStock when your instruction becomes eligible.
            </p>
            <div className="row wrap g3">
              <Link
                href="/markets"
                className="btn btn-lg"
                style={{background: "#fff", borderColor: "#fff", color: "var(--brand-700)"}}
              >
                Set an order
              </Link>
              <Link
                href="/markets"
                className="btn btn-lg"
                style={{
                  background: "transparent",
                  borderColor: "color-mix(in srgb, #fff 34%, transparent)",
                  color: "#fff",
                }}
              >
                Explore markets
              </Link>
            </div>
          </div>

          <div className="hero-stage">
            {/* Floating product objects, as the reference floats analytics over its photo. */}
            <div className="hero-float hero-float-l">
              <div className="t-label" style={{marginBottom: 10}}>
                Market state
              </div>
              <Row label="Underlying" value={heroOpen ? "Open" : "Closed"} />
              <Row label="X Layer" value="Trading" tone="var(--success)" />
            </div>

            <div className="hero-float hero-float-r">
              <div className="t-label" style={{marginBottom: 10}}>
                Standing order
              </div>
              <div className="between" style={{marginBottom: 8}}>
                <span className="t-h4">$500 NVDA</span>
                <span className="chip chip-waiting">
                  <span className="dot" />
                  Waiting
                </span>
              </div>
              <div className="t-xs faint">Next eligible</div>
              <div className="t-sm" style={{fontWeight: 500}}>
                {formatUtcShort(nextOpen)}
              </div>
            </div>

            <div className="hero-float hero-float-b">
              <div className="t-label" style={{marginBottom: 10}}>
                Vault
              </div>
              <Row label="Available" value="$1,250" />
              <Row label="Reserved" value="$500" />
            </div>

            {hero && (
              <HeroPlane
                symbol={hero.underlyingSymbol}
                name={hero.name.replace(" xStock", "")}
                open={heroOpen}
                payWith={hero.route?.quoteSymbol ?? "USDG"}
                nextOpenIso={nextOpen.toISOString()}
                nextOpenLabel={formatUtcShort(nextOpen)}
              />
            )}
          </div>
        </div>
      </section>

      {/* ================= THESIS ================= */}
      <section className="site-inner" style={{padding: "clamp(64px,9vw,128px) clamp(18px,3vw,44px)"}}>
        <div className="row wrap g2" style={{marginBottom: 28}}>
          <span className="chip chip-outline">Condition aware</span>
          <span className="chip chip-outline">Non-custodial</span>
        </div>
        <div className="ed">
          <h2 className="t-h1">
            Execution that waits
            <br />
            for your <span className="serif">moment</span>.
          </h2>
          <p className="t-body-lg muted prose" style={{margin: 0, maxWidth: "46ch"}}>
            Markets keep moving after you leave the screen. Bespeak keeps your instruction
            alive and only executes inside the condition and limits you chose.
          </p>
        </div>
      </section>

      {/* ================= DEEP PRODUCT OBJECT ================= */}
      <section id="how" className="site-inner" style={{paddingBottom: "clamp(56px,8vw,112px)"}}>
        <div className="module" style={{padding: "clamp(24px,3.4vw,52px)"}}>
          <div className="ed">
            <div className="steps">
              <Step
                n="01"
                title="Choose the market condition"
                body="Now, next regular session, when available, or repeat."
              />
              <Step
                n="02"
                title="Reserve once"
                body="Capital stays assigned to your order without keeping the browser open."
              />
              <Step
                n="03"
                title="Return to an outcome"
                body="Bespeak either completes within your limits or tells you exactly why it is still waiting."
              />
            </div>

            <ConditionPreview
              open={heroOpen}
              nextOpenIso={nextOpen.toISOString()}
              payWith={hero?.route?.quoteSymbol ?? "USDG"}
            />
          </div>
        </div>
      </section>

      {/* ================= SECOND EDITORIAL MOMENT ================= */}
      <section className="site-inner" style={{paddingBottom: "clamp(56px,8vw,112px)"}}>
        <div className="ed" style={{alignItems: "center"}}>
          <h2 className="t-h1">
            Markets move.
            <br />
            Your instruction <span className="serif">stays</span>.
          </h2>
          <div className="module module-pad">
            <div className="t-label" style={{marginBottom: 16}}>
              What Bespeak checks before it spends
            </div>
            <div className="col g3">
              {[
                "The market condition you authorized, at the tier recorded on your order",
                "The asset's identity against the pinned registry revision",
                "The router and approval target against an allowlist",
                "Actual delivery to your wallet, re-read through a separate connection",
              ].map((t) => (
                <div key={t} className="t-sm prose" style={{paddingLeft: 14, borderLeft: "2px solid var(--brand)"}}>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ================= MARKETS ================= */}
      <section className="site-inner" style={{paddingBottom: "clamp(56px,8vw,112px)"}}>
        <div className="between" style={{marginBottom: 20, flexWrap: "wrap"}}>
          <h2 className="t-h2">Supported markets</h2>
          <Link href="/markets" className="t-sm muted">
            All {REGISTRY.assets.length} assets &rarr;
          </Link>
        </div>

        <div className="market-strip">
          {STRIP.map((sym) => {
            const a = REGISTRY.assets.find((x) => x.symbol === sym);
            if (!a) return null;
            const s = sessions.get(sym);
            const open = s?.marketStatus === MarketStatus.REGULAR;
            return (
              <div className="market-strip-row" key={sym}>
                <AssetIdentity
                  symbol={a.symbol}
                  underlyingSymbol={a.underlyingSymbol}
                  name={a.name.replace(" xStock", "")}
                  variant="row"
                />
                <div className="cell-hide">
                  <div className="t-xs faint">Underlying</div>
                  <div className="t-sm">{open ? "Open" : "Closed"}</div>
                </div>
                <div className="cell-hide">
                  <div className="t-xs faint">X Layer</div>
                  <div className="t-sm" style={{color: "var(--success)"}}>
                    Trading
                  </div>
                </div>
                <div className="cell-hide">
                  <div className="t-xs faint" style={{marginBottom: 3}}>
                    Pay with
                  </div>
                  {a.route ? (
                    <TokenIdentity symbol={a.route.quoteSymbol} size="xs" />
                  ) : (
                    <div className="t-sm faint">—</div>
                  )}
                </div>
                <Link href={`/asset/${a.symbol}`} className="btn btn-sm">
                  {open ? "Buy now" : "Schedule"}
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ================= DEMAND ================= */}
      <section className="site-inner" style={{paddingBottom: "clamp(56px,8vw,112px)"}}>
        <div className="ed">
          <div>
            <h2 className="t-h2" style={{marginBottom: 12}}>
              Waiting for X Layer
            </h2>
            <p className="t-body muted prose" style={{margin: 0, maxWidth: "44ch"}}>
              Reserve capital for an official xStock that is not executable here yet. It
              executes automatically when the asset becomes tradable, or releases at your
              deadline. The board counts real reservations only.
            </p>
          </div>

          <div className="module module-pad">
            {demand.length === 0 ? (
              <>
                <div className="t-label" style={{marginBottom: 14}}>
                  Committed demand
                </div>
                <p className="t-body muted prose" style={{margin: "0 0 18px"}}>
                  No capital is committed yet. When someone reserves funds for an asset that
                  is not executable here, it appears with the real amount — never a
                  placeholder.
                </p>
                <Link href="/demand" className="btn btn-sm">
                  View demand
                </Link>
              </>
            ) : (
              <>
                <div className="t-label" style={{marginBottom: 14}}>
                  Committed demand
                </div>
                <div className="col g4">
                  {demand.slice(0, 3).map((d) => {
                    const a = REGISTRY.assets.find(
                      (x) => x.assetId.toLowerCase() === d.assetId.toLowerCase(),
                    );
                    return (
                      <div className="between" key={d.assetId}>
                        <span className="t-h4">{a?.underlyingSymbol ?? "Asset"}</span>
                        <span className="t-sm muted">{d.orders} orders</span>
                      </div>
                    );
                  })}
                </div>
                <Link href="/demand" className="btn btn-sm" style={{marginTop: 18}}>
                  View demand
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ================= CLOSING ================= */}
      <section className="site-inner">
        <div className="closing">
          <h2 className="t-h1" style={{marginBottom: 28}}>
            Set the market <span className="serif">moment</span>.
          </h2>
          <Link
            href="/dashboard"
            className="btn btn-lg"
            style={{
              background: "var(--invert-ink)",
              borderColor: "var(--invert-ink)",
              color: "var(--invert)",
            }}
          >
            Open Bespeak
          </Link>
        </div>
      </section>
    </>
  );
}

function Row({label, value, tone}: {label: string; value: string; tone?: string}) {
  return (
    <div className="between" style={{padding: "3px 0"}}>
      <span className="t-xs muted">{label}</span>
      <span className="t-sm" style={{fontWeight: 500, color: tone}}>
        {value}
      </span>
    </div>
  );
}

function Step({n, title, body}: {n: string; title: string; body: string}) {
  return (
    <div className="step">
      <div className="t-label" style={{color: "var(--ink-3)", paddingTop: 3}}>
        {n}
      </div>
      <div>
        <h3 className="t-h3" style={{marginBottom: 6}}>
          {title}
        </h3>
        <p className="t-sm muted prose" style={{margin: 0, maxWidth: "44ch"}}>
          {body}
        </p>
      </div>
    </div>
  );
}

function ConditionPreview({
  open,
  nextOpenIso,
  payWith,
}: {
  open: boolean;
  nextOpenIso: string;
  payWith: string;
}) {
  const CHOICES = ["Now", "Next session", "When available", "Repeat"];
  return (
    <div className="module module-2" style={{padding: 20}}>
      <div className="t-label" style={{marginBottom: 14}}>
        When should Bespeak buy?
      </div>

      <div className="col g2" style={{marginBottom: 18}}>
        {CHOICES.map((c) => {
          const selected = c === "Next session";
          return (
            <div
              key={c}
              className="row g3"
              style={{
                height: 46,
                padding: "0 14px",
                borderRadius: "var(--r-control)",
                background: selected ? "var(--surface)" : "transparent",
                border: `1px solid ${selected ? "var(--brand)" : "var(--line)"}`,
                boxShadow: selected ? "0 0 0 1px var(--brand)" : "none",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 999,
                  border: `1.5px solid ${selected ? "var(--brand)" : "var(--line-2)"}`,
                  background: selected ? "var(--brand)" : "transparent",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {selected && (
                  <span style={{width: 5, height: 5, borderRadius: 999, background: "#fff"}} />
                )}
              </span>
              <span className="t-sm" style={{fontWeight: selected ? 550 : 450}}>
                {c}
              </span>
            </div>
          );
        })}
      </div>

      <div className="module module-pad" style={{padding: 16}}>
        <div className="between" style={{marginBottom: 10}}>
          <span className="t-xs muted">Underlying market</span>
          <span className="t-sm" style={{fontWeight: 500}}>
            {open ? "Open" : "Closed"}
          </span>
        </div>
        <div className="between" style={{marginBottom: 10}}>
          <span className="t-xs muted">Next regular session</span>
          <span className="t-sm" style={{fontWeight: 500}}>
            <Countdown to={nextOpenIso} />
          </span>
        </div>
        <div className="between">
          <span className="t-xs muted">Expected payment asset</span>
          <span className="t-sm" style={{fontWeight: 500}}>
            {payWith}
          </span>
        </div>
      </div>
    </div>
  );
}
