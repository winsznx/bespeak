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

/// In-process cache for the catalogue.
///
/// The catalogue is 1026 assets across 11 pages. Every page that needs market session
/// state would otherwise re-fetch all of it, which costs seconds per render and makes the
/// app look broken behind a skeleton. Session state changes on the order of minutes, so a
/// short TTL is honest here — and `sourceFetchedAt` on the manifest still records when the
/// pinned registry data was actually read.
let catalogueCache: {at: number; assets: XStocksAsset[]} | null = null;
let catalogueInFlight: Promise<XStocksAsset[]> | null = null;

const CATALOGUE_TTL_MS = Number(process.env.XSTOCKS_CATALOGUE_TTL_MS ?? 20_000);

async function fetchPage(page: number): Promise<AssetsPage> {
  return getJson<AssetsPage>(`${XSTOCKS_API_BASE}/public/assets?page=${page}`);
}

/// Fetch the complete catalogue.
///
/// Page 0 is fetched first to learn whether more exist, then the remainder are requested in
/// parallel batches rather than one at a time. Sequential paging over 11 pages was the
/// single slowest thing in the app.
export async function fetchAllAssets(maxPages = 40): Promise<XStocksAsset[]> {
  const now = Date.now();
  if (catalogueCache && now - catalogueCache.at < CATALOGUE_TTL_MS) {
    return catalogueCache.assets;
  }
  // Collapse concurrent callers onto one network fetch.
  if (catalogueInFlight) return catalogueInFlight;

  catalogueInFlight = (async () => {
    const first = await fetchPage(0);
    const all: XStocksAsset[] = [...first.nodes];

    if (first.page.hasNextPage) {
      const BATCH = 6;
      let page = 1;
      let more = true;
      while (more && page < maxPages) {
        const pages = Array.from({length: BATCH}, (_, i) => page + i).filter((p) => p < maxPages);
        const results = await Promise.all(pages.map(fetchPage));
        for (const r of results) all.push(...r.nodes);
        more = results[results.length - 1]?.page.hasNextPage ?? false;
        page += BATCH;
      }
    }

    catalogueCache = {at: Date.now(), assets: all};
    return all;
  })();

  try {
    return await catalogueInFlight;
  } finally {
    catalogueInFlight = null;
  }
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
