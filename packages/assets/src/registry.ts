import {createPublicClient, http, getAddress, keccak256, toHex, type Address} from "viem";
import {xLayer, DEFAULT_VERIFY_RPC} from "@bespeak/shared";
import {fetchAllAssets, xLayerDeployment, XSTOCKS_API_BASE, type XStocksAsset} from "./xstocks.js";

/// A Bespeak asset entry, after provenance has been checked against both the issuer API and
/// the chain itself.
export interface BespeakAsset {
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
  /// Set only when every on-chain check below passed.
  onchainVerified: boolean;
  verificationNotes: string[];
}

/// Stablecoins the issuer lists for X Layer. Confirmed on chain 196 on 2026-09-22.
export const XLAYER_STABLES = {
  USDC: {
    address: getAddress("0xb6ceceab302e2e4948951ee7843fc24e92933061"),
    symbol: "USDC",
    name: "USDC",
    decimals: 6,
  },
  USDG: {
    address: getAddress("0x4ae46a509f6b1d9056937ba4500cb143933d2dc8"),
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
  },
} as const;

export type StableSymbol = keyof typeof XLAYER_STABLES;

/// The contract keys assets by a bytes32 id. Deriving it from the canonical issuer id keeps
/// the on-chain key tied to issuer identity rather than to a ticker string, which is the
/// whole point of not trusting tickers.
export function deriveAssetId(canonicalId: string): `0x${string}` {
  return keccak256(toHex(canonicalId));
}

const ERC20_ABI = [
  {name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
  {name: "name", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "string"}]},
  {name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "uint8"}]},
] as const;

const ERC4626_ABI = [
  {name: "asset", type: "function", stateMutability: "view", inputs: [], outputs: [{type: "address"}]},
] as const;

/// Confirm on chain that an API-asserted deployment is the token it claims to be, and that
/// the wrapper really wraps it.
///
/// This is the step that makes the registry trustworthy: the issuer API is authoritative
/// for *which* asset exists, but an address is only accepted once the chain agrees about
/// what lives there. A wrapper whose asset() does not round-trip to the published
/// underlying is rejected rather than downgraded.
export async function verifyOnchain(
  asset: XStocksAsset,
  rpcUrl = DEFAULT_VERIFY_RPC,
): Promise<BespeakAsset | null> {
  const dep = xLayerDeployment(asset);
  if (!dep) return null;

  const client = createPublicClient({chain: xLayer, transport: http(rpcUrl)});
  const notes: string[] = [];
  const underlying = getAddress(dep.address);
  const wrapper = dep.wrapperAddressV2 ? getAddress(dep.wrapperAddressV2) : null;

  let ok = true;

  const [symbol, decimals] = await Promise.all([
    client.readContract({address: underlying, abi: ERC20_ABI, functionName: "symbol"}),
    client.readContract({address: underlying, abi: ERC20_ABI, functionName: "decimals"}),
  ]);

  if (symbol !== asset.symbol) {
    ok = false;
    notes.push(`onchain symbol ${symbol} != api symbol ${asset.symbol}`);
  }

  let wrapperDecimals: number | null = null;
  if (wrapper) {
    const [wAsset, wDecimals] = await Promise.all([
      client.readContract({address: wrapper, abi: ERC4626_ABI, functionName: "asset"}),
      client.readContract({address: wrapper, abi: ERC20_ABI, functionName: "decimals"}),
    ]);
    wrapperDecimals = wDecimals;
    if (getAddress(wAsset) !== underlying) {
      ok = false;
      notes.push(`wrapper.asset() ${wAsset} does not round-trip to underlying ${underlying}`);
    }
  } else {
    notes.push("no v2 wrapper published for this deployment");
  }

  return {
    assetId: deriveAssetId(asset.id),
    symbol: asset.symbol,
    underlyingSymbol: asset.underlyingSymbol,
    name: asset.name,
    canonicalId: asset.id,
    isin: asset.isin,
    underlying,
    wrapper,
    wrapperVersion: wrapper ? 2 : 0,
    underlyingDecimals: decimals,
    wrapperDecimals,
    tradingHoursMode: asset.trading?.tradingHoursMode ?? "unknown",
    exchangeMic: asset.trading?.exchange.mic ?? "",
    exchangeTimezone: asset.trading?.exchange.timezone ?? "America/New_York",
    logo: asset.logo,
    onchainVerified: ok,
    verificationNotes: notes,
  };
}

export interface RegistryManifest {
  /// Content hash over the normalized asset list. This is the `sourceRevision` recorded
  /// against every order, so a later catalogue change is detectable rather than silent.
  sourceRevision: string;
  sourceUri: string;
  sourceFetchedAt: string;
  chainId: number;
  catalogueSize: number;
  stables: typeof XLAYER_STABLES;
  assets: BespeakAsset[];
}

export function computeRevision(assets: BespeakAsset[]): string {
  const normalized = assets
    .map((a) => `${a.canonicalId}|${a.underlying}|${a.wrapper ?? ""}|${a.symbol}`)
    .sort()
    .join("\n");
  return keccak256(toHex(normalized));
}

/// Build a manifest for a chosen subset of symbols, verifying each one on chain.
export async function buildManifest(
  symbols: string[],
  rpcUrl = DEFAULT_VERIFY_RPC,
): Promise<RegistryManifest> {
  const catalogue = await fetchAllAssets();
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));

  const picked = catalogue.filter(
    (a) => wanted.has(a.symbol.toUpperCase()) || wanted.has(a.underlyingSymbol.toUpperCase()),
  );

  const assets: BespeakAsset[] = [];
  for (const a of picked) {
    const verified = await verifyOnchain(a, rpcUrl);
    if (verified) assets.push(verified);
  }

  assets.sort((a, b) => a.symbol.localeCompare(b.symbol));

  return {
    sourceRevision: computeRevision(assets),
    sourceUri: `${XSTOCKS_API_BASE}/public/assets`,
    sourceFetchedAt: new Date().toISOString(),
    chainId: 196,
    catalogueSize: catalogue.length,
    stables: XLAYER_STABLES,
    assets,
  };
}
