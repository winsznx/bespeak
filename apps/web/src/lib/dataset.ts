import {getCloudflareContext} from "@opennextjs/cloudflare";

/// Read side of the open spread dataset.
///
/// Every query here is read-only. The keeper is the sole writer, so nothing a page does can
/// alter a published measurement, which matters, because the dataset is a claim we are
/// asking people to check rather than a view we are asking them to trust.

export interface SpreadRow {
  ts: number;
  symbol: string;
  underlying: string;
  session: string;
  halted: number;
  notional_usd: number;
  buy_px: number | null;
  sell_px: number | null;
  mid_px: number | null;
  round_trip_bps: number | null;
  buy_impact_bps: number | null;
  sell_impact_bps: number | null;
  quote_source: string;
  pool: string | null;
  fee_tier: number | null;
  block: number | null;
  ok: number;
  note: string | null;
}

export interface SessionStat {
  session: string;
  label: string;
  samples: number;
  meanBps: number | null;
  medianBps: number | null;
  minBps: number | null;
  maxBps: number | null;
}

export interface Coverage {
  totalSamples: number;
  quotedSamples: number;
  assets: number;
  firstTs: number | null;
  lastTs: number | null;
  notional: number | null;
}

/// Issuer period names, as they appear in the source payload, mapped to what they mean.
/// The raw value is always kept alongside so the mapping can be checked rather than assumed.
export const SESSION_LABELS: Record<string, string> = {
  market: "Regular session",
  extended: "Extended hours",
  overnight: "Overnight",
  closed: "Closed",
  unknown: "Unknown",
};

export function sessionLabel(s: string): string {
  return SESSION_LABELS[s] ?? s;
}

function db(): D1Database | null {
  try {
    return getCloudflareContext().env.DATA ?? null;
  } catch {
    // No Cloudflare context outside the worker (local build, tests). Callers render the
    // "collection has not started" state rather than failing the page.
    return null;
  }
}

/// Most recent sample for each asset, newest first.
export async function latestPerAsset(): Promise<SpreadRow[]> {
  const d = db();
  if (!d) return [];
  const {results} = await d
    .prepare(
      `SELECT s.* FROM spread_samples s
       JOIN (SELECT symbol, MAX(ts) AS ts FROM spread_samples GROUP BY symbol) m
         ON s.symbol = m.symbol AND s.ts = m.ts
       ORDER BY s.round_trip_bps IS NULL, s.round_trip_bps ASC`,
    )
    .all<SpreadRow>();
  return results ?? [];
}

/// Round-trip cost grouped by the underlying's session state.
///
/// This is the finding the dataset exists for. Median is reported next to mean because a
/// single wide quote during a thin minute moves a mean far more than it moves what a user
/// would typically pay, and quoting only the mean would overstate the effect we are claiming.
export async function sessionStats(sinceTs = 0): Promise<SessionStat[]> {
  const d = db();
  if (!d) return [];

  const {results} = await d
    .prepare(
      `SELECT session,
              COUNT(*)              AS samples,
              AVG(round_trip_bps)   AS meanBps,
              MIN(round_trip_bps)   AS minBps,
              MAX(round_trip_bps)   AS maxBps
       FROM spread_samples
       WHERE ok = 1 AND round_trip_bps IS NOT NULL AND ts >= ?
       GROUP BY session
       ORDER BY samples DESC`,
    )
    .bind(sinceTs)
    .all<{session: string; samples: number; meanBps: number; minBps: number; maxBps: number}>();

  const rows = results ?? [];

  // Median per session. SQLite has no percentile function, so it is the middle row of the
  // ordered set, one indexed query per session, which is four queries at present.
  const medians = await Promise.all(
    rows.map(async (r) => {
      const half = Math.floor(r.samples / 2);
      const row = await d
        .prepare(
          `SELECT round_trip_bps AS v FROM spread_samples
           WHERE ok = 1 AND round_trip_bps IS NOT NULL AND session = ? AND ts >= ?
           ORDER BY round_trip_bps LIMIT 1 OFFSET ?`,
        )
        .bind(r.session, sinceTs, half)
        .first<{v: number}>();
      return row?.v ?? null;
    }),
  );

  return rows.map((r, i) => ({
    session: r.session,
    label: sessionLabel(r.session),
    samples: r.samples,
    meanBps: r.meanBps,
    medianBps: medians[i] ?? null,
    minBps: r.minBps,
    maxBps: r.maxBps,
  }));
}

/// Per-asset round-trip cost, split by whether the underlying was in its regular session.
export async function perAssetBySession(sinceTs = 0): Promise<
  Array<{symbol: string; underlying: string; openBps: number | null; closedBps: number | null; samples: number}>
> {
  const d = db();
  if (!d) return [];
  const {results} = await d
    .prepare(
      `SELECT symbol,
              underlying,
              AVG(CASE WHEN session = 'market' THEN round_trip_bps END) AS openBps,
              AVG(CASE WHEN session <> 'market' THEN round_trip_bps END) AS closedBps,
              COUNT(*) AS samples
       FROM spread_samples
       WHERE ok = 1 AND round_trip_bps IS NOT NULL AND ts >= ?
       GROUP BY symbol, underlying
       ORDER BY symbol`,
    )
    .bind(sinceTs)
    .all<{symbol: string; underlying: string; openBps: number | null; closedBps: number | null; samples: number}>();
  return results ?? [];
}

export async function seriesFor(symbol: string, sinceTs = 0, limit = 2000): Promise<SpreadRow[]> {
  const d = db();
  if (!d) return [];
  const {results} = await d
    .prepare(
      `SELECT * FROM spread_samples
       WHERE symbol = ? AND ts >= ?
       ORDER BY ts DESC LIMIT ?`,
    )
    .bind(symbol, sinceTs, limit)
    .all<SpreadRow>();
  return results ?? [];
}

export async function coverage(): Promise<Coverage> {
  const d = db();
  if (!d) {
    return {totalSamples: 0, quotedSamples: 0, assets: 0, firstTs: null, lastTs: null, notional: null};
  }
  const row = await d
    .prepare(
      `SELECT COUNT(*) AS totalSamples,
              SUM(ok) AS quotedSamples,
              COUNT(DISTINCT symbol) AS assets,
              MIN(ts) AS firstTs,
              MAX(ts) AS lastTs,
              MAX(notional_usd) AS notional
       FROM spread_samples`,
    )
    .first<Coverage>();
  return (
    row ?? {totalSamples: 0, quotedSamples: 0, assets: 0, firstTs: null, lastTs: null, notional: null}
  );
}

/// Raw rows for export. Bounded, because this is a public endpoint.
export async function rowsForExport(opts: {
  symbol?: string | undefined;
  sinceTs?: number | undefined;
  limit?: number | undefined;
}): Promise<SpreadRow[]> {
  const d = db();
  if (!d) return [];
  const limit = Math.min(Math.max(opts.limit ?? 5000, 1), 50_000);
  const sinceTs = opts.sinceTs ?? 0;

  const stmt = opts.symbol
    ? d
        .prepare(
          `SELECT * FROM spread_samples WHERE symbol = ? AND ts >= ? ORDER BY ts DESC LIMIT ?`,
        )
        .bind(opts.symbol, sinceTs, limit)
    : d
        .prepare(`SELECT * FROM spread_samples WHERE ts >= ? ORDER BY ts DESC LIMIT ?`)
        .bind(sinceTs, limit);

  const {results} = await stmt.all<SpreadRow>();
  return results ?? [];
}
