import type {Address} from "viem";

/// Client-side view of the deployment. These are NEXT_PUBLIC because the browser needs them
/// to build transactions; they are public addresses, not secrets.
///
/// Bespeak runs two generations of contracts at once, on purpose.
///
/// v1.1 added the sell side, and a manager's vault factory is immutably bound to it, so the
/// sell side could not be an upgrade in place. New orders go to v1.1. v1 keeps running and
/// keeps its own vaults and its own order history, which is where every fill from September
/// lives. Dropping it would have deleted the product's evidence from its own interface.
///
/// The two cannot share an ABI: v1.1's Order struct carries two fields v1 does not return,
/// so a v1 order decoded against the v1.1 ABI fails. Each generation is read with its own.
export interface ClientDeployment {
  orderManager: Address;
  vaultFactory: Address;
  assetRegistry: Address;
}

/// Where new orders are written. Falls back to v1 if v1.1 is not configured, so a partial
/// environment degrades to "buys only" rather than to a dead compose button.
export function clientDeployment(): ClientDeployment | null {
  const om = process.env.NEXT_PUBLIC_ORDER_MANAGER_V11 ?? process.env.NEXT_PUBLIC_ORDER_MANAGER;
  const vf = process.env.NEXT_PUBLIC_VAULT_FACTORY_V11 ?? process.env.NEXT_PUBLIC_VAULT_FACTORY;
  const ar = process.env.NEXT_PUBLIC_ASSET_REGISTRY;
  if (!om || !vf || !ar) return null;
  return {orderManager: om as Address, vaultFactory: vf as Address, assetRegistry: ar as Address};
}

/// True when the write target actually supports selling. If v1.1 is not configured the UI
/// must not offer a sell it cannot build.
export function sellSupported(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_ORDER_MANAGER_V11);
}

/// The previous generation, read-only. Null when there is nothing earlier to read.
export function legacyDeployment(): ClientDeployment | null {
  if (!process.env.NEXT_PUBLIC_ORDER_MANAGER_V11) return null;
  const om = process.env.NEXT_PUBLIC_ORDER_MANAGER;
  const vf = process.env.NEXT_PUBLIC_VAULT_FACTORY;
  const ar = process.env.NEXT_PUBLIC_ASSET_REGISTRY;
  if (!om || !vf || !ar) return null;
  return {orderManager: om as Address, vaultFactory: vf as Address, assetRegistry: ar as Address};
}
