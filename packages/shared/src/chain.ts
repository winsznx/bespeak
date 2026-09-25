import {defineChain} from "viem";

/// X Layer mainnet. Verified live on 2026-09-22: both RPCs below returned
/// eth_chainId 0xc4 (196) and a current head block.
export const X_LAYER_CHAIN_ID = 196 as const;

export const xLayer = defineChain({
  id: X_LAYER_CHAIN_ID,
  name: "X Layer",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {default: {http: ["https://rpc.xlayer.tech"]}},
  blockExplorers: {default: {name: "OKLink", url: "https://www.oklink.com/xlayer"}},
  // Multicall3 at its canonical cross-chain address, verified on chain here rather than
  // assumed from the address being standard. Declaring it is what lets viem batch reads
  // into one request; without it every read is its own round trip, which is both slow for
  // a page and, for a scheduled worker with a subrequest budget, fatal mid-tick.
  contracts: {
    multicall3: {address: "0xcA11bde05977b3631167028862bE2a173976CA11"},
  },
});

/// The two RPCs are assigned distinct roles on purpose: the keeper broadcasts through one,
/// the verifier reads through the other. A receipt that was confirmed only by the node that
/// submitted the transaction is not independent evidence (PRD 36).
export const DEFAULT_WRITE_RPC = "https://rpc.xlayer.tech";
export const DEFAULT_VERIFY_RPC = "https://xlayerrpc.okx.com";

export function explorerTx(hash: string): string {
  return `https://www.oklink.com/xlayer/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `https://www.oklink.com/xlayer/address/${address}`;
}
