import {coverage, latestPerAsset, perAssetBySession, sessionStats} from "@/lib/dataset";

export const dynamic = "force-dynamic";

/// The open dataset, as JSON.
///
/// Public and CORS-open on purpose. The point of measuring execution cost for tokenized
/// equities on X Layer is that nobody else is, so a number locked inside one app's charts
/// would be worth very little. Anything may read this: another front end, an agent, a
/// researcher, a competitor.
///
/// `?since=` takes unix seconds and bounds every aggregate in the response, so a caller can
/// ask what the last day looked like rather than being handed the all-time figure.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? 0) || 0;

  const [cov, sessions, latest, byAsset] = await Promise.all([
    coverage(),
    sessionStats(since),
    latestPerAsset(),
    perAssetBySession(since),
  ]);

  return Response.json(
    {
      dataset: "bespeak-xlayer-xstocks-spread",
      description:
        "Executable round-trip cost for official xStocks on X Layer, sampled in both " +
        "directions through the OKX DEX aggregator and tagged with the underlying's " +
        "session state as published by the issuer.",
      method: {
        roundTripBps:
          "Buy the notional, immediately sell exactly what that bought, in basis points lost.",
        midPx: "Uniswap v3 pool mid from slot0: zero size, no fee.",
        impactBps: "Executable quote measured against pool mid.",
        notionalUsd: cov.notional,
        quoteSource: "OKX DEX aggregator v6",
        sessionSource: "xstocks.fi/api/v2/public/assets",
      },
      limitations: [
        "This is not basis against the underlying equity. There is no equity price oracle " +
          "on X Layer and the issuer publishes no price, so any figure claiming to be the " +
          "gap to the listed market would be invented.",
        "Quotes are executable prices from the aggregator, not fills. A fill may differ.",
        "Session state is operator-attested from the issuer's published trading state, the " +
          "same Tier 3 source Bespeak gates real orders on.",
      ],
      coverage: cov,
      bySession: sessions,
      byAsset,
      latest,
      csv: "/api/basis.csv",
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    },
  );
}
