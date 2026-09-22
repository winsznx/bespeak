import "server-only";
import {createPublicClient, http, type Address, type Hash, type PublicClient} from "viem";
import {xLayer, DEFAULT_WRITE_RPC, OrderStatus, TriggerType, reasonFromCode} from "@bespeak/shared";
import {
  AssetRegistryAbi,
  BespeakOrderManagerAbi,
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
}

export async function getOrder(id: Hash): Promise<OrderRecord | null> {
  const d = deployment();
  if (!d) return null;
  try {
    return (await rpc().readContract({
      address: d.orderManager,
      abi: BespeakOrderManagerAbi,
      functionName: "getOrder",
      args: [id],
    })) as unknown as OrderRecord;
  } catch {
    return null;
  }
}

export async function getOrdersOf(owner: Address): Promise<OrderRecord[]> {
  const d = deployment();
  if (!d) return [];
  const client = rpc();
  try {
    const ids = (await client.readContract({
      address: d.orderManager,
      abi: BespeakOrderManagerAbi,
      functionName: "ordersOf",
      args: [owner],
    })) as Hash[];

    return (await Promise.all(
      ids.map((id) =>
        client.readContract({
          address: d.orderManager,
          abi: BespeakOrderManagerAbi,
          functionName: "getOrder",
          args: [id],
        }) as Promise<unknown> as Promise<OrderRecord>,
      ),
    )) as OrderRecord[];
  } catch {
    return [];
  }
}

export async function getAllOrders(): Promise<OrderRecord[]> {
  const d = deployment();
  if (!d) return [];
  const client = rpc();
  try {
    const total = (await client.readContract({
      address: d.orderManager,
      abi: BespeakOrderManagerAbi,
      functionName: "totalOrders",
    })) as bigint;

    const out: OrderRecord[] = [];
    for (let i = 0n; i < total; i++) {
      const id = (await client.readContract({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: "orderAt",
        args: [i],
      })) as Hash;
      out.push(
        (await client.readContract({
          address: d.orderManager,
          abi: BespeakOrderManagerAbi,
          functionName: "getOrder",
          args: [id],
        })) as unknown as OrderRecord,
      );
    }
    return out;
  } catch {
    return [];
  }
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
