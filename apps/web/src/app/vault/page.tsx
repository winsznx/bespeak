import {VaultClient} from "@/components/VaultClient";
import {REGISTRY} from "@/lib/server";

export default function VaultPage() {
  return (
    <section className="section">
      <h1>Your vault</h1>
      <p className="lede">
        Your own vault contract, not a shared pool. Only you can withdraw from it, and only
        an order you created can spend from it — up to the amount that order reserved and no
        further.
      </p>
      <VaultClient stables={Object.values(REGISTRY.stables)} />
    </section>
  );
}
