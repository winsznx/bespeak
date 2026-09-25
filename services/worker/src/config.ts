import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {xLayer, DEFAULT_WRITE_RPC, DEFAULT_VERIFY_RPC} from "@bespeak/shared";
import {deploymentFromEnv} from "@bespeak/sdk";

export function writeRpc(): string {
  return process.env.XLAYER_RPC_URL ?? DEFAULT_WRITE_RPC;
}

export function verifyRpc(): string {
  return process.env.XLAYER_VERIFY_RPC_URL ?? DEFAULT_VERIFY_RPC;
}

/// The verifier must not read through the node that broadcast the transaction. A receipt
/// confirmed only by its own broadcaster is not independent evidence, so this is enforced
/// in code rather than left to whoever edits the env file (PRD 36).
export function assertIndependentReadPath(): void {
  if (writeRpc() === verifyRpc()) {
    throw new Error(
      "XLAYER_VERIFY_RPC_URL must differ from XLAYER_RPC_URL: " +
        "independent verification cannot run through the broadcasting node.",
    );
  }
}

export function publicWriteClient(): PublicClient {
  return createPublicClient({chain: xLayer, transport: http(writeRpc())});
}

/// Read-only client on the independent path. Used exclusively by the verifier.
export function publicVerifyClient(): PublicClient {
  assertIndependentReadPath();
  return createPublicClient({chain: xLayer, transport: http(verifyRpc())});
}

export function keeperAccount() {
  const pk = process.env.KEEPER_PRIVATE_KEY;
  if (!pk) throw new Error("KEEPER_PRIVATE_KEY is not set");
  return privateKeyToAccount(pk as `0x${string}`);
}

export function keeperWallet(): WalletClient {
  return createWalletClient({
    account: keeperAccount(),
    chain: xLayer,
    transport: http(writeRpc()),
  });
}

export function deployment() {
  return deploymentFromEnv();
}

/// The three credentials the OnchainOS dev portal issues, plus an optional project id.
///
/// The portal's own setup instructions name three variables: key, secret and passphrase.
/// An earlier build found that OK-ACCESS-PROJECT was required in practice, so it is still
/// sent when configured — but it is no longer required to start, because refusing to run
/// over a header the issuing portal does not mention would block a correctly provisioned
/// key. If the API does want it, the request fails with OKX's own error rather than ours,
/// which is the more useful message.
export function okxCredentials() {
  const creds = {
    apiKey: process.env.OKX_API_KEY ?? "",
    apiSecret: process.env.OKX_API_SECRET ?? "",
    passphrase: process.env.OKX_API_PASSPHRASE ?? "",
    projectId: process.env.OKX_PROJECT_ID ?? "",
  };
  const required = ["apiKey", "apiSecret", "passphrase"] as const;
  const missing = required.filter((k) => !creds[k]);
  if (missing.length) {
    throw new Error(
      `OKX credentials missing: ${missing.join(", ")}. ` +
        "Create them at https://web3.okx.com/onchainos/dev-portal",
    );
  }
  return creds;
}

/// Execution policy defaults (PRD 13.1). Configurable, and pinned in the deployment record
/// so a receipt can state the policy it executed under.
export const POLICY = {
  maxSlippageBps: Number(process.env.BESPEAK_MAX_SLIPPAGE_BPS ?? 75),
  maxReferenceDeviationBps: Number(process.env.BESPEAK_MAX_REF_DEVIATION_BPS ?? 100),
  quoteFreshnessSeconds: Number(process.env.BESPEAK_QUOTE_FRESHNESS ?? 30),
  conditionFreshnessSeconds: Number(process.env.BESPEAK_CONDITION_FRESHNESS ?? 60),
  executionWindowSeconds: Number(process.env.BESPEAK_EXECUTION_WINDOW ?? 30 * 60),
  /// The keeper stops attempting value-moving transactions below this native balance, so it
  /// can never strand a half-finished execution (PRD 29.1).
  keeperLowBalanceWei: BigInt(
    Math.floor(Number(process.env.KEEPER_LOW_BALANCE_OKB ?? 0.05) * 1e18),
  ),
  /// Blocks to wait before treating a delivery observation as settled.
  confirmations: Number(process.env.BESPEAK_CONFIRMATIONS ?? 3),
  verificationTimeoutMs: Number(process.env.BESPEAK_VERIFY_TIMEOUT_MS ?? 120_000),
} as const;

export interface AssetAddresses {
  underlying: Address;
  wrapper: Address | null;
}
