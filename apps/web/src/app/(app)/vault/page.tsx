import {VaultClient} from "@/components/VaultClient";
import {REGISTRY} from "@/lib/server";

import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Vault",
  robots: {index: false, follow: false},
};

export default function VaultPage() {
  // Assets are deposited to fund a sell. Only those with a verified wrapper and an
  // executable route can be sold, so only those are offered.
  const assets = REGISTRY.assets
    .filter((a) => a.route && a.wrapperDecimals !== null)
    .map((a) => ({
      address: a.route!.targetToken as `0x${string}`,
      symbol: a.symbol,
      name: a.name,
      decimals: a.wrapperDecimals!,
    }));

  return <VaultClient stables={Object.values(REGISTRY.stables)} assets={assets} />;
}
