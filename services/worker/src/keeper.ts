import {formatEther, type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultAbi, AssetRegistryAbi} from "@bespeak/sdk";
import {reasonFromCode, TriggerType, MarketStatus, type Reason} from "@bespeak/shared";
import {observeSessions, signObservation, type SessionObservation} from "@bespeak/conditions";
import {
  OkxDexClient,
  validateRoute,
  buildDirectRoute,
  assertVerifiedVenue,
} from "@bespeak/okx";
import assetManifest from "@bespeak/assets/manifest" with {type: "json"};
import {
  POLICY,
  deployment,
  keeperAccount,
  keeperWallet,
  okxCredentials,
  publicWriteClient,
} from "./config.js";

/// Operator solvency metrics (PRD 29.1). Exposed so low balance is visible before it
/// becomes a stranded execution.
export interface KeeperHealth {
  address: Address;
  nativeBalanceWei: bigint;
  nativeBalanceOkb: string;
  belowThreshold: boolean;
  estimatedAttemptsRemaining: number;
  lastSuccessfulConditionFetch: string | null;
  lastSuccessfulRouteFetch: string | null;
}

const ERC20_BALANCE_ABI = [
  {name: "balanceOf", type: "function", stateMutability: "view", inputs: [{type: "address"}], outputs: [{type: "uint256"}]},
] as const;

let lastConditionFetch: string | null = null;
let lastRouteFetch: string | null = null;

export async function keeperHealth(): Promise<KeeperHealth> {
  const client = publicWriteClient();
  const account = keeperAccount();
  const balance = await client.getBalance({address: account.address});
  const gasPrice = await client.getGasPrice();
  // A full execution measured at roughly 600k gas; deliberately pessimistic so the estimate
  // errs toward stopping early rather than stopping mid-flight.
  const perAttempt = gasPrice * 600_000n;

  return {
    address: account.address,
    nativeBalanceWei: balance,
    nativeBalanceOkb: formatEther(balance),
    belowThreshold: balance < POLICY.keeperLowBalanceWei,
    estimatedAttemptsRemaining: perAttempt > 0n ? Number(balance / perAttempt) : 0,
    lastSuccessfulConditionFetch: lastConditionFetch,
    lastSuccessfulRouteFetch: lastRouteFetch,
  };
}

export interface OrderView {
  id: Hash;
  owner: Address;
  vault: Address;
  inputToken: Address;
  assetId: Hash;
  receiver: Address;
  triggerType: number;
  amountIn: bigint;
  minAmountOut: bigint;
  maxSlippageBps: number;
  validAfter: bigint;
  expiresAt: bigint;
  minSourceTier: number;
  recurringId: Hash;
  occurrenceIndex: number;
  status: number;
}

/// What the keeper concluded about one order this tick. These are projections; none of them
/// is authoritative and none can make an inactive order spendable (PRD 16.2).
export interface OrderAssessment {
  orderId: Hash;
  projected: "WAITING" | "HELD" | "ELIGIBLE" | "EXECUTING" | "FILLED" | "TERMINAL";
  reason: Reason;
  detail: string;
  observation: SessionObservation | null;
  /// Which venue priced the attempt. Recorded because "what was this filled against" is
  /// part of the evidence, and the two sources do not carry the same guarantees: the
  /// aggregator searches venues, the direct route only knows the pool the registry pinned.
  routeSource?: "okx-aggregator" | "uniswap-v3-direct";
}

export async function loadActiveOrders(): Promise<OrderView[]> {
  const client = publicWriteClient();
  const d = deployment();
  const total = (await client.readContract({
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "totalOrders",
  })) as bigint;

  // Two batched calls rather than two per order. Sequentially this was 1 + 2N round trips:
  // nine for four orders, two hundred and one for a hundred, each waiting on the last. That
  // is the page that took seconds to render and the tick that ran out of subrequests.
  const indices = Array.from({length: Number(total)}, (_, i) => BigInt(i));
  const ids = (await client.multicall({
    allowFailure: false,
    contracts: indices.map((i) => ({
      address: d.orderManager,
      abi: BespeakOrderManagerAbi,
      functionName: "orderAt",
      args: [i],
    })),
  })) as unknown as Hash[];

  return (await client.multicall({
    allowFailure: false,
    contracts: ids.map((id) => ({
      address: d.orderManager,
      abi: BespeakOrderManagerAbi,
      functionName: "getOrder",
      args: [id],
    })),
  })) as unknown as OrderView[];
}

/// Build the signed condition evidence for one order, or null when the trigger needs none.
async function buildEvidence(
  order: OrderView,
  symbolFor: Map<Hash, string>,
): Promise<{evidence: `0x${string}`; observation: SessionObservation} | null> {
  if (order.triggerType === TriggerType.IMMEDIATE) return null;

  const symbol = symbolFor.get(order.assetId);
  if (!symbol) throw new Error(`no symbol known for asset ${order.assetId}`);

  const sessions = await observeSessions([symbol]);
  const obs = sessions.get(symbol);
  if (!obs) throw new Error(`condition source returned nothing for ${symbol}`);
  lastConditionFetch = new Date().toISOString();

  const wallet = keeperWallet();
  const evidence = await signObservation(
    wallet,
    keeperAccount(),
    deployment().conditionVerifier,
    order.assetId,
    obs,
  );
  return {evidence, observation: obs};
}

