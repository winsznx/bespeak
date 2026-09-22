import Link from "next/link";
import {notFound} from "next/navigation";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {assetBySymbol, REGISTRY} from "@/lib/server";
import {OrderComposer} from "@/components/OrderComposer";
import {Countdown} from "@/components/Countdown";
import {nextRegularSessionOpen, formatLocal} from "@/lib/format";

export const revalidate = 15;

export default async function AssetPage({params}: {params: Promise<{symbol: string}>}) {
  const {symbol} = await params;
  const asset = assetBySymbol(symbol);
  if (!asset) notFound();

  let session: SessionObservation | undefined;
  try {
    session = (await observeSessions([asset.symbol])).get(asset.symbol);
  } catch {
    // An unreachable issuer reads as unknown, which correctly prevents eligibility.
    session = undefined;
  }

  const open = session?.marketStatus === MarketStatus.REGULAR;
  const halted = Boolean(session?.halted);
  const nextOpen = nextRegularSessionOpen();

  return (
    <>
      {/* ---- identity ---- */}
      <section style={{paddingTop: 48, paddingBottom: 32}}>
        <Link href="/markets" className="tiny muted mb-16" style={{display: "inline-block"}}>
          &larr; Markets
        </Link>

        <div className="between" style={{alignItems: "flex-start", flexWrap: "wrap", gap: 20}}>
          <div>
            <h1 className="mb-4">{asset.name.replace(" xStock", "")}</h1>
            <div className="row gap-8 body-2">
              <span className="strong" style={{color: "var(--text)"}}>
                {asset.underlyingSymbol}
              </span>
              <span className="faint">·</span>
              <span>Official xStock</span>
              <span className="faint">·</span>
              <span className="faint">{asset.symbol}</span>
            </div>
          </div>

          {halted ? (
            <span className="badge badge-failed">Trading halted</span>
          ) : (
            <span className={open ? "badge badge-filled" : "badge badge-waiting"}>
              <span className="dot" />
              {open ? "Regular session" : sessionLabel(session?.marketStatus)}
            </span>
          )}
        </div>

        {/* ---- the two facts that matter, as type not cards ---- */}
        <div
          className="mt-32"
          style={{
            display: "grid",
            gap: 0,
            gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
            borderTop: "1px solid var(--line)",
          }}
        >
          <Fact
            label="Underlying market"
            value={open ? "Open" : "Closed"}
            sub={session ? `Issuer reports “${session.raw.currentPeriod}”` : "Source unavailable"}
          />
          <Fact
            label="Next regular session"
            value={open ? "Trading now" : <Countdown to={nextOpen.toISOString()} />}
            sub={open ? "Eligible immediately" : formatLocal(nextOpen)}
          />
          <Fact
            label="X Layer"
            value="Trading"
            accent
            sub={asset.onchainVerified ? "Verified on chain" : "Not verified"}
          />
        </div>
      </section>

      {/* ---- the order ---- */}
      <section style={{paddingBottom: 24, maxWidth: 680}}>
        <OrderComposer
          asset={{
            assetId: asset.assetId,
            symbol: asset.symbol,
            underlyingSymbol: asset.underlyingSymbol,
            name: asset.name,
            outputToken: (asset.wrapper ?? asset.underlying) as `0x${string}`,
            outputDecimals: asset.wrapper ? (asset.wrapperDecimals ?? 18) : asset.underlyingDecimals,
            deliveredInstrument: asset.wrapper ? "wrapped" : "underlying",
          }}
          stables={Object.values(REGISTRY.stables)}
          sessionOpen={open}
        />
      </section>

      {/* ---- technical identity, one layer down ---- */}
      <section style={{paddingBottom: 24, maxWidth: 680}}>
        <details className="tech">
          <summary>Asset details</summary>
          <dl className="kv" style={{paddingBottom: 24}}>
            <dt>xStocks canonical id</dt>
            <dd className="mono">{asset.canonicalId}</dd>
            <dt>ISIN</dt>
            <dd className="mono">{asset.isin}</dd>
            <dt>Underlying token</dt>
            <dd className="mono">{asset.underlying}</dd>
            <dt>Current wrapper (v{asset.wrapperVersion})</dt>
            <dd className="mono">{asset.wrapper ?? "none published"}</dd>
            <dt>You would receive</dt>
            <dd>
              {asset.wrapper
                ? `wrapped ${asset.symbol}, an ERC-4626 wrapper over the rebasing token`
                : `underlying rebasing ${asset.symbol}`}
            </dd>
            <dt>Exchange</dt>
            <dd>
              {asset.exchangeMic} · {asset.exchangeTimezone}
            </dd>
            <dt>Registry revision</dt>
            <dd className="mono">{REGISTRY.sourceRevision}</dd>
            <dt>Verification</dt>
            <dd>
              {asset.onchainVerified
                ? "symbol matched and wrapper.asset() round-tripped to the underlying"
                : asset.verificationNotes.join("; ")}
            </dd>
          </dl>
        </details>
      </section>
    </>
  );
}

function Fact({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div style={{padding: "20px 24px 20px 0"}}>
      <div className="overline mb-8">{label}</div>
      <div className="figure-sm" style={{color: accent ? "var(--filled)" : "var(--text)"}}>
        {value}
      </div>
      {sub && (
        <div className="tiny faint mt-4" style={{fontVariantNumeric: "normal"}}>
          {sub}
        </div>
      )}
    </div>
  );
}

function sessionLabel(status: number | undefined): string {
  switch (status) {
    case MarketStatus.CLOSED:
      return "Market closed";
    case MarketStatus.PRE_MARKET:
      return "Pre-market";
    case MarketStatus.POST_MARKET:
      return "After hours";
    default:
      return "Session unknown";
  }
}
