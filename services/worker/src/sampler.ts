import {type Address, type PublicClient} from "viem";
import {OkxDexClient} from "@bespeak/okx";
import {observeSessions} from "@bespeak/conditions";
import manifest from "@bespeak/assets/manifest" with {type: "json"};
import {publicVerifyClient, okxCredentials} from "./config.js";

/// Measure what an xStock actually costs to trade on X Layer, by session.
///
/// The claim this exists to test: pricing for tokenized equities outside the underlying's
/// regular session is an estimate rather than a market. That is repeated everywhere and
/// measured nowhere on X Layer. Bespeak already holds the only two instruments needed, a
/// session oracle it trusts enough to gate real capital on, and an executable quote path :
/// so the measurement costs us two API calls per asset and belongs in the open.
///
/// What is NOT computed here is basis against the underlying equity. There is no equity
/// price oracle on X Layer and the issuer API publishes no price, so a number claiming to
/// be the gap to NASDAQ would be invented. Everything below is measurable from the chain
/// and the aggregator, and nothing else is reported.
///
/// The headline series is `roundTripBps`: buy a fixed notional, immediately sell exactly
/// what that bought, and record what was lost. It captures spread, fee and depth in one
/// number a reader can act on, and grouped by session state it answers the question
/// directly.

/// Quoted size. Large enough that depth shows up, small enough to quote against every pool
/// in the registry. Recorded on every row, because a spread without a size is not a fact.
const DEFAULT_NOTIONAL = 100;

/// Minimum gap between aggregator calls, and how many times a rate-limited call is retried.
///
/// Three concurrent assets was enough to earn `50011 Too Many Requests` on eleven of twelve
/// quotes, which would have published a dataset reading "unquotable" for the whole registry
/// when every one of those markets was quoting fine. Sampling is not latency-sensitive :
/// nothing waits on it, so it goes one call at a time with room to spare.
const QUOTE_GAP_MS = Number(process.env.SAMPLE_QUOTE_GAP_MS ?? 600);
const QUOTE_RETRIES = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/// Serialize every aggregator call in the process behind one paced queue.
///
/// A per-asset limiter would not help: the limit is per credential, so the only thing that
/// respects it is a single chain of calls shared by every caller.
let queue: Promise<unknown> = Promise.resolve();

function paced<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    await sleep(QUOTE_GAP_MS);
    return fn();
  });
  // Keep the chain alive after a rejection, or one failed quote stalls every later one.
  queue = run.catch(() => undefined);
  return run;
}

function isRateLimited(e: unknown): boolean {
  return e instanceof Error && /50011|Too Many Requests|rate/i.test(e.message);
}

async function quoteWithRetry(
  okx: OkxDexClient,
  args: {fromToken: Address; toToken: Address; amount: bigint},
): Promise<bigint> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= QUOTE_RETRIES; attempt++) {
    try {
      const res = await paced(() => okx.quote(args));
      return BigInt(res.toTokenAmount ?? "0");
    } catch (e) {
      lastError = e;
      if (!isRateLimited(e)) throw e;
      // Exponential, because the limiter is a window: retrying at the same cadence that
      // tripped it just spends the next window's budget on failures too.
      await sleep(QUOTE_GAP_MS * 2 ** (attempt + 1));
    }
  }
  throw lastError;
}

const POOL_ABI = [
  {
    name: "slot0",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {type: "uint160", name: "sqrtPriceX96"},
      {type: "int24"},
      {type: "uint16"},
      {type: "uint16"},
      {type: "uint16"},
      {type: "uint8"},
      {type: "bool"},
    ],
  },
  {name: "token0", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "address"}]},
] as const;

export interface SpreadSample {
  ts: number;
  symbol: string;
  underlying: string;
  /// Issuer session period at sample time: market | extended | overnight | closed | unknown.
  session: string;
  halted: 0 | 1;
  notionalUsd: number;
  /// Stable per one whole asset token, from an executable quote in that direction.
  buyPx: number | null;
  sellPx: number | null;
  /// Pool mid from slot0: zero size, no fee. The reference the other two are measured against.
  midPx: number | null;
  roundTripBps: number | null;
  buyImpactBps: number | null;
  sellImpactBps: number | null;
  quoteSource: string;
  pool: string | null;
  feeTier: number | null;
  block: number | null;
  ok: 0 | 1;
  note: string | null;
}

interface RouteInfo {
  quoteToken: Address;
  quoteDecimals: number;
  targetToken: Address;
  pool: string | null;
  feeTier: number | null;
}

interface RegistryAsset {
  symbol: string;
  underlyingSymbol: string;
  wrapperDecimals: number | null;
  route: RouteInfo | null;
}

const REGISTRY = manifest as unknown as {assets: RegistryAsset[]};

