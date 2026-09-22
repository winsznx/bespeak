import {encodeAbiParameters, type Address, type Hex, type WalletClient, type Account} from "viem";
import {X_LAYER_CHAIN_ID} from "@bespeak/shared";
import type {SessionObservation} from "./session.js";

/// EIP-712 domain of the on-chain AttestedSessionVerifier. Must match the contract's
/// EIP712("Bespeak.AttestedSession", "1") exactly or the recovered signer will be wrong.
export function attestationDomain(verifier: Address) {
  return {
    name: "Bespeak.AttestedSession",
    version: "1",
    chainId: X_LAYER_CHAIN_ID,
    verifyingContract: verifier,
  } as const;
}

export const ATTESTATION_TYPES = {
  SessionAttestation: [
    {name: "assetId", type: "bytes32"},
    {name: "marketStatus", type: "uint8"},
    {name: "observedAt", type: "uint64"},
    {name: "sourceId", type: "bytes32"},
    {name: "payloadHash", type: "bytes32"},
  ],
} as const;

/// Sign an observation and encode it in the shape the contract decodes.
///
/// Signing the claim, rather than letting the transaction imply it, is what makes the
/// observation auditable: the signature binds a specific key to a specific market state at
/// a specific timestamp, and survives in the receipt for anyone to check later.
export async function signObservation(
  wallet: WalletClient,
  account: Account,
  verifier: Address,
  assetId: Hex,
  obs: SessionObservation,
): Promise<Hex> {
  const signature = await wallet.signTypedData({
    account,
    domain: attestationDomain(verifier),
    types: ATTESTATION_TYPES,
    primaryType: "SessionAttestation",
    message: {
      assetId,
      marketStatus: obs.marketStatus,
      observedAt: BigInt(obs.observedAt),
      sourceId: obs.sourceId,
      payloadHash: obs.payloadHash,
    },
  });

  return encodeEvidence(obs, signature);
}

/// abi.encode(uint8 marketStatus, uint64 observedAt, bytes32 payloadHash, bytes signature)
export function encodeEvidence(obs: SessionObservation, signature: Hex): Hex {
  return encodeAbiParameters(
    [{type: "uint8"}, {type: "uint64"}, {type: "bytes32"}, {type: "bytes"}],
    [obs.marketStatus, BigInt(obs.observedAt), obs.payloadHash, signature],
  );
}
