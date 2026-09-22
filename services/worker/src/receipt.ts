import {keccak256, toHex, type Address, type Hash} from "viem";
import type {VerificationResult} from "./verifier.js";
import type {SessionObservation} from "@bespeak/conditions";

/// The canonical machine-readable receipt (PRD 35.1).
///
/// Consumer UI shows a handful of these fields. The rest exist so that an outsider holding
/// only this document and a public RPC can re-derive the outcome without trusting us.
export interface BespeakReceipt {
  receiptVersion: "1.0";
  receiptId: string;

  orderId: Hash;
  occurrenceIndex: number;
  recurringId: Hash | null;
  owner: Address;
  vault: Address;
  receiver: Address;

  assetId: Hash;
  assetSymbol: string;
  assetRegistryRevisionAtCreation: Hash;
  assetRegistryRevisionAtExecution: Hash;
  underlyingAddress: Address;
  wrapperAddress: Address | null;
  wrapperVersion: number;
  /// Which instrument the user actually received. Never hidden (PRD 19).
  deliveredInstrument: "underlying" | "wrapped";
  inputToken: Address;
  inputTokenSymbol: string;

  triggerType: string;
  conditionIntent: string;
  conditionSource: string;
  conditionSourceTier: string;
  conditionSourceVersion: string;
  conditionObservationTimestamp: string | null;
  conditionObservationHash: Hash | null;
  conditionSourcePayloadHash: Hash | null;
  marketStatus: string;
  corporateActionState: string;

  amountReserved: string;
  actualInputSpent: string;
  unusedInputReleased: string;
  actualOutputReceived: string;
  minimumOutput: string;

  quoteSource: string;
  quoteTimestamp: string | null;
  quoteHash: Hash | null;
  routeSummary: string;
  routerAddress: Address | null;
  approvalTarget: Address | null;
  executionPrice: string | null;
  observedDifferenceBps: number | null;

  executionRequestedAt: string;
  transactionSubmittedAt: string;
  transactionHash: Hash;
  blockNumber: string | null;
  blockHash: Hash | null;

  verificationSource: string;
  broadcastSource: string;
  firstVerificationAt: string;
  finalVerificationAt: string;
  verificationPolicy: string;
  confirmations: number;
  verificationChecks: VerificationResult["checks"];
  finalOutcomeStatus: VerificationResult["status"];

  limitations: string[];
}

/// Content hash over the receipt with its own id and hash fields excluded, so a receipt can
/// be addressed by its content and any edit is detectable (PRD 35.4 / 36.3).
export function hashReceipt(receipt: Omit<BespeakReceipt, "receiptId">): Hash {
  const canonical = JSON.stringify(receipt, Object.keys(receipt).sort());
  return keccak256(toHex(canonical));
}

export function finalizeReceipt(draft: Omit<BespeakReceipt, "receiptId">): BespeakReceipt {
  return {...draft, receiptId: hashReceipt(draft)};
}

/// Limitations that must travel with a receipt produced under the attested tier. The claim
/// discipline rule is that a limitation appears beside the claim, not in a footnote
/// somewhere else (PRD 80).
export function attestedTierLimitations(obs: SessionObservation | null): string[] {
  const out = [
    "Market session was established from the xStocks issuer's published trading state and " +
      "signed by the Bespeak operator. It is operator-attested, not oracle-verified. " +
      "The signature proves which key asserted this state and when; it does not prove the " +
      "state itself was correct.",
  ];
  if (obs) {
    out.push(
      `Session was read as "${obs.raw.currentPeriod}" for ${obs.assetSymbol} at ` +
        `${new Date(obs.observedAt * 1000).toISOString()} and is claimed only for that observation.`,
    );
  }
  return out;
}
