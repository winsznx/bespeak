import type {Address} from "viem";

/// Client-side view of the deployment. These are NEXT_PUBLIC because the browser needs them
/// to build transactions; they are public addresses, not secrets.
export interface ClientDeployment {
  orderManager: Address;
  vaultFactory: Address;
  assetRegistry: Address;
}

export function clientDeployment(): ClientDeployment | null {
  const om = process.env.NEXT_PUBLIC_ORDER_MANAGER;
  const vf = process.env.NEXT_PUBLIC_VAULT_FACTORY;
  const ar = process.env.NEXT_PUBLIC_ASSET_REGISTRY;
  if (!om || !vf || !ar) return null;
  return {orderManager: om as Address, vaultFactory: vf as Address, assetRegistry: ar as Address};
}
