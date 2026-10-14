import {readFileSync, writeFileSync} from "node:fs";
import {parseEventLogs, type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakOrderManagerV1Abi, BespeakVaultAbi} from "@bespeak/sdk";
import {OrderStatus} from "@bespeak/shared";
import {publicVerifyClient, deployment, verifyRpc} from "./config.js";

/// Re-verify a stored receipt against the chain, and correct it where the chain disagrees.
///
/// Two receipts written by earlier versions of the keeper are wrong in ways the chain can
/// settle. One records zero amounts because amounts were only taken from the contract's own
/// `OrderExecuted` event in a later version. One records `VERIFICATION_TIMEOUT` because
/// verification gave up while the transaction was still propagating, although it had in
/// fact been mined. Leaving either in place would mean publishing evidence we know to be
/// false, which is worse than the bug that produced it.
///
/// THE RULE THIS TOOL EXISTS UNDER. An earlier repair tool rewrote a healthy receipt into an
/// accusation, because it re-ran a point-in-time balance comparison months later against
/// balances that had since moved, and published the result. So:
///
///   1. It never downgrades. A receipt may only move to a stronger or equal status.
///   2. It refuses outright unless the transaction is present and successful on the
///      independent RPC.
///   3. Checks that were only answerable at execution time are never re-run and never
///      re-asserted. They are preserved exactly as originally recorded, or marked as not
///      re-runnable. Inventing a pass for them is the specific failure that caused harm.
///   4. Every change is recorded on the receipt itself with the field, the old value and
///      the new one, so the amendment is auditable rather than silent.
///
/// Usage: pnpm reverify evidence/executions/<file>.json [--write]

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{type: "address"}],
    outputs: [{type: "uint256"}],
  },
] as const;

/// Checks whose answer depends on state captured before the transaction was submitted.
/// They cannot be reconstructed afterwards and are never re-run here.
const POINT_IN_TIME = [
  "receiver balance increased by the reported output",
  "vault input decreased by exactly the reported spend",
];

const STRENGTH: Record<string, number> = {
  CONTRADICTED: 0,
  ROLLED_BACK: 0,
  VERIFICATION_TIMEOUT: 1,
  OUTCOME_UNKNOWN: 2,
  PARTIALLY_VERIFIED: 3,
  VERIFIED_FILLED: 4,
};

interface Amendment {
  field: string;
  was: unknown;
  now: unknown;
  why: string;
}

