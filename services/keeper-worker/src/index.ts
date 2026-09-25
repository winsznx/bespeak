import {tick} from "@bespeak/worker/run-keeper";

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
  KEEPER_LOW_BALANCE_OKB?: string;
  RECEIPT_INGEST_URL?: string;
  RECEIPT_INGEST_TOKEN?: string;
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

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    bridgeEnv(env);
    // waitUntil, so a tick that outlives the scheduled callback still finishes submitting
    // and verifying rather than being cut off mid-execution.
    ctx.waitUntil(
      tick({dryRun: false}).catch((e: unknown) => {
        console.error("keeper tick failed:", e instanceof Error ? e.message : String(e));
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
      await tick({dryRun: false});
      return Response.json({ran: true});
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
