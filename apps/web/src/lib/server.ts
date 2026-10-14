import "server-only";
import {createPublicClient, http, type Address, type Hash, type PublicClient} from "viem";
import {xLayer, DEFAULT_WRITE_RPC, OrderStatus, TriggerType, reasonFromCode} from "@bespeak/shared";
import {
  AssetRegistryAbi,
  BespeakOrderManagerAbi,
  BespeakOrderManagerV1Abi,
  BespeakVaultAbi,
  BespeakVaultFactoryAbi,
} from "@bespeak/sdk";
import manifest from "@bespeak/assets/manifest" assert {type: "json"};

export interface ManifestAsset {
  assetId: `0x${string}`;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  canonicalId: string;
  isin: string;
  underlying: Address;
  wrapper: Address | null;
  wrapperVersion: number;
  underlyingDecimals: number;
  wrapperDecimals: number | null;
  tradingHoursMode: string;
  exchangeMic: string;
  exchangeTimezone: string;
  logo: string;
  onchainVerified: boolean;
  verificationNotes: string[];
  route: {
    quoteSymbol: string;
    quoteToken: Address;
    quoteDecimals: number;
    targetToken: Address;
    pool: Address;
    feeTier: number;
    quoteDepth: number;
  } | null;
}

export interface Manifest {
  sourceRevision: string;
  sourceUri: string;
  sourceFetchedAt: string;
  chainId: number;
  catalogueSize: number;
  stables: Record<string, {address: Address; symbol: string; name: string; decimals: number}>;
  assets: ManifestAsset[];
}

export const REGISTRY = manifest as unknown as Manifest;

export function assetBySymbol(symbol: string): ManifestAsset | undefined {
  return REGISTRY.assets.find((a) => a.symbol.toLowerCase() === symbol.toLowerCase());
}

/// Contract addresses come from the environment, and their absence is a first-class state
/// rather than a crash: before deployment the product must still render and say so.
export interface Deployment {
  assetRegistry: Address;
  routerRegistry: Address;
  orderManager: Address;
  vaultFactory: Address;
  executionAdapter: Address;
  conditionVerifier: Address;
}

export function deployment(): Deployment | null {
  const e = process.env;
  const keys = [
    "BESPEAK_ASSET_REGISTRY",
    "BESPEAK_ROUTER_REGISTRY",
    "BESPEAK_ORDER_MANAGER",
    "BESPEAK_VAULT_FACTORY",
    "BESPEAK_EXECUTION_ADAPTER",
    "BESPEAK_CONDITION_VERIFIER",
  ] as const;
  if (keys.some((k) => !e[k])) return null;
  return {
    assetRegistry: e.BESPEAK_ASSET_REGISTRY as Address,
    routerRegistry: e.BESPEAK_ROUTER_REGISTRY as Address,
    orderManager: e.BESPEAK_ORDER_MANAGER as Address,
    vaultFactory: e.BESPEAK_VAULT_FACTORY as Address,
    executionAdapter: e.BESPEAK_EXECUTION_ADAPTER as Address,
    conditionVerifier: e.BESPEAK_CONDITION_VERIFIER as Address,
  };
}

/// The v1.1 deployment: same registries, new manager, vault factory and adapter.
export function deploymentV11(): Pick<Deployment, "orderManager" | "vaultFactory"> | null {
  const e = process.env;
  if (!e.BESPEAK_ORDER_MANAGER_V11 || !e.BESPEAK_VAULT_FACTORY_V11) return null;
  return {
    orderManager: e.BESPEAK_ORDER_MANAGER_V11 as Address,
    vaultFactory: e.BESPEAK_VAULT_FACTORY_V11 as Address,
  };
}

export type GenerationId = "v1" | "v1.1";

export interface Generation {
  id: GenerationId;
  orderManager: Address;
  vaultFactory: Address;
  /// Each generation is read with the ABI it was compiled from. v1.1's Order struct carries
  /// two fields v1 does not return, so decoding a v1 order against the v1.1 ABI fails
  /// outright. Sharing one ABI between them is the single thing that would silently break
  /// every history page.
  abi: typeof BespeakOrderManagerV1Abi | typeof BespeakOrderManagerAbi;
  /// Whether new orders may be created here. Exactly one generation is current.
  current: boolean;
}

