"use client";

import {getDefaultConfig} from "@rainbow-me/rainbowkit";
import {http} from "wagmi";
import {createStorage, cookieStorage} from "wagmi";
import {defineChain} from "viem";
import {DEFAULT_WRITE_RPC} from "@bespeak/shared";

/// X Layer mainnet, defined locally because wagmi does not ship chain 196 with the
/// metadata we need. The RPC is the same proven endpoint the rest of Bespeak uses — we do
/// not silently fall back to an unverified public node.
///
/// `iconUrl` and `iconBackground` live on the chain object: RainbowKit merges them with its
/// own built-in icon table, and since 196 is not in that table ours is used directly. This
/// is the same X Layer mark the app serves everywhere else.
export const xLayer = defineChain({
  id: 196,
  name: "X Layer",
  nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
  rpcUrls: {
    default: {http: [process.env.NEXT_PUBLIC_XLAYER_RPC ?? DEFAULT_WRITE_RPC]},
  },
  blockExplorers: {
    default: {name: "OKLink", url: "https://www.oklink.com/xlayer"},
  },
  iconUrl: "/chains/xlayer.png",
  iconBackground: "#14171a",
});

/// WalletConnect project id.
///
/// `YOUR_PROJECT_ID` is not a placeholder we invented: RainbowKit special-cases that exact
/// literal and substitutes its own public demo id. An empty string instead throws
/// synchronously inside getDefaultConfig — and because metaMaskWallet routes through the
/// WalletConnect factory during SSR (window is undefined on the server), that throw takes
/// down the whole app, injected wallets included.
///
/// So: with a real id, every connector works. Without one, injected and MetaMask work
/// normally and only the QR/mobile relay falls back to a shared demo id.
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "YOUR_PROJECT_ID";

export const wagmiConfig = getDefaultConfig({
  appName: "Bespeak",
  appDescription: "Condition-aware standing orders for tokenized equities on X Layer.",
  appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://bespeak.app",
  appIcon: "/icon.svg",
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: [xLayer],
  transports: {
    [xLayer.id]: http(process.env.NEXT_PUBLIC_XLAYER_RPC ?? DEFAULT_WRITE_RPC),
  },
  // Cookie storage so the server can hand the client a matching initial state and the
  // connect button does not flash between states on hydration.
  storage: createStorage({storage: cookieStorage}),
  ssr: true,
});

/// True only when a real project id is configured. Used to tell the user honestly that
/// mobile QR connection is limited rather than letting it fail mysteriously.
export const hasWalletConnectProjectId = WALLETCONNECT_PROJECT_ID !== "YOUR_PROJECT_ID";

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