/// Pool mid price, expressed as stable per one whole asset token.
///
/// Uniswap v3 stores sqrt(token1/token0) in Q64.96. Which side is which is decided by
/// address ordering, not by what the pair means, so token0 is read rather than assumed :
/// getting that backwards silently inverts every price and the series still looks plausible.
async function poolMid(
  client: PublicClient,
  pool: Address,
  asset: Address,
  assetDecimals: number,
  stableDecimals: number,
): Promise<{mid: number; block: number} | null> {
  const [slot0, token0, block] = await Promise.all([
    client.readContract({address: pool, abi: POOL_ABI, functionName: "slot0"}) as Promise<
      readonly [bigint, number, number, number, number, number, boolean]
    >,
    client.readContract({address: pool, abi: POOL_ABI, functionName: "token0"}) as Promise<Address>,
    client.getBlockNumber(),
  ]);

  const sqrtPriceX96 = slot0[0];
  if (sqrtPriceX96 === 0n) return null;

  // (sqrtPriceX96 / 2^96)^2 is token1 per token0 in raw units. Done in floating point
  // deliberately: this is a reported statistic, never an amount anything is settled against.
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  const raw1per0 = ratio * ratio;

  const assetIsToken0 = token0.toLowerCase() === asset.toLowerCase();
  const mid = assetIsToken0
    ? raw1per0 * 10 ** (assetDecimals - stableDecimals)
    : (1 / raw1per0) * 10 ** (assetDecimals - stableDecimals);

  return Number.isFinite(mid) && mid > 0 ? {mid, block: Number(block)} : null;
}

/// Sample one asset in both directions.
///
/// The sell leg quotes exactly the amount the buy leg returned, so the round trip is the one
/// a user would actually take rather than two unrelated quotes at a round number.
async function sampleAsset(
  asset: RegistryAsset,
  session: {period: string; halted: boolean},
  okx: OkxDexClient,
  client: PublicClient,
  notional: number,
  ts: number,
): Promise<SpreadSample> {
  const base: SpreadSample = {
    ts,
    symbol: asset.symbol,
    underlying: asset.underlyingSymbol,
    session: session.period || "unknown",
    halted: session.halted ? 1 : 0,
    notionalUsd: notional,
    buyPx: null,
    sellPx: null,
    midPx: null,
    roundTripBps: null,
    buyImpactBps: null,
    sellImpactBps: null,
    quoteSource: "okx-dex-aggregator-v6",
    pool: asset.route?.pool ?? null,
    feeTier: asset.route?.feeTier ?? null,
    block: null,
    ok: 0,
    note: null,
  };

  const route = asset.route;
  const assetDecimals = asset.wrapperDecimals;
  if (!route || assetDecimals === null) {
    return {...base, note: "no executable route in registry"};
  }

  const amountIn = BigInt(Math.round(notional * 10 ** route.quoteDecimals));

  try {
    const assetOutRaw = await quoteWithRetry(okx, {
      fromToken: route.quoteToken,
      toToken: route.targetToken,
      amount: amountIn,
    });
    if (assetOutRaw <= 0n) return {...base, note: "buy leg returned zero"};

    const assetOut = Number(assetOutRaw) / 10 ** assetDecimals;
    const buyPx = notional / assetOut;

    const stableBackRaw = await quoteWithRetry(okx, {
      fromToken: route.targetToken,
      toToken: route.quoteToken,
      amount: assetOutRaw,
    });
    if (stableBackRaw <= 0n) {
      return {...base, buyPx, note: "sell leg returned zero"};
    }

    const stableBack = Number(stableBackRaw) / 10 ** route.quoteDecimals;
    const sellPx = stableBack / assetOut;
    const roundTripBps = (1 - stableBack / notional) * 10_000;

    let midPx: number | null = null;
    let block: number | null = null;
    if (route.pool) {
      const m = await poolMid(
        client,
        route.pool as Address,
        route.targetToken,
        assetDecimals,
        route.quoteDecimals,
      ).catch(() => null);
      if (m) {
        midPx = m.mid;
        block = m.block;
      }
    }

    return {
      ...base,
      buyPx,
      sellPx,
      midPx,
      roundTripBps,
      buyImpactBps: midPx ? (buyPx / midPx - 1) * 10_000 : null,
      sellImpactBps: midPx ? (1 - sellPx / midPx) * 10_000 : null,
      block,
      ok: 1,
    };
  } catch (e) {
    return {...base, note: e instanceof Error ? e.message.slice(0, 180) : "quote failed"};
  }
}

/// Take one full sample across the registry.
///
/// Assets are walked in small batches rather than all at once: the aggregator rate-limits,
/// and a burst that trips the limit would record a row of nulls that reads as "the market
/// was unquotable" when the truth is that we asked too fast.
export async function sampleSpreads(opts: {notional?: number} = {}): Promise<SpreadSample[]> {
  const notional = opts.notional ?? DEFAULT_NOTIONAL;
  const ts = Math.floor(Date.now() / 1000);
  const okx = new OkxDexClient(okxCredentials());
  const client = publicVerifyClient();
  const assets = REGISTRY.assets;

  let sessions = new Map<string, {raw: {currentPeriod: string}; halted: boolean}>();
  try {
    sessions = (await observeSessions(assets.map((a) => a.symbol))) as unknown as typeof sessions;
  } catch {
    // An unreachable issuer costs the session tag, not the price measurement. The rows are
    // still worth recording; they are simply not attributable to a session state.
  }

  // One asset at a time, so an asset's buy and sell legs stay adjacent in the paced queue.
  // Fanning out would interleave other assets between the two legs of a round trip, and the
  // price could move in the gap, which would be recorded as spread that nobody would pay.
  const out: SpreadSample[] = [];
  for (const a of assets) {
    const s = sessions.get(a.symbol);
    out.push(
      await sampleAsset(
        a,
        {period: s?.raw.currentPeriod ?? "", halted: Boolean(s?.halted)},
        okx,
        client,
        notional,
        ts,
      ),
    );
  }
  return out;
}