/// Assess a single active order: fetch its condition, request a route, and ask the contract
/// itself whether the attempt would be accepted.
///
/// Every refusal below comes from `checkExecution`, which is the same function `execute`
/// runs. The keeper never forms its own opinion about eligibility, so it cannot execute
/// something the contract would have refused, nor hold something the contract would allow.
/// Fee tier of the pool the registry recorded for an asset.
///
/// The on-chain registry stores identity and the output token, not venue parameters, so
/// the tier comes from the same pinned manifest whose revision the receipt cites. Returns
/// undefined rather than guessing a tier: quoting the wrong pool would silently price
/// against liquidity nobody verified.
function poolFeeTierFor(symbol: string | undefined): number | undefined {
  if (!symbol) return undefined;
  const entry = assetManifest.assets.find((a) => a.symbol === symbol);
  return entry?.route?.feeTier;
}

export type RouteSource = "okx-aggregator" | "uniswap-v3-direct";

export interface ResolvedRoute {
  route: {
    router: Address;
    approveTarget: Address;
    calldata: `0x${string}`;
    minReceive: bigint;
    expectedOut: bigint;
    priceImpactPercent: number;
    quotedAt: number;
  };
  source: RouteSource;
}

/// The one place a route is built.
///
/// Assessment and execution previously constructed routes separately, which meant a change
/// to routing had to be made twice and the two could disagree about what would happen. They
/// now share this, so what the keeper says it will submit is what it submits.
///
/// OKX is primary because it aggregates across venues and normally prices better. The
/// direct pool is the fallback and knows only the pool the registry pinned; it needs no
/// credentials, which is the difference between a conditioned order executing and the
/// engine stalling on an API key. If both fail the caller sees why each one did.
export async function resolveRoute(
  order: OrderView,
  outputToken: Address,
  symbol: string | undefined,
): Promise<ResolvedRoute> {
  const client = publicWriteClient();
  const d = deployment();
  const errors: string[] = [];

  try {
    const okx = new OkxDexClient(okxCredentials());
    const chain = await okx.supportedChain();
    const swap = await okx.swap({
      fromToken: order.inputToken,
      toToken: outputToken,
      amount: order.amountIn,
      slippageBps: order.maxSlippageBps,
      caller: d.executionAdapter,
      receiver: order.receiver,
      builderFee: OkxDexClient.builderFeeFrom(process.env),
    });
    const route = validateRoute(swap, chain.dexTokenApproveAddress as Address, {
      receiver: order.receiver,
      maxAmountIn: order.amountIn,
      minAmountOut: order.minAmountOut,
    });
    return {route, source: "okx-aggregator"};
  } catch (e) {
    errors.push(`okx: ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    const feeTier = poolFeeTierFor(symbol);
    if (feeTier === undefined) throw new Error("no recorded pool fee tier for this asset");
    // Fails closed unless the router and quoter belong to the same v3 deployment the pools
    // were discovered in.
    await assertVerifiedVenue(client);
    const direct = await buildDirectRoute(client, {
      fromToken: order.inputToken,
      toToken: outputToken,
      amount: order.amountIn,
      feeTier,
      slippageBps: order.maxSlippageBps,
      receiver: order.receiver,
      caller: d.executionAdapter,
    });
    // The user's floor always governs; the contract enforces it again regardless.
    const minReceive =
      direct.minReceive > order.minAmountOut ? direct.minReceive : order.minAmountOut;
    return {route: {...direct, minReceive}, source: "uniswap-v3-direct"};
  } catch (e) {
    errors.push(`direct: ${e instanceof Error ? e.message : String(e)}`);
  }

  throw new Error(errors.join(" | "));
}

export async function assessOrder(
  order: OrderView,
  symbolFor: Map<Hash, string>,
  outputTokenFor: Map<Hash, Address>,
): Promise<OrderAssessment> {
  const client = publicWriteClient();
  const d = deployment();

  if (order.status !== 1) {
    return {orderId: order.id, projected: "TERMINAL", reason: "ORDER_NOT_ACTIVE", detail: "", observation: null};
  }

  let evidence: `0x${string}` = "0x";
  let observation: SessionObservation | null = null;
  try {
    const built = await buildEvidence(order, symbolFor);
    if (built) {
      evidence = built.evidence;
      observation = built.observation;
    }
  } catch (e) {
    return {
      orderId: order.id,
      projected: "HELD",
      reason: "CONDITION_SOURCE_UNAVAILABLE",
      detail: String(e),
      observation: null,
    };
  }

  // A halt is asset state, not session state, and holds regardless of the period reported.
  if (observation?.halted) {
    return {orderId: order.id, projected: "HELD", reason: "ASSET_HALTED", detail: "issuer reports trading halted", observation};
  }

  // Cheap pre-check before spending an API call on a route that cannot be used.
  if (
    order.triggerType === TriggerType.NEXT_REGULAR_SESSION &&
    observation &&
    observation.marketStatus !== MarketStatus.REGULAR
  ) {
    return {
      orderId: order.id,
      projected: "WAITING",
      reason: observation.marketStatus === MarketStatus.UNKNOWN ? "MARKET_UNKNOWN" : "MARKET_CLOSED",
      detail: `issuer period="${observation.raw.currentPeriod}"`,
      observation,
    };
  }

  const outputToken = outputTokenFor.get(order.assetId);
  if (!outputToken) {
    return {orderId: order.id, projected: "HELD", reason: "ASSET_NOT_SUPPORTED", detail: "no output token in registry", observation};
  }

  let route;
  let routeSource: RouteSource;
  try {
    const resolved = await resolveRoute(order, outputToken, symbolFor.get(order.assetId));
    route = resolved.route;
    routeSource = resolved.source;
    lastRouteFetch = new Date().toISOString();
  } catch (e) {
    return {
      orderId: order.id,
      projected: "HELD",
      reason: "NO_ROUTE",
      detail: String(e),
      observation,
    };
  }

  const req = {
    router: route.router,
    approveTarget: route.approveTarget,
    amountIn: order.amountIn,
    minAmountOut: route.minReceive,
    quoteTimestamp: BigInt(route.quotedAt),
    quoteHash: route.calldata.slice(0, 66) as Hash,
    routerCalldata: route.calldata,
    conditionEvidence: evidence,
  };

  const code = (await client.readContract({
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "checkExecution",
    args: [order.id, req],
  })) as number;

  const reason = reasonFromCode(Number(code));
  if (reason !== "OK") {
    const waiting = reason === "MARKET_CLOSED" || reason === "NOT_YET_VALID" || reason === "ASSET_NOT_AVAILABLE";
    return {orderId: order.id, projected: waiting ? "WAITING" : "HELD", reason, detail: "", observation, routeSource};
  }

  return {orderId: order.id, projected: "ELIGIBLE", reason: "OK", detail: "", observation, routeSource};
}

/// Capture the balances an execution will be verified against, BEFORE submitting.
/// Without these there is nothing to compare the post-state to, so a fill could only ever
/// be claimed, never verified.
export async function capturePreState(order: OrderView, outputToken: Address) {
  const client = publicWriteClient();
  const d = deployment();
  const [receiverOutputBefore, vaultInputBefore, executionCountBefore] = await Promise.all([
    client.readContract({address: outputToken, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [order.receiver]}) as Promise<bigint>,
    client.readContract({address: order.inputToken, abi: ERC20_BALANCE_ABI, functionName: "balanceOf", args: [order.vault]}) as Promise<bigint>,
    client.readContract({address: d.orderManager, abi: BespeakOrderManagerAbi, functionName: "executionCount", args: [order.id]}) as Promise<number>,
  ]);
  return {
    receiverOutputBefore,
    vaultInputBefore,
    executionCountBefore: Number(executionCountBefore),
    capturedAt: new Date().toISOString(),
  };
}

export async function registrySymbols(): Promise<{
  symbolFor: Map<Hash, string>;
  outputTokenFor: Map<Hash, Address>;
}> {
  const client = publicWriteClient();
  const d = deployment();
  const count = (await client.readContract({
    address: d.assetRegistry,
    abi: AssetRegistryAbi,
    functionName: "assetCount",
  })) as bigint;

  const indices = Array.from({length: Number(count)}, (_, i) => BigInt(i));

  // One batched call per round instead of one network round trip per read. Loading twelve
  // assets took thirty-seven sequential calls, which on its own exceeded the subrequest
  // budget a scheduled worker gets — the keeper was being killed mid-tick, after a fill had
  // landed but before it could verify and publish the receipt.
  const ids = (await client.multicall({
    allowFailure: false,
    contracts: indices.map((i) => ({
      address: d.assetRegistry,
      abi: AssetRegistryAbi,
      functionName: "assetIdAt",
      args: [i],
    })),
  })) as Hash[];

  const [assets, outputs] = await Promise.all([
    client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({
        address: d.assetRegistry,
        abi: AssetRegistryAbi,
        functionName: "getAsset",
        args: [id],
      })),
    }) as unknown as Promise<Array<{symbol: string}>>,
    client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({
        address: d.assetRegistry,
        abi: AssetRegistryAbi,
        functionName: "outputToken",
        args: [id],
      })),
    }) as unknown as Promise<Address[]>,
  ]);

  const symbolFor = new Map<Hash, string>();
  const outputTokenFor = new Map<Hash, Address>();
  ids.forEach((id, i) => {
    symbolFor.set(id, assets[i]!.symbol);
    outputTokenFor.set(id, outputs[i]!);
  });

  return {symbolFor, outputTokenFor};
}

export {BespeakVaultAbi};
