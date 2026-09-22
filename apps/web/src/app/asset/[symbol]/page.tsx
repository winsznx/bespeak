import {notFound} from "next/navigation";
import {observeSessions, type SessionObservation} from "@bespeak/conditions";
import {MarketStatus} from "@bespeak/shared";
import {assetBySymbol, REGISTRY} from "@/lib/server";
import {SessionPill} from "@/components/Status";
import {OrderComposer} from "@/components/OrderComposer";
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
    // The issuer API being unreachable reads as Unknown, which correctly prevents a
    // regular-session order from becoming eligible.
    session = undefined;
  }

  const status = session?.marketStatus ?? MarketStatus.UNKNOWN;
  const nextOpen = nextRegularSessionOpen();

  return (
    <section className="section">
      <div className="between" style={{alignItems: "flex-start", marginBottom: 20}}>
        <div>
          <h1 style={{marginBottom: 2}}>{asset.name.replace(" xStock", "")}</h1>
          <p className="muted" style={{margin: 0}}>
            {asset.underlyingSymbol} &middot; official xStocks asset &middot; {asset.symbol}
          </p>
        </div>
        {session?.halted ? <span className="pill pill-bad">Trading halted</span> : <SessionPill status={status} />}
      </div>

      <div className="grid grid-3" style={{marginBottom: 24}}>
        <div className="card">
          <h3 className="muted small" style={{fontWeight: 500}}>Underlying session</h3>
          <div style={{fontSize: 17, fontWeight: 560}}>
            {status === MarketStatus.REGULAR ? "Regular session open" : "Not in regular session"}
          </div>
          <p className="tiny muted" style={{margin: "4px 0 0"}}>
            Issuer reports &ldquo;{session?.raw.currentPeriod ?? "unknown"}&rdquo;
          </p>
        </div>
        <div className="card">
          <h3 className="muted small" style={{fontWeight: 500}}>Next regular session</h3>
          <div style={{fontSize: 17, fontWeight: 560}}>{formatLocal(nextOpen)}</div>
          <p className="tiny muted" style={{margin: "4px 0 0"}}>Shown in your local time</p>
        </div>
        <div className="card">
          <h3 className="muted small" style={{fontWeight: 500}}>X Layer</h3>
          <div style={{fontSize: 17, fontWeight: 560}}>
            {asset.onchainVerified ? "Verified on chain" : "Not verified"}
          </div>
          <p className="tiny muted" style={{margin: "4px 0 0"}}>
            {asset.tradingHoursMode === "TwentyFourFive" ? "Underlying trades 24/5" : asset.tradingHoursMode}
          </p>
        </div>
      </div>

      <OrderComposer
        asset={{
          assetId: asset.assetId,
          symbol: asset.symbol,
          underlyingSymbol: asset.underlyingSymbol,
          name: asset.name,
          outputToken: (asset.wrapper ?? asset.underlying) as `0x${string}`,
          outputDecimals: asset.wrapper ? asset.wrapperDecimals ?? 18 : asset.underlyingDecimals,
          deliveredInstrument: asset.wrapper ? "wrapped" : "underlying",
        }}
        stables={Object.values(REGISTRY.stables)}
        sessionOpen={status === MarketStatus.REGULAR}
      />

      <details className="tech" style={{marginTop: 24}}>
        <summary>Asset details</summary>
        <dl className="kv">
          <dt>xStocks canonical id</dt>
          <dd>{asset.canonicalId}</dd>
          <dt>ISIN</dt>
          <dd>{asset.isin}</dd>
          <dt>Underlying token (X Layer)</dt>
          <dd>{asset.underlying}</dd>
          <dt>Current wrapper (v{asset.wrapperVersion})</dt>
          <dd>{asset.wrapper ?? "none published"}</dd>
          <dt>You would receive</dt>
          <dd>
            {asset.wrapper
              ? `wrapped ${asset.symbol} (ERC-4626 wrapper)`
              : `underlying rebasing ${asset.symbol}`}
          </dd>
          <dt>Exchange</dt>
          <dd>{asset.exchangeMic} ({asset.exchangeTimezone})</dd>
          <dt>Registry revision</dt>
          <dd>{REGISTRY.sourceRevision}</dd>
          <dt>On-chain verification</dt>
          <dd>
            {asset.onchainVerified
              ? "symbol matched and wrapper.asset() round-tripped to the underlying"
              : asset.verificationNotes.join("; ")}
          </dd>
        </dl>
      </details>
    </section>
  );
}
