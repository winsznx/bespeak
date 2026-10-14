import {rowsForExport} from "@/lib/dataset";

export const dynamic = "force-dynamic";

const COLUMNS = [
  "ts",
  "iso",
  "symbol",
  "underlying",
  "session",
  "halted",
  "notional_usd",
  "mid_px",
  "buy_px",
  "sell_px",
  "round_trip_bps",
  "buy_impact_bps",
  "sell_impact_bps",
  "quote_source",
  "pool",
  "fee_tier",
  "block",
  "ok",
  "note",
] as const;

/// Escape one CSV field.
///
/// `note` carries aggregator error text, which contains commas and quotes, so the whole
/// file would shear by one column on the first failed sample without this.
function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/// The dataset as a file.
///
/// Spreadsheet-ready and public: a reader who wants to check the finding should not have to
/// write a client to do it. `?symbol=` narrows to one asset, `?since=` to a window in unix
/// seconds, `?limit=` caps rows (50,000 ceiling).
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const symbol = url.searchParams.get("symbol") ?? undefined;
  const since = Number(url.searchParams.get("since") ?? 0) || 0;
  const limit = Number(url.searchParams.get("limit") ?? 5000) || 5000;

  const rows = await rowsForExport({symbol, sinceTs: since, limit});

  const lines = [COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.ts,
        new Date(r.ts * 1000).toISOString(),
        r.symbol,
        r.underlying,
        r.session,
        r.halted,
        r.notional_usd,
        r.mid_px,
        r.buy_px,
        r.sell_px,
        r.round_trip_bps,
        r.buy_impact_bps,
        r.sell_impact_bps,
        r.quote_source,
        r.pool,
        r.fee_tier,
        r.block,
        r.ok,
        r.note,
      ]
        .map(cell)
        .join(","),
    );
  }

  const name = symbol ? `bespeak-spread-${symbol}.csv` : "bespeak-spread.csv";
  return new Response(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${name}"`,
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });
}
