import {tick} from "@bespeak/worker/run-keeper";
import {sampleSpreads, type SpreadSample} from "@bespeak/worker/sampler";

/// The keeper, on a schedule, hosted.
///
/// It ran as a process on a laptop until now, which meant standing orders only executed
/// while that laptop was awake. A conditioned order whose whole promise is "leave, and come
/// back to the outcome" cannot depend on someone's machine staying open.
///
/// The keeper logic itself is unchanged and shared with the CLI: one `tick` assesses every
/// active order, and executes only the ones the contract itself agrees are eligible. This
/// file is the scheduling and configuration shell around it.

export interface Env {
  KEEPER_PRIVATE_KEY: string;
  OKX_API_KEY: string;
  OKX_API_SECRET: string;
  OKX_API_PASSPHRASE: string;
  OKX_PROJECT_ID?: string;
  XLAYER_RPC_URL?: string;
  XLAYER_VERIFY_RPC_URL?: string;
  BESPEAK_ASSET_REGISTRY: string;
  BESPEAK_ROUTER_REGISTRY: string;
  BESPEAK_ORDER_MANAGER: string;
  BESPEAK_VAULT_FACTORY: string;
  BESPEAK_EXECUTION_ADAPTER: string;
  BESPEAK_CONDITION_VERIFIER: string;
  /// v1.1. The generation the web app and the MCP server write to. Absent means v1 only.
  BESPEAK_ORDER_MANAGER_V11?: string;
  BESPEAK_VAULT_FACTORY_V11?: string;
  BESPEAK_EXECUTION_ADAPTER_V11?: string;
  KEEPER_LOW_BALANCE_OKB?: string;
  RECEIPT_INGEST_URL?: string;
  RECEIPT_INGEST_TOKEN?: string;
  /// Open spread dataset. Absent in local runs, which simply skip sampling.
  DATA?: D1Database;
  /// Minutes between samples. Every minute would be 24 aggregator calls a minute for a
  /// series that moves far slower than that.
  SAMPLE_INTERVAL_MIN?: string;
}

/// The shared config layer reads `process.env`, which is how it is configured on a server.
/// Worker bindings arrive on `env` instead, so they are copied across before anything reads
/// them. Doing this per invocation rather than once at module scope keeps a secret rotation
/// taking effect on the next tick instead of the next deploy.
function bridgeEnv(env: Env): void {
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && v.length > 0) process.env[k] = v;
  }
}

