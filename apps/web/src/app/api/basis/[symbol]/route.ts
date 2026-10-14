import {seriesFor, sessionLabel} from "@/lib/dataset";

export const dynamic = "force-dynamic";

/// One asset's series.
///
/// Returned newest first and bounded, so a caller that wants the recent shape pays for the
/// recent shape. `/api/basis.csv?symbol=` serves the same data for bulk download.
export async function GET(
  request: Request,
  {params}: {params: Promise<{symbol: string}>},
): Promise<Response> {
  const {symbol} = await params;
  const url = new URL(request.url);
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  const limit = Number(url.searchParams.get("limit") ?? 500) || 500;

  const rows = await seriesFor(symbol, since, Math.min(limit, 5000));
  const head = rows[0];

  if (!head) {
    return Response.json(
      {symbol, samples: 0, series: [], note: "No samples for this symbol yet."},
      {status: 200, headers: {"access-control-allow-origin": "*"}},
    );
  }

  return Response.json(
    {
      symbol: head.symbol,
      underlying: head.underlying,
      samples: rows.length,
      series: rows.map((r) => ({
        ts: r.ts,
        session: r.session,
        sessionLabel: sessionLabel(r.session),
        midPx: r.mid_px,
        buyPx: r.buy_px,
        sellPx: r.sell_px,
        roundTripBps: r.round_trip_bps,
        buyImpactBps: r.buy_impact_bps,
        sellImpactBps: r.sell_impact_bps,
        block: r.block,
        ok: r.ok === 1,
        note: r.note,
      })),
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=60",
      },
    },
  );
}
