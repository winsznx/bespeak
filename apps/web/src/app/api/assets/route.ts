import {NextResponse} from "next/server";
import {REGISTRY} from "@/lib/server";

export const revalidate = 60;

/// GET /api/assets — the supported asset list with its provenance.
///
/// Read-only. Bespeak's API never signs or holds anything: an agent or integrator builds
/// the same wallet-authorized transaction a browser would (PRD 38).
export function GET() {
  return NextResponse.json({
    chainId: REGISTRY.chainId,
    sourceUri: REGISTRY.sourceUri,
    sourceRevision: REGISTRY.sourceRevision,
    sourceFetchedAt: REGISTRY.sourceFetchedAt,
    issuerCatalogueSize: REGISTRY.catalogueSize,
    supportedCount: REGISTRY.assets.length,
    stables: REGISTRY.stables,
    assets: REGISTRY.assets.map((a) => ({
      assetId: a.assetId,
      symbol: a.symbol,
      underlyingSymbol: a.underlyingSymbol,
      name: a.name,
      canonicalId: a.canonicalId,
      isin: a.isin,
      underlying: a.underlying,
      wrapper: a.wrapper,
      wrapperVersion: a.wrapperVersion,
      outputToken: a.wrapper ?? a.underlying,
      deliveredInstrument: a.wrapper ? "wrapped" : "underlying",
      tradingHoursMode: a.tradingHoursMode,
      exchange: {mic: a.exchangeMic, timezone: a.exchangeTimezone},
      onchainVerified: a.onchainVerified,
      verificationNotes: a.verificationNotes,
      route: a.route
        ? {
            payWith: a.route.quoteSymbol,
            quoteToken: a.route.quoteToken,
            pool: a.route.pool,
            feeTier: a.route.feeTier,
            quoteDepth: a.route.quoteDepth,
          }
        : null,
    })),
  });
}
