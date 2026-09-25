import {parseEventLogs, type Address, type Hash, type PublicClient} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultAbi} from "@bespeak/sdk";
import {OrderStatus, reasonFromCode} from "@bespeak/shared";
import {publicVerifyClient, deployment, POLICY, verifyRpc, writeRpc} from "./config.js";

/// Closed-loop outcome states (PRD 16.3 / 35.2). VERIFIED_FILLED is the only one that may
/// be presented to a user as a completed purchase.
export type OutcomeStatus =
  | "VERIFIED_FILLED"
  | "PARTIALLY_VERIFIED"
  | "OUTCOME_UNKNOWN"
  | "VERIFICATION_TIMEOUT"
  | "CONTRADICTED"
  | "ROLLED_BACK";

export interface VerificationCheck {
  name: string;
  passed: boolean;
  expected: string;
  observed: string;
}

export interface VerificationResult {
  status: OutcomeStatus;
  orderId: Hash;
  transactionHash: Hash;
  blockNumber: string | null;
  blockHash: Hash | null;
  checks: VerificationCheck[];
  /// What the chain says moved, taken from the contract's own OrderExecuted event rather
  /// than from the keeper's account of what it did. Null when no such event was found, so
  /// a receipt can never quietly report zero for an execution nobody confirmed.
  amounts: {
    actualInputSpent: string;
    actualOutputReceived: string;
    unusedInputReleased: string;
  } | null;
  /// The RPC this verification read through, recorded so the independence of the read path
  /// is part of the evidence rather than a claim about it.
  verificationSource: string;
  broadcastSource: string;
  firstVerificationAt: string;
  finalVerificationAt: string;
  confirmations: number;
  notes: string[];
}

const ERC20_BALANCE_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{type: "address"}],
    outputs: [{type: "uint256"}],
  },
] as const;

export interface ExpectedOutcome {
  orderId: Hash;
  transactionHash: Hash;
  owner: Address;
  vault: Address;
  receiver: Address;
  inputToken: Address;
  outputToken: Address;
  amountReserved: bigint;
  minAmountOut: bigint;
  /// Balances captured before the execution transaction was submitted.
  receiverOutputBefore: bigint;
  vaultInputBefore: bigint;
  executionCountBefore: number;
}

function check(name: string, passed: boolean, expected: unknown, observed: unknown): VerificationCheck {
  return {name, passed, expected: String(expected), observed: String(observed)};
}

