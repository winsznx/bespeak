import type {Address} from "viem";

export interface BespeakDeployment {
  chainId: number;
  assetRegistry: Address;
  routerRegistry: Address;
  orderManager: Address;
  vaultFactory: Address;
  executionAdapter: Address;
  conditionVerifier: Address;
}

/// Read the deployment from the environment. Addresses are never hardcoded in source: a
/// wrong address baked into a build is indistinguishable from a right one until funds move.
export function deploymentFromEnv(env: NodeJS.ProcessEnv = process.env): BespeakDeployment {
  const need = (k: string): Address => {
    const v = env[k];
    if (!v) throw new Error(`missing ${k}; run the deploy script or source .env`);
    return v as Address;
  };
  return {
    chainId: Number(env.XLAYER_CHAIN_ID ?? 196),
    assetRegistry: need("BESPEAK_ASSET_REGISTRY"),
    routerRegistry: need("BESPEAK_ROUTER_REGISTRY"),
    orderManager: need("BESPEAK_ORDER_MANAGER"),
    vaultFactory: need("BESPEAK_VAULT_FACTORY"),
    executionAdapter: need("BESPEAK_EXECUTION_ADAPTER"),
    conditionVerifier: need("BESPEAK_CONDITION_VERIFIER"),
  };
}