async function main() {
  const path = process.argv[2];
  const write = process.argv.includes("--write");
  if (!path) throw new Error("usage: pnpm reverify <receipt.json> [--write]");

  const receipt = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const txHash = receipt.transactionHash as Hash;
  const orderId = receipt.orderId as Hash;
  const client = publicVerifyClient();
  const d = deployment();
  const amendments: Amendment[] = [];

  console.log(`receipt   ${path.split("/").pop()}`);
  console.log(`tx        ${txHash}`);
  console.log(`read via  ${verifyRpc()}\n`);

  const onChain = await client.getTransactionReceipt({hash: txHash}).catch(() => null);
  if (!onChain) {
    console.log("REFUSED. The independent read path cannot see this transaction.");
    console.log("Nothing changed. A receipt is never upgraded on an absent transaction.");
    return;
  }
  if (onChain.status !== "success") {
    console.log(`REFUSED. The transaction is on chain but reverted (status ${onChain.status}).`);
    return;
  }

  const head = await client.getBlockNumber();
  const confirmations = Number(head - onChain.blockNumber);
  const canonical = await client.getBlock({blockNumber: onChain.blockNumber});
  if (canonical.hash !== onChain.blockHash) {
    console.log("REFUSED. The block carrying this execution is no longer canonical.");
    return;
  }

  // The contract's own account of what moved.
  const logs = parseEventLogs({
    abi: BespeakOrderManagerAbi,
    logs: onChain.logs,
    eventName: "OrderExecuted",
  });
  const executed = logs.find((l) => (l.args as {orderId: Hash}).orderId === orderId);
  if (!executed) {
    console.log("REFUSED. No OrderExecuted event for this order in that transaction.");
    return;
  }
  const a = executed.args as unknown as {
    actualInputSpent: bigint;
    actualOutputReceived: bigint;
    unusedInputReleased: bigint;
    outputToken: Address;
  };

  const note = `corrected from the contract's own OrderExecuted event in ${txHash}`;
  for (const [field, value] of [
    ["actualInputSpent", a.actualInputSpent.toString()],
    ["actualOutputReceived", a.actualOutputReceived.toString()],
    ["unusedInputReleased", a.unusedInputReleased.toString()],
  ] as const) {
    if (receipt[field] !== value) {
      amendments.push({field, was: receipt[field], now: value, why: note});
      receipt[field] = value;
    }
  }

  // The route summary was a hardcoded string while the route source was not, so a Uniswap
  // execution could describe itself as an OKX one. The router address on the receipt is the
  // address the transaction actually went to, so it settles the question.
  const router = (receipt.routerAddress as string | null)?.toLowerCase();
  const UNISWAP = "0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca";
  const OKX = "0x7c5bee2a8091c3ef39072f64f18fac913060aeaf";
  if (router === UNISWAP && String(receipt.routeSummary).includes("OKX")) {
    const corrected = `Uniswap v3 SwapRouter02 ${receipt.routerAddress}`;
    amendments.push({
      field: "routeSummary",
      was: receipt.routeSummary,
      now: corrected,
      why: "routerAddress is the Uniswap SwapRouter02, so the summary naming OKX was wrong",
    });
    receipt.routeSummary = corrected;
    if (receipt.quoteSource === "OKX DEX aggregator v6") {
      amendments.push({
        field: "quoteSource",
        was: receipt.quoteSource,
        now: "Uniswap v3 QuoterV2",
        why: "the route executed through the direct pool, so the quote did not come from OKX",
      });
      receipt.quoteSource = "Uniswap v3 QuoterV2";
    }
  }
  if (router === OKX && !String(receipt.routeSummary).includes("OKX")) {
    console.log("NOTE: router is the OKX aggregator but the summary does not say so.");
  }

  // Re-runnable checks only.
  // The Order struct differs between generations, so the ABI has to match the manager that
  // holds this order. Reading a v1 order with the v1.1 ABI expects two fields the contract
  // does not return and fails outright.
  async function readOrder(): Promise<{status: number; receiver: Address}> {
    for (const abi of [BespeakOrderManagerAbi, BespeakOrderManagerV1Abi]) {
      try {
        return (await client.readContract({
          address: d.orderManager,
          abi,
          functionName: "getOrder",
          args: [orderId],
        })) as {status: number; receiver: Address};
      } catch {
        // Try the other generation's shape.
      }
    }
    throw new Error(`could not decode order ${orderId} against either generation's ABI`);
  }
  const order = await readOrder();
  // executionCount is a plain mapping and identical in both generations.
  const executionCount = Number(
    await client.readContract({
      address: d.orderManager,
      abi: BespeakOrderManagerV1Abi,
      functionName: "executionCount",
      args: [orderId],
    }),
  );
  const reservation = (await client.readContract({
    address: receipt.vault as Address,
    abi: BespeakVaultAbi,
    functionName: "reservationOf",
    args: [orderId],
  })) as [Address, bigint, boolean];

  const rerun = [
    ["transaction status", onChain.status === "success", "success", onChain.status],
    ["block still canonical", canonical.hash === onChain.blockHash, onChain.blockHash, canonical.hash],
    ["order terminal state", order.status === OrderStatus.FILLED, "FILLED", String(order.status)],
    [
      "receiver unchanged from intent",
      order.receiver.toLowerCase() === String(receipt.receiver).toLowerCase(),
      String(receipt.receiver),
      order.receiver,
    ],
    ["executed exactly once", executionCount === 1, "1", String(executionCount)],
    ["OrderExecuted event present", true, "one matching event", "found"],
    [
      "output asset is the registered asset",
      a.outputToken.toLowerCase() === String(receipt.wrapperAddress ?? receipt.underlyingAddress).toLowerCase(),
      String(receipt.wrapperAddress ?? receipt.underlyingAddress),
      a.outputToken,
    ],
    ["input actually spent", a.actualInputSpent > 0n, "> 0", a.actualInputSpent.toString()],
    [
      "reservation fully settled",
      reservation[2] === false && reservation[1] === 0n,
      "closed, 0 remaining",
      `active=${reservation[2]} remaining=${reservation[1]}`,
    ],
  ] as const;

  const prior = (receipt.verificationChecks ?? []) as Array<{name: string; passed: boolean}>;
  const preserved = prior
    .filter((c) => POINT_IN_TIME.includes(c.name))
    .map((c) => ({...c, note: "recorded at execution time; not re-runnable afterwards"}));

  const newChecks = [
    ...rerun.map(([name, passed, expected, observed]) => ({
      name,
      passed,
      expected: String(expected),
      observed: String(observed),
    })),
    ...(preserved.length
      ? preserved
      : POINT_IN_TIME.map((name) => ({
          name,
          passed: false,
          expected: "measured before submission",
          observed: "not recorded, and not reconstructible afterwards",
          note: "never asserted retrospectively; a pass invented here would be a false claim",
        }))),
  ];

  const failed = newChecks.filter((c) => !c.passed);
  const allRerunPassed = rerun.every(([, p]) => p);
  // A receipt whose point-in-time evidence was never captured cannot reach VERIFIED_FILLED,
  // however healthy the rest looks. PARTIALLY_VERIFIED is the honest ceiling for it.
  const proposed = !allRerunPassed
    ? "OUTCOME_UNKNOWN"
    : preserved.length === POINT_IN_TIME.length && preserved.every((c) => c.passed)
      ? "VERIFIED_FILLED"
      : "PARTIALLY_VERIFIED";

  const current = String(receipt.finalOutcomeStatus);
  const upgraded = (STRENGTH[proposed] ?? 0) > (STRENGTH[current] ?? 0);

  console.log(`on chain  status=success block=${onChain.blockNumber} confirmations=${confirmations}`);
  console.log(`amounts   in=${a.actualInputSpent} out=${a.actualOutputReceived} released=${a.unusedInputReleased}`);
  console.log(`re-run    ${rerun.filter(([, p]) => p).length}/${rerun.length} checks pass`);
  console.log(`status    ${current} -> ${proposed}${upgraded ? "" : " (not applied: never downgrade)"}\n`);

  if (upgraded) {
    amendments.push({
      field: "finalOutcomeStatus",
      was: current,
      now: proposed,
      why: `re-verified against ${verifyRpc()}; the transaction is present, successful and canonical`,
    });
    receipt.finalOutcomeStatus = proposed;
    receipt.confirmations = confirmations;
    receipt.verificationChecks = newChecks;
  } else if (amendments.length) {
    // Amounts were corrected but the status stands. Keep the original checks: they were
    // the ones actually run at the time.
    receipt.verificationChecks = prior.length ? prior : newChecks;
  }

  if (amendments.length === 0) {
    console.log("No amendment needed. The receipt already agrees with the chain.");
    return;
  }

  for (const am of amendments) {
    console.log(`  ${am.field}\n    was ${String(am.was).slice(0, 70)}\n    now ${String(am.now).slice(0, 70)}\n    why ${am.why}`);
  }

  receipt.amendedAt = new Date().toISOString();
  receipt.amendments = amendments;
  receipt.amendmentMethod =
    `Re-read from ${verifyRpc()}, which did not broadcast the transaction. Amounts taken ` +
    `from the contract's own OrderExecuted event. Checks that could only be answered at ` +
    `execution time were preserved, never re-asserted.`;

  if (!write) {
    console.log("\nDry run. Pass --write to apply.");
    return;
  }
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n");
  console.log(`\nWritten to ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