/// Independently reconstruct what actually happened on X Layer and decide whether the
/// receipt may claim success.
///
/// The rule this function exists to enforce: the component that broadcast the transaction
/// does not get to declare the outcome. Everything below is read through a different RPC
/// than the keeper used, at a block the chain has actually confirmed, and a claim that
/// cannot be supported becomes OUTCOME_UNKNOWN rather than a quiet success.
export async function verifyExecution(expected: ExpectedOutcome): Promise<VerificationResult> {
  const client = publicVerifyClient();
  const d = deployment();
  const firstAt = new Date().toISOString();
  const checks: VerificationCheck[] = [];
  let verifiedAmounts: VerificationResult["amounts"] = null;
  const notes: string[] = [];

  const receipt = await waitForReceipt(client, expected.transactionHash);
  if (!receipt) {
    return {
      status: "VERIFICATION_TIMEOUT",
      orderId: expected.orderId,
      transactionHash: expected.transactionHash,
      blockNumber: null,
      blockHash: null,
      amounts: null,
      checks: [check("transaction included", false, "receipt present", "not found in window")],
      verificationSource: verifyRpc(),
      broadcastSource: writeRpc(),
      firstVerificationAt: firstAt,
      finalVerificationAt: new Date().toISOString(),
      confirmations: 0,
      notes: ["The independent read path never observed this transaction."],
    };
  }

  checks.push(check("transaction status", receipt.status === "success", "success", receipt.status));

  // Reorg guard: re-read the block by number and confirm it still carries the same hash.
  const head = await client.getBlockNumber();
  const confirmations = Number(head - receipt.blockNumber);
  const canonical = await client.getBlock({blockNumber: receipt.blockNumber});
  if (canonical.hash !== receipt.blockHash) {
    return {
      status: "ROLLED_BACK",
      orderId: expected.orderId,
      transactionHash: expected.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      amounts: null,
      checks: [
        ...checks,
        check("block still canonical", false, receipt.blockHash, canonical.hash),
      ],
      verificationSource: verifyRpc(),
      broadcastSource: writeRpc(),
      firstVerificationAt: firstAt,
      finalVerificationAt: new Date().toISOString(),
      confirmations,
      notes: ["The block containing this execution is no longer canonical."],
    };
  }

  // Authoritative order state, read from the contract rather than from any local record.
  const order = await client.readContract({
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "getOrder",
    args: [expected.orderId],
  }) as {status: number; receiver: Address; amountIn: bigint; assetId: Hash};

  checks.push(
    check("order terminal state", order.status === OrderStatus.FILLED, "FILLED", statusName(order.status)),
  );
  checks.push(
    check(
      "receiver unchanged from intent",
      order.receiver.toLowerCase() === expected.receiver.toLowerCase(),
      expected.receiver,
      order.receiver,
    ),
  );

  const executionCount = await client.readContract({
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "executionCount",
    args: [expected.orderId],
  }) as number;

  checks.push(
    check(
      "executed exactly once",
      Number(executionCount) === expected.executionCountBefore + 1,
      expected.executionCountBefore + 1,
      executionCount,
    ),
  );

  // The event the contract emitted, parsed from the receipt rather than from the keeper's
  // own account of what it did.
  const logs = parseEventLogs({
    abi: BespeakOrderManagerAbi,
    logs: receipt.logs,
    eventName: "OrderExecuted",
  });
  const executed = logs.find((l) => (l.args as {orderId: Hash}).orderId === expected.orderId);

  if (!executed) {
    checks.push(check("OrderExecuted event present", false, "one matching event", "none"));
    return finish("OUTCOME_UNKNOWN", [
      "The transaction was included but carried no OrderExecuted event for this order.",
    ]);
  }

  const a = executed.args as unknown as {
    actualInputSpent: bigint;
    actualOutputReceived: bigint;
    unusedInputReleased: bigint;
    outputToken: Address;
    receiver: Address;
  };

  verifiedAmounts = {
    actualInputSpent: a.actualInputSpent.toString(),
    actualOutputReceived: a.actualOutputReceived.toString(),
    unusedInputReleased: a.unusedInputReleased.toString(),
  };

  checks.push(
    check(
      "output asset is the registered asset",
      a.outputToken.toLowerCase() === expected.outputToken.toLowerCase(),
      expected.outputToken,
      a.outputToken,
    ),
  );
  checks.push(check("input actually spent", a.actualInputSpent > 0n, "> 0", a.actualInputSpent));
  checks.push(
    check(
      "spend within reservation",
      a.actualInputSpent <= expected.amountReserved,
      `<= ${expected.amountReserved}`,
      a.actualInputSpent,
    ),
  );
  checks.push(
    check(
      "output meets the user's minimum",
      a.actualOutputReceived >= expected.minAmountOut,
      `>= ${expected.minAmountOut}`,
      a.actualOutputReceived,
    ),
  );

  // The decisive check: did the user's own balance actually change, measured now, on a
  // different node, against the balance recorded before submission.
  const [receiverNow, vaultInputNow] = await Promise.all([
    client.readContract({
      address: expected.outputToken,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [expected.receiver],
    }) as Promise<bigint>,
    client.readContract({
      address: expected.inputToken,
      abi: ERC20_BALANCE_ABI,
      functionName: "balanceOf",
      args: [expected.vault],
    }) as Promise<bigint>,
  ]);

  const receiverDelta = receiverNow - expected.receiverOutputBefore;
  const vaultDelta = expected.vaultInputBefore - vaultInputNow;

  checks.push(
    check(
      "receiver balance increased by the reported output",
      receiverDelta >= a.actualOutputReceived,
      `>= ${a.actualOutputReceived}`,
      receiverDelta,
    ),
  );
  checks.push(
    check(
      "vault input decreased by exactly the reported spend",
      vaultDelta === a.actualInputSpent,
      a.actualInputSpent,
      vaultDelta,
    ),
  );

  // Unused capital must be available again, not merely returned to the vault's balance.
  const reservation = await client.readContract({
    address: expected.vault,
    abi: BespeakVaultAbi,
    functionName: "reservationOf",
    args: [expected.orderId],
  }) as [Address, bigint, boolean];

  checks.push(
    check("reservation fully settled", reservation[2] === false && reservation[1] === 0n, "closed, 0 remaining", `active=${reservation[2]} remaining=${reservation[1]}`),
  );

  if (confirmations < POLICY.confirmations) {
    notes.push(
      `Only ${confirmations} confirmations; the configured policy is ${POLICY.confirmations}.`,
    );
  }

  const failed = checks.filter((c) => !c.passed);
  if (failed.length === 0) {
    if (confirmations < POLICY.confirmations) {
      return finish("PARTIALLY_VERIFIED", notes);
    }
    return finish("VERIFIED_FILLED", notes);
  }

  // A disagreement between the contract's own account and independently observed state is
  // a contradiction, not an unknown.
  const contradicted = failed.some((c) =>
    c.name.startsWith("receiver balance") ||
    c.name.startsWith("vault input") ||
    c.name.startsWith("output asset") ||
    c.name.startsWith("executed exactly once"),
  );
  return finish(contradicted ? "CONTRADICTED" : "OUTCOME_UNKNOWN", [
    ...notes,
    ...failed.map((c) => `${c.name}: expected ${c.expected}, observed ${c.observed}`),
  ]);

  function finish(status: OutcomeStatus, extraNotes: string[]): VerificationResult {
    return {
      status,
      orderId: expected.orderId,
      transactionHash: expected.transactionHash,
      blockNumber: receipt!.blockNumber.toString(),
      blockHash: receipt!.blockHash,
      checks,
      amounts: verifiedAmounts,
      verificationSource: verifyRpc(),
      broadcastSource: writeRpc(),
      firstVerificationAt: firstAt,
      finalVerificationAt: new Date().toISOString(),
      confirmations,
      notes: extraNotes,
    };
  }
}

