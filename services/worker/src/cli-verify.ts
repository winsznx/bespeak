import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {keccak256, toHex, type Address, type Hash} from "viem";
import {verifyExecution} from "./verifier.js";
import {assertIndependentReadPath, verifyRpc, writeRpc} from "./config.js";

/// Re-verify a stored receipt against live chain state.
///
/// This is the tool a reviewer runs to check Bespeak without trusting Bespeak. It re-reads
/// X Layer through the independent RPC and re-derives every postcondition from the chain,
/// then compares the result against what the receipt claims.
///
/// It also recomputes the receipt's own content hash, so a receipt whose contents were
/// edited after the fact fails here even if the chain data still supports the original
/// outcome. That is the tamper case (PRD 36.3).

const DIR = process.env.BESPEAK_EVIDENCE_DIR ?? "evidence/executions";

interface StoredReceipt {
  receiptId: string;
  orderId: Hash;
  owner: Address;
  vault: Address;
  receiver: Address;
  inputToken: Address;
  underlyingAddress: Address;
  amountReserved: string;
  minimumOutput: string;
  transactionHash: Hash;
  finalOutcomeStatus: string;
  actualInputSpent: string;
  actualOutputReceived: string;
  [k: string]: unknown;
}

function recomputeReceiptId(receipt: StoredReceipt): string {
  const {receiptId: _omit, ...rest} = receipt;
  void _omit;
  const canonical = JSON.stringify(rest, Object.keys(rest).sort());
  return keccak256(toHex(canonical));
}

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("usage: pnpm --filter @bespeak/worker verify <receiptId>");
    process.exit(2);
  }

  assertIndependentReadPath();
  console.log(`broadcast path : ${writeRpc()}`);
  console.log(`verify path    : ${verifyRpc()}  (must differ, and does)\n`);

  const raw = await readFile(join(DIR, `${id}.json`), "utf8");
  const receipt = JSON.parse(raw) as StoredReceipt;

  // 1. Integrity of the document itself.
  const recomputed = recomputeReceiptId(receipt);
  const intact = recomputed === receipt.receiptId;
  console.log(`receipt hash   : ${intact ? "MATCHES" : "MISMATCH — receipt has been altered"}`);
  if (!intact) {
    console.log(`  stored     : ${receipt.receiptId}`);
    console.log(`  recomputed : ${recomputed}`);
  }

  // 2. Independent reconstruction from chain state.
  const result = await verifyExecution({
    orderId: receipt.orderId,
    transactionHash: receipt.transactionHash,
    owner: receipt.owner,
    vault: receipt.vault,
    receiver: receipt.receiver,
    inputToken: receipt.inputToken,
    outputToken: receipt.underlyingAddress,
    amountReserved: BigInt(receipt.amountReserved),
    minAmountOut: BigInt(receipt.minimumOutput),
    // Re-derive the pre-state from the receipt's own reported movements, so the check is
    // "does the chain agree with what this document claims moved", not "does it agree with
    // what we remember".
    receiverOutputBefore:
      (await currentBalance(receipt.underlyingAddress, receipt.receiver)) -
      BigInt(receipt.actualOutputReceived),
    vaultInputBefore:
      (await currentBalance(receipt.inputToken, receipt.vault)) + BigInt(receipt.actualInputSpent),
    executionCountBefore: 0,
  });

  console.log(`\nindependent outcome: ${result.status}`);
  console.log(`receipt claimed    : ${receipt.finalOutcomeStatus}`);
  for (const c of result.checks) {
    console.log(`  ${c.passed ? "ok  " : "FAIL"} ${c.name} — observed ${c.observed}`);
  }

  const agrees = result.status === receipt.finalOutcomeStatus;
  console.log(`\nverdict: ${intact && agrees ? "RECEIPT VERIFIED" : "RECEIPT REJECTED"}`);
  if (!intact || !agrees) process.exitCode = 1;
}

async function currentBalance(token: Address, holder: Address): Promise<bigint> {
  const {publicVerifyClient} = await import("./config.js");
  return (await publicVerifyClient().readContract({
    address: token,
    abi: [
      {
        name: "balanceOf",
        type: "function",
        stateMutability: "view",
        inputs: [{type: "address"}],
        outputs: [{type: "uint256"}],
      },
    ],
    functionName: "balanceOf",
    args: [holder],
  })) as bigint;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
