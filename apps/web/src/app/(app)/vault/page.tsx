import {VaultClient} from "@/components/VaultClient";
import {REGISTRY} from "@/lib/server";

import type {Metadata} from "next";

export const metadata: Metadata = {
  title: "Vault",
  robots: {index: false, follow: false},
};

export default function VaultPage() {
  return <VaultClient stables={Object.values(REGISTRY.stables)} />;
}
