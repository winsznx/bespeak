import {http, createConfig, injected} from "@wagmi/core";
import {xLayer} from "@bespeak/shared";

/// X Layer only. Bespeak's contracts, vaults and settlement all live on 196, so offering
/// another chain in the connector would just produce a wrong-network dead end.
///
/// `injected` is imported from @wagmi/core rather than the wagmi/connectors barrel: that
/// barrel pulls in the Coinbase and Base account SDKs, whose optional peer modules do not
/// resolve under webpack and fail the build. We only ever offer an injected wallet, so the
/// rest of the barrel is weight we do not want anyway.
export const wagmiConfig = createConfig({
  chains: [xLayer],
  connectors: [injected()],
  transports: {
    [xLayer.id]: http(process.env.NEXT_PUBLIC_XLAYER_RPC ?? "https://rpc.xlayer.tech"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
