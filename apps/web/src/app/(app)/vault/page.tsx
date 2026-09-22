import {VaultClient} from "@/components/VaultClient";
import {REGISTRY} from "@/lib/server";

export default function VaultPage() {
  return <VaultClient stables={Object.values(REGISTRY.stables)} />;
}
