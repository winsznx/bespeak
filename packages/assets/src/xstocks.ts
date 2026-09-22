/// Client for the xStocks public v2 API — Bespeak's provenance source for official asset
/// identity (PRD 18.2).
///
/// Everything here was verified live on 2026-09-22:
///   GET https://api.xstocks.fi/api/v2/public/assets?page=N   -> 200, no auth
///   paginated at 100/page, 11 pages, 1026 assets total
///   GET https://api.xstocks.fi/api/v2/public/assets/{SYM}/multiplier?network=XLayer -> 200
///
/// Two traps worth knowing: the domain is xstocks.fi (not .com), and a client that reads
/// only page 0 sees 100 of 1026 assets and wrongly concludes NVDA/TSLA/AAPL are absent.

export const XSTOCKS_API_BASE = "https://api.xstocks.fi/api/v2";

/// The API identifies chains by name, not by EVM chain id. "XLayer" is chain 196; that
/// mapping is ours, confirmed on chain, and is not a field the API provides.
export const XSTOCKS_XLAYER_NETWORK = "XLayer";

export interface XStocksStablecoin {
  symbol: string;
  network: string;
  address: string;
  decimals: number;
  issuance: boolean;
  redemption: boolean;
  supportsAtomicSwaps: boolean;
}

export interface XStocksDeployment {
  address: string;
  network: string;
  /// Current ERC-4626 wrapper. The API exposes only the v2 (current) wrapper; there is no
  /// field enumerating legacy v1 wrappers, so "is this current" rests on this field plus an
  /// on-chain asset() check rather than on a legacy blocklist.
  wrapperAddressV2?: string;
  supportsAtomicSwaps: boolean;
  stablecoins?: XStocksStablecoin[];
}

export interface XStocksTrading {
  currency: string;
  /// "TwentyFourFive" for the 24/5 names, or a standard-hours mode.
  tradingHoursMode: string;
  isTradingHalted: boolean;
  /// "market" | "extended" | "overnight" | "closed"
  currentPeriod: string;
  openNow: boolean;
  nextChangeAt: string;
  exchange: {mic: string; abbreviation: string; name: string; timezone: string};
}

export interface XStocksAsset {
  id: string;
  name: string;
  symbol: string;
  isin: string;
  underlyingSymbol: string;
  underlyingIsin: string;
  description: string;
  logo: string;
  isTradingHalted: boolean;
  trading: XStocksTrading | null;
  deployments: XStocksDeployment[];
}

export interface XStocksMultiplier {
  currentMultiplier: number;
  /// The pending multiplier. Named `newMultiplier` by the API, not `pendingMultiplier`.
  newMultiplier: number;
  /// Unix seconds, or 0 when no corporate action is pending.
  activationDateTime: number;
  reason: string | null;
}

interface AssetsPage {
  nodes: XStocksAsset[];
  page: {currentPage: number; hasNextPage: boolean};
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {headers: {accept: "application/json"}});
  if (!res.ok) {
    throw new Error(`xStocks API ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/// Fetch the complete catalogue, following pagination to the end.
export async function fetchAllAssets(maxPages = 50): Promise<XStocksAsset[]> {
  const all: XStocksAsset[] = [];
  for (let page = 0; page < maxPages; page++) {
    const data = await getJson<AssetsPage>(`${XSTOCKS_API_BASE}/public/assets?page=${page}`);
    all.push(...data.nodes);
    if (!data.page.hasNextPage) return all;
  }
  throw new Error(`xStocks pagination exceeded ${maxPages} pages; refusing a partial catalogue`);
}

export async function fetchMultiplier(
  symbol: string,
  network = XSTOCKS_XLAYER_NETWORK,
): Promise<XStocksMultiplier> {
  return getJson<XStocksMultiplier>(
    `${XSTOCKS_API_BASE}/public/assets/${encodeURIComponent(symbol)}/multiplier?network=${network}`,
  );
}

export function xLayerDeployment(asset: XStocksAsset): XStocksDeployment | undefined {
  return asset.deployments.find((d) => d.network === XSTOCKS_XLAYER_NETWORK);
}
