/// Asset identity resolution.
///
/// Every supported asset must ship a real logo. There is deliberately no letter-badge
/// fallback in the production path: if one of the shipped assets cannot resolve, the sync
/// fails loudly so it can be investigated and pinned rather than quietly degrading into a
/// coloured square with a ticker in it.
///
/// Source priority, highest first:
///   1. ISSUER  — the xStocks metadata CDN, published by the asset issuer itself and
///                already carried on every catalogue entry as `logo`.
///   2. CONTRACT — CoinGecko onchain metadata (GeckoTerminal) looked up by the EXACT
///                X Layer contract address, never by ticker. Ticker lookup is unsafe here:
///                TSLA, TSLAx and any number of impostor tokens share a symbol.
///   3. CHAIN_LIST — ethereum-lists/chains, for network identity.
///   4. PINNED  — a manually verified source, recorded with its URL and the reason.

export type IconSourceKind = "ISSUER" | "CONTRACT" | "CHAIN_LIST" | "PINNED";

export interface IconProvenance {
  /// Where the image was fetched from.
  sourceUrl: string;
  /// Which rung of the priority ladder it came from.
  sourceKind: IconSourceKind;
  /// Why, when the source is PINNED.
  note?: string;
  retrievedAt: string;
  /// sha256 of the downloaded bytes, so a silent upstream swap is detectable.
  checksum: string;
  bytes: number;
  /// Path the app serves it from.
  localPath: string;
}

export const GECKOTERMINAL_NETWORK = "x-layer";

/// Contract-addressed identity for the tokens Bespeak transacts in, plus the network.
/// Addresses are the same ones the registry verified on chain.
export const TOKEN_IDENTITIES = {
  USDC: {
    kind: "token" as const,
    address: "0xb6ceceab302e2e4948951ee7843fc24e92933061",
    symbol: "USDC",
    name: "USDC",
    slug: "usdc",
  },
  USDG: {
    kind: "token" as const,
    address: "0x4ae46a509f6b1d9056937ba4500cb143933d2dc8",
    symbol: "USDG",
    name: "Global Dollar",
    slug: "usdg",
  },
} as const;

/// Native gas token and chain identity. OKB has no X Layer contract to look up, so it is
/// resolved from CoinGecko's canonical coin entry; the chain mark comes from the community
/// chain registry that also supplies chain 196's metadata.
export const NETWORK_IDENTITIES = {
  OKB: {
    kind: "native" as const,
    slug: "okb",
    symbol: "OKB",
    name: "OKB",
    sourceUrl: "https://api.coingecko.com/api/v3/coins/okb",
    sourceKind: "CONTRACT" as IconSourceKind,
  },
  XLAYER: {
    kind: "network" as const,
    slug: "x-layer",
    symbol: "X Layer",
    name: "X Layer",
    /// ethereum-lists/chains eip155-196 -> icon "xlayer" -> ipfs CID, served through a
    /// gateway that actually responds. Pinned locally so the product never depends on IPFS.
    sourceUrl:
      "https://gateway.pinata.cloud/ipfs/QmSLkiAAr6VtJ6jEqEzz3QdZtVEHzR6Az7E4XD8qXwjuio",
    sourceKind: "CHAIN_LIST" as IconSourceKind,
  },
} as const;

/// GeckoTerminal token info endpoint for an exact contract on X Layer.
export function contractInfoUrl(address: string): string {
  return `https://api.geckoterminal.com/api/v2/networks/${GECKOTERMINAL_NETWORK}/tokens/${address.toLowerCase()}/info`;
}

export interface IconManifest {
  generatedAt: string;
  /// Keyed by asset symbol (NVDAx) or token/network slug (usdc, okb, x-layer).
  icons: Record<string, IconProvenance>;
}
