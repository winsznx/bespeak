-- Bespeak open dataset: executable spread for official xStocks on X Layer, by session.
--
-- One row per asset per sample. Written by the keeper worker on its cron; read by the web
-- worker and by anyone, through /api/basis and /api/basis.csv.
--
-- Prices are reported statistics, stored as REAL. Nothing is ever settled against this
-- table, settlement amounts live on chain, in the order manager's own events.

CREATE TABLE IF NOT EXISTS spread_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Unix seconds. One sample run shares a ts across all assets, so a run can be grouped.
  ts              INTEGER NOT NULL,
  symbol          TEXT    NOT NULL,
  underlying      TEXT    NOT NULL,
  -- Issuer session period at sample time: market | extended | overnight | closed | unknown.
  session         TEXT    NOT NULL,
  halted          INTEGER NOT NULL DEFAULT 0,
  -- The quoted size. A spread without a size is not a fact, so it is stored per row.
  notional_usd    REAL    NOT NULL,
  -- Stable per one whole asset token.
  buy_px          REAL,
  sell_px         REAL,
  -- Pool mid from slot0: zero size, no fee.
  mid_px          REAL,
  -- The headline series: buy the notional, sell back exactly what it bought, in bps lost.
  round_trip_bps  REAL,
  buy_impact_bps  REAL,
  sell_impact_bps REAL,
  quote_source    TEXT    NOT NULL,
  pool            TEXT,
  fee_tier        INTEGER,
  block           INTEGER,
  -- 1 only when both legs quoted. Failed samples are kept, with their reason, so a gap in
  -- the series can be told apart from a market that could not be quoted.
  ok              INTEGER NOT NULL DEFAULT 0,
  note            TEXT
);

CREATE INDEX IF NOT EXISTS idx_spread_symbol_ts ON spread_samples (symbol, ts DESC);
CREATE INDEX IF NOT EXISTS idx_spread_ts        ON spread_samples (ts DESC);
CREATE INDEX IF NOT EXISTS idx_spread_session   ON spread_samples (session, symbol);
