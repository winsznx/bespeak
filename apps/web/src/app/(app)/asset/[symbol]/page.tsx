import Link from "next/link";
import {notFound} from "next/navigation";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {assetBySymbol, REGISTRY} from "@/lib/server";
import {OrderComposer} from "@/components/OrderComposer";
import {Countdown} from "@/components/Countdown";
import {AssetGlyph} from "@/components/ui/AssetGlyph";
import {nextRegularSessionOpen, formatUtcShort} from "@/lib/format";

export const revalidate = 15;

export default async function AssetPage({params}: {params: Promise<{symbol: string}>}) {
  const {symbol} = await params;
  const asset = assetBySymbol(symbol);
  if (!asset) notFound();

  let session: SessionObservation | undefined;
  try {
    session = (await observeSessions([asset.symbol])).get(asset.symbol);
  } catch {
    // Unreachable issuer reads as unknown, which correctly blocks eligibility.
    session = undefined;
  }

  const open = session?.marketStatus === MarketStatus.REGULAR;
  const halted = Boolean(session?.halted);
  const nextOpen = nextRegularSessionOpen();

  return (
    <>
      <Link href="/markets" className="t-sm muted" style={{display: "inline-block", marginBottom: 18}}>
        &larr; Markets
      </Link>

      <div className="asset-head">
        <div>
          <div className="row g4" style={{marginBottom: 20}}>
            <AssetGlyph symbol={asset.symbol} size={48} />
            <div style={{minWidth: 0}}>
              <h1 className="t-h2" style={{marginBottom: 3}}>
                {asset.name.replace(" xStock", "")}
              </h1>
              <div className="row wrap g2 t-sm muted">
                <span style={{color: "var(--ink)", fontWeight: 500}}>
                  {asset.underlyingSymbol}
                </span>
                <span className="faint">·</span>
                <span>Official xStock</span>
                <span className="faint">·</span>
                <span className="faint">{asset.symbol}</span>
              </div>
            </div>
          </div>

          <div className="facts">
            <div className="fact">
              <div className="t-label" style={{marginBottom: 8}}>
                Underlying market
              </div>
              <div className="t-figure-sm">
                {halted ? "Halted" : open ? "Open" : "Closed"}
              </div>
              <div className="t-xs faint" style={{marginTop: 4}}>
                {session ? `Issuer reports “${session.raw.currentPeriod}”` : "Source unavailable"}
              </div>
            </div>
            <div className="fact">
              <div className="t-label" style={{marginBottom: 8}}>
                Next regular session
              </div>
              <div className="t-figure-sm">
                {open ? "Trading now" : <Countdown to={nextOpen.toISOString()} />}
              </div>
              <div className="t-xs faint" style={{marginTop: 4}}>
                {open ? "Eligible immediately" : formatUtcShort(nextOpen)}
              </div>
            </div>
            <div className="fact">
              <div className="t-label" style={{marginBottom: 8}}>
                X Layer route
              </div>
              <div className="t-figure-sm" style={{color: asset.route ? "var(--success)" : undefined}}>
                {asset.route ? asset.route.quoteSymbol : "None"}
              </div>
              <div className="t-xs faint" style={{marginTop: 4}}>
                {asset.route
                  ? `$${asset.route.quoteDepth.toLocaleString("en-US", {maximumFractionDigits: 0})} liquidity`
                  : "No executable pair found"}
              </div>
            </div>
          </div>
        </div>

        <div className="module module-pad">
          <div className="t-label" style={{marginBottom: 12}}>
            Execution route
          </div>
          <div className="t-figure-sm" style={{marginBottom: 4}}>
            {asset.route ? `${asset.route.quoteSymbol} pair` : "No route"}
          </div>
          <p className="t-xs faint prose" style={{margin: "0 0 16px"}}>
            {asset.route
              ? `Verified on chain at the ${asset.route.feeTier / 10_000}% tier. The price is quoted at execution time and bounded by your slippage limit.`
              : "No executable pair was found on X Layer for this asset."}
          </p>
          <div className="col g2">
            <a href="#compose" className="btn btn-primary btn-block">
              {open ? "Buy now" : "Schedule"}
            </a>
            <Link href="/markets" className="btn btn-block">
              Other markets
            </Link>
          </div>
        </div>
      </div>

      <div id="compose">
        <OrderComposer
          asset={{
            assetId: asset.assetId,
            symbol: asset.symbol,
            underlyingSymbol: asset.underlyingSymbol,
            name: asset.name,
            outputToken: (asset.wrapper ?? asset.underlying) as `0x${string}`,
            outputDecimals: asset.wrapper
              ? (asset.wrapperDecimals ?? 18)
              : asset.underlyingDecimals,
            deliveredInstrument: asset.wrapper ? "wrapped" : "underlying",
            routeQuoteSymbol: asset.route?.quoteSymbol ?? null,
          }}
          stables={Object.values(REGISTRY.stables)}
          sessionOpen={open}
        />
      </div>

      <details className="tech" style={{marginTop: 32}}>
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
          <dt>Executable pair</dt>
          <dd>
            {asset.route
              ? `${asset.route.quoteSymbol} / ${asset.wrapper ? `w${asset.symbol}` : asset.symbol} at the ${asset.route.feeTier / 10_000}% tier`
              : "none found"}
          </dd>
          <dt>Pool</dt>
          <dd className="mono">{asset.route?.pool ?? "n/a"}</dd>
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
    </>
  );
}