/// Every generation the app reads, newest first.
///
/// Both are live on chain at once because a vault factory is immutably bound to its manager,
/// so the sell side could not be an upgrade in place. v1 keeps its vaults and its order
/// history; dropping it would have deleted the product's own evidence from its interface.
export function generations(): Generation[] {
  const v1 = deployment();
  const v11 = deploymentV11();
  const out: Generation[] = [];
  if (v11) {
    out.push({
      id: "v1.1",
      orderManager: v11.orderManager,
      vaultFactory: v11.vaultFactory,
      abi: BespeakOrderManagerAbi,
      current: true,
    });
  }
  if (v1) {
    out.push({
      id: "v1",
      orderManager: v1.orderManager,
      vaultFactory: v1.vaultFactory,
      abi: BespeakOrderManagerV1Abi,
      // v1 is current only when v1.1 is not configured at all.
      current: !v11,
    });
  }
  return out;
}

export function currentGeneration(): Generation | null {
  return generations().find((g) => g.current) ?? null;
}

export function rpc(): PublicClient {
  return createPublicClient({
    chain: xLayer,
    transport: http(process.env.XLAYER_RPC_URL ?? DEFAULT_WRITE_RPC),
  });
}

export interface OrderRecord {
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
  createdAt: bigint;
  validAfter: bigint;
  expiresAt: bigint;
  minSourceTier: number;
  recurringId: Hash;
  occurrenceIndex: number;
  status: number;
  /// v1.1 only. 0 = BUY, 1 = SELL. v1 orders are always buys, and are reported as such
  /// rather than left undefined, so nothing downstream has to special-case a generation.
  side?: number;
  /// v1.1 SELL only: the stablecoin the proceeds land in.
  outputToken?: Address;
  /// Which deployment this order lives on. Needed to cancel it: a v1 order can only be
  /// cancelled through the v1 manager.
  generation?: GenerationId;
}

/// Normalise a decoded order into the shape the app uses everywhere.
///
/// v1 predates `side`, and every v1 order is a buy because that is all v1 could do. Filling
/// it in here rather than leaving it undefined means no page, chip or filter has to know
/// which generation it is looking at.
function normalise(o: OrderRecord, gen: GenerationId): OrderRecord {
  return {
    ...o,
    side: o.side ?? 0,
    outputToken: o.outputToken ?? ("0x0000000000000000000000000000000000000000" as Address),
    generation: gen,
  };
}

/// Read one order, trying each generation. An id is unique to its manager, so the first
/// generation that returns it is the one that owns it.
export async function getOrder(id: Hash): Promise<OrderRecord | null> {
  const client = rpc();
  for (const g of generations()) {
    try {
      const o = (await client.readContract({
        address: g.orderManager,
        abi: g.abi,
        functionName: "getOrder",
        args: [id],
      })) as unknown as OrderRecord;
      if (o && o.id === id) return normalise(o, g.id);
    } catch {
      // `getOrder` reverts with UnknownOrder on the generation that does not hold it, which
      // is the expected case for every id on all but one manager.
    }
  }
  return null;
}

async function ordersOfGeneration(g: Generation, owner: Address): Promise<OrderRecord[]> {
  const client = rpc();
  try {
    const ids = (await client.readContract({
      address: g.orderManager,
      abi: g.abi,
      functionName: "ordersOf",
      args: [owner],
    })) as Hash[];
    if (ids.length === 0) return [];

    const orders = (await client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({
        address: g.orderManager,
        abi: g.abi,
        functionName: "getOrder",
        args: [id],
      })),
    })) as unknown as OrderRecord[];
    return orders.map((o) => normalise(o, g.id));
  } catch {
    return [];
  }
}