/// Tick every generation of contracts, not just one.
///
/// Two managers run at once because a vault factory is immutably bound to its manager, so
/// the sell side could not be an upgrade in place. The web app and the MCP server both
/// write to v1.1 while v1 still holds history and could still hold an open order. A keeper
/// that serviced only one of them would leave orders on the other sitting eligible forever,
/// with the interface cheerfully reporting that it was waiting for a condition that had
/// already held.
///
/// Sequential, not parallel: `tick` reads its addresses from `process.env`, so two
/// overlapping runs would read each other's configuration.
async function tickAll(env: Env): Promise<void> {
  const gens: Array<{id: string; manager: string; factory: string; adapter: string}> = [];
  if (env.BESPEAK_ORDER_MANAGER_V11 && env.BESPEAK_VAULT_FACTORY_V11 && env.BESPEAK_EXECUTION_ADAPTER_V11) {
    gens.push({
      id: "v1.1",
      manager: env.BESPEAK_ORDER_MANAGER_V11,
      factory: env.BESPEAK_VAULT_FACTORY_V11,
      adapter: env.BESPEAK_EXECUTION_ADAPTER_V11,
    });
  }
  gens.push({
    id: "v1",
    manager: env.BESPEAK_ORDER_MANAGER,
    factory: env.BESPEAK_VAULT_FACTORY,
    adapter: env.BESPEAK_EXECUTION_ADAPTER,
  });

  for (const g of gens) {
    process.env.BESPEAK_ORDER_MANAGER = g.manager;
    process.env.BESPEAK_VAULT_FACTORY = g.factory;
    process.env.BESPEAK_EXECUTION_ADAPTER = g.adapter;
    try {
      await tick({dryRun: false});
    } catch (e) {
      // One generation failing must not stop the other. An order on v1.1 should execute
      // even if a v1 read is timing out.
      console.error(`keeper tick ${g.id} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
}

/// Persist one sample run.
///
/// Batched into a single D1 call rather than a statement per asset: twelve sequential round
/// trips inside a cron invocation is most of the time budget, and a partial write would
/// leave a sample run that looks like the market was unquotable for the assets that did not
/// land.
async function storeSamples(db: D1Database, rows: SpreadSample[]): Promise<number> {
  if (rows.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO spread_samples
       (ts, symbol, underlying, session, halted, notional_usd, buy_px, sell_px, mid_px,
        round_trip_bps, buy_impact_bps, sell_impact_bps, quote_source, pool, fee_tier,
        block, ok, note)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  await db.batch(
    rows.map((r) =>
      stmt.bind(
        r.ts, r.symbol, r.underlying, r.session, r.halted, r.notionalUsd,
        r.buyPx, r.sellPx, r.midPx, r.roundTripBps, r.buyImpactBps, r.sellImpactBps,
        r.quoteSource, r.pool, r.feeTier, r.block, r.ok, r.note,
      ),
    ),
  );
  return rows.length;
}

/// Sample if enough time has passed since the last stored run.
///
/// The interval is checked against the data itself rather than against the clock. Cron does
/// not fire on the minute: observed ticks landed at :21:00, :21:59, :22:57, :23:58, so a
/// `getUTCMinutes() % 5` test skips any five-minute boundary the drift happens to step over,
/// and roughly one sample in five never happened. Asking the table when it was last written
/// is one indexed read and cannot drift.
///
/// `force` is for the manual endpoint, which exists precisely to sample off-schedule.
async function runSample(env: Env, force = false): Promise<number> {
  if (!env.DATA) return 0;

  if (!force) {
    const everyS = Math.max(1, Number(env.SAMPLE_INTERVAL_MIN ?? 5)) * 60;
    const last = await env.DATA.prepare(
      "SELECT MAX(ts) AS ts FROM spread_samples",
    ).first<{ts: number | null}>();
    const lastTs = last?.ts ?? 0;
    // A 30s tolerance, so a tick arriving slightly early still counts rather than pushing
    // every subsequent sample a minute later than the one before it.
    if (lastTs && Math.floor(Date.now() / 1000) - lastTs < everyS - 30) return 0;
  }

  const rows = await sampleSpreads();
  return storeSamples(env.DATA, rows);
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    bridgeEnv(env);
    // waitUntil, so a tick that outlives the scheduled callback still finishes submitting
    // and verifying rather than being cut off mid-execution.
    ctx.waitUntil(
      tickAll(env).catch((e: unknown) => {
        console.error("keeper tick failed:", e instanceof Error ? e.message : String(e));
      }),
    );

    // Sampling rides the same every-minute cron and decides for itself whether it is due.
    // It is kept strictly separate from the tick above: a sampling failure must never be
    // able to stop an eligible order from executing, which is the one job this worker
    // cannot miss.
    ctx.waitUntil(
      runSample(env).catch((e: unknown) => {
        console.error("spread sample failed:", e instanceof Error ? e.message : String(e));
      }),
    );
  },

  /// Manual trigger and health check. Returns what the keeper can see, without executing,
  /// so the hosted process can be confirmed alive without spending gas.
  async fetch(request: Request, env: Env): Promise<Response> {
    bridgeEnv(env);
    const url = new URL(request.url);

    if (url.pathname === "/run" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.RECEIPT_INGEST_TOKEN}`) {
        return Response.json({error: "unauthorized"}, {status: 401});
      }
      await tickAll(env);
      return Response.json({ran: true});
    }

    if (url.pathname === "/sample" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.RECEIPT_INGEST_TOKEN}`) {
        return Response.json({error: "unauthorized"}, {status: 401});
      }
      const stored = await runSample(env, true);
      return Response.json({sampled: stored});
    }

    try {
      const {keeperHealth} = await import("@bespeak/worker/keeper");
      const health = await keeperHealth();
      return Response.json({
        keeper: health.address,
        okb: health.nativeBalanceOkb,
        belowThreshold: health.belowThreshold,
        schedule: "every minute",
      });
    } catch (e) {
      return Response.json(
        {error: e instanceof Error ? e.message : String(e)},
        {status: 500},
      );
    }
  },
};