/// Wait for inclusion, then for the confirmations the policy asks for.
///
/// Waiting only for inclusion meant verification ran the instant the transaction was mined,
/// at zero or one confirmation, against a policy asking for three. Every postcondition
/// passed and the outcome still settled as PARTIALLY_VERIFIED, so a completely healthy fill
/// read on the page as an execution that could not be confirmed. The checks were never the
/// problem; the receipt was simply being read too early.
///
/// Blocks on X Layer arrive every few seconds, so this costs under ten seconds and stays
/// well inside the verification timeout. Running out of time still returns the receipt:
/// fewer confirmations than the policy wants is a weaker result that the caller reports
/// honestly, not a reason to discard a transaction that is on chain.
async function waitForReceipt(client: PublicClient, hash: Hash) {
  const deadline = Date.now() + POLICY.verificationTimeoutMs;
  let receipt = null;

  while (Date.now() < deadline) {
    try {
      receipt = await client.getTransactionReceipt({hash});
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
  if (!receipt) return null;

  while (Date.now() < deadline) {
    const head = await client.getBlockNumber();
    if (Number(head - receipt.blockNumber) >= POLICY.confirmations) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return receipt;
}

function statusName(s: number): string {
  return (
    Object.entries(OrderStatus).find(([, v]) => v === s)?.[0] ?? `UNKNOWN(${s})`
  );
}

export {reasonFromCode};