export async function getOrdersOf(owner: Address): Promise<OrderRecord[]> {
  const per = await Promise.all(generations().map((g) => ordersOfGeneration(g, owner)));
  return per.flat().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

async function allOrdersOfGeneration(g: Generation): Promise<OrderRecord[]> {
  const client = rpc();
  try {
    const total = (await client.readContract({
      address: g.orderManager,
      abi: g.abi,
      functionName: "totalOrders",
    })) as bigint;
    if (total === 0n) return [];

    // Two batched calls rather than two per order. Sequentially this was 1 + 2N round
    // trips, so the orders page got slower in proportion to how much anyone had used the
    // product: nine calls for four orders, two hundred and one for a hundred.
    const indices = Array.from({length: Number(total)}, (_, i) => BigInt(i));
    const ids = (await client.multicall({
      allowFailure: false,
      contracts: indices.map((i) => ({
        address: g.orderManager,
        abi: g.abi,
        functionName: "orderAt",
        args: [i],
      })),
    })) as unknown as Hash[];

    const orders = (await client.multicall({
      allowFailure: false,
      contracts: ids.map((id) => ({
        address: g.orderManager,
        abi: g.abi,
        functionName: "getOrder",
        args: [id],
      })),
    })) as unknown as OrderRecord[];
    return orders.map((o) => normalise(o, g.id));
  } catch {
    return [];
  }
}

/// Every order across every generation, newest first.
///
/// Read in parallel and merged. One generation being unreachable must not blank the other:
/// each reader already fails to an empty list, so a partial outcome is a shorter history
/// rather than an error page.
export async function getAllOrders(): Promise<OrderRecord[]> {
  const per = await Promise.all(generations().map(allOrdersOfGeneration));
  return per.flat().sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

export interface VaultState {
  address: Address | null;
  balances: Array<{symbol: string; address: Address; decimals: number; total: bigint; available: bigint; reserved: bigint}>;
}

export async function getVault(owner: Address): Promise<VaultState> {
  const d = deployment();
  const empty: VaultState = {address: null, balances: []};
  if (!d) return empty;
  const client = rpc();

  try {
    const vault = (await client.readContract({
      address: d.vaultFactory,
      abi: BespeakVaultFactoryAbi,
      functionName: "vaultOf",
      args: [owner],
    })) as Address;

    if (vault === "0x0000000000000000000000000000000000000000") {
      const predicted = (await client.readContract({
        address: d.vaultFactory,
        abi: BespeakVaultFactoryAbi,
        functionName: "predictVault",
        args: [owner],
      })) as Address;
      return {address: predicted, balances: []};
    }

    const balances = await Promise.all(
      Object.values(REGISTRY.stables).map(async (s) => {
        const [total, available] = await Promise.all([
          client.readContract({address: vault, abi: BespeakVaultAbi, functionName: "balance", args: [s.address]}) as Promise<bigint>,
          client.readContract({address: vault, abi: BespeakVaultAbi, functionName: "available", args: [s.address]}) as Promise<bigint>,
        ]);
        return {
          symbol: s.symbol,
          address: s.address,
          decimals: s.decimals,
          total,
          available,
          reserved: total - available,
        };
      }),
    );
    return {address: vault, balances};
  } catch {
    return empty;
  }
}

/// Aggregate committed demand for assets that are not currently executable.
/// Counts only live reservations on active orders: this is capital actually committed, not
/// votes, likes or waitlist signups (PRD 31).
export async function getDemand() {
  const orders = await getAllOrders();
  const byAsset = new Map<string, {assetId: Hash; committed: bigint; orders: number; earliestExpiry: bigint}>();

  for (const o of orders) {
    if (o.status !== OrderStatus.ACTIVE) continue;
    if (o.triggerType !== TriggerType.WHEN_AVAILABLE) continue;
    const key = o.assetId;
    const cur = byAsset.get(key) ?? {assetId: o.assetId, committed: 0n, orders: 0, earliestExpiry: o.expiresAt};
    cur.committed += o.amountIn;
    cur.orders += 1;
    if (o.expiresAt < cur.earliestExpiry) cur.earliestExpiry = o.expiresAt;
    byAsset.set(key, cur);
  }
  return [...byAsset.values()].sort((a, b) => (b.committed > a.committed ? 1 : -1));
}

export {OrderStatus, TriggerType, reasonFromCode};


/// Read market sessions, with an upper bound so a stalled issuer cannot hang a render.
///
/// This deadline was two seconds when pages were uncached and every request paid the full
/// eleven-request catalogue read. That made the dashboard sit on skeletons for ten seconds,
/// so the read was cut short — and the cut-short result then said every market was
/// "Unknown", which is the one fact these pages exist to report. Trading a slow truth for a
/// fast falsehood was the wrong trade.
///
/// With pages served from the incremental cache and revalidated in the background, a slow
/// read is paid once per window by a request that is refreshing a page someone else is
/// already being served. So the bound is now generous: it exists only so a hung issuer
/// cannot hold a render open indefinitely, not to routinely cut the read short.
export async function observeSessionsWithin<T>(
  read: Promise<Map<string, T>>,
  ms = 12_000,
): Promise<Map<string, T>> {
  try {
    return await Promise.race([
      read,
      new Promise<Map<string, T>>((resolve) => setTimeout(() => resolve(new Map()), ms)),
    ]);
  } catch {
    return new Map();
  }
}
