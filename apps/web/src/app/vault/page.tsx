import {VaultClient} from "@/components/VaultClient";
import {REGISTRY} from "@/lib/server";

export default function VaultPage() {
  return (
    <section style={{paddingTop: 48, paddingBottom: 24}}>
      <h1 className="mb-8">Vault</h1>
      <p className="lede mb-32">
        Your own vault contract, not a shared pool. Only you can withdraw from it, and only
        an order you created can spend from it — up to what that order reserved, and no
        further.
      </p>
      <VaultClient stables={Object.values(REGISTRY.stables)} />
    </section>
  );
}
