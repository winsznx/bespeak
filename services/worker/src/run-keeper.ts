import {writeFileSync, mkdirSync} from "node:fs";
import {join} from "node:path";
import {formatEther, type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {xLayer, TriggerType} from "@bespeak/shared";
import {observeSessions, signObservation} from "@bespeak/conditions";
import {OkxDexClient, validateRoute} from "@bespeak/okx";
import {
  POLICY,
  deployment,
  keeperAccount,
  keeperWallet,
  okxCredentials,
  publicWriteClient,
  assertIndependentReadPath,
} from "./config.js";
import {
  assessOrder,
  capturePreState,
  keeperHealth,
  loadActiveOrders,
  registrySymbols,
  type OrderView,
} from "./keeper.js";
import {verifyExecution} from "./verifier.js";
import {finalizeReceipt, attestedTierLimitations, type BespeakReceipt} from "./receipt.js";

const EVIDENCE_DIR = process.env.BESPEAK_EVIDENCE_DIR ?? "evidence/executions";

/// One keeper pass.
///
/// Order of operations is the point: assess, capture the pre-state, submit, then verify
/// through a different RPC. Capturing balances BEFORE submitting is what makes verification
/// possible at all - without it a fill could only ever be claimed.
export async function tick(opts: {dryRun: boolean}): Promise<void> {
  assertIndependentReadPath();

  const health = await keeperHealth();
  console.log(
    `keeper ${health.address} ${health.nativeBalanceOkb} OKB ` +
      `(~${health.estimatedAttemptsRemaining} attempts)`,
  );

  if (health.belowThreshold && !opts.dryRun) {
    // Stopping before an attempt is the safe failure. A keeper that runs out mid-execution
    // leaves an order in an ambiguous state; one that stops early leaves the user's
    // cancellation and withdrawal paths completely intact.
    console.error(
      `KEEPER_GAS_LOW: balance ${health.nativeBalanceOkb} OKB is below the ` +
        `${formatEther(POLICY.keeperLowBalanceWei)} OKB threshold. Not attempting execution.`,
    );
    return;
  }

  const {symbolFor, outputTokenFor} = await registrySymbols();
  const orders = await loadActiveOrders();
  const active = orders.filter((o) => o.status === 1);
  console.log(`orders: ${orders.length} total, ${active.length} active\n`);

  for (const order of active) {
    const assessment = await assessOrder(order, symbolFor, outputTokenFor);
    const label = symbolFor.get(order.assetId) ?? order.assetId.slice(0, 10);
    console.log(
      `  ${order.id.slice(0, 10)} ${label.padEnd(8)} ${assessment.projected.padEnd(9)} ` +
        `${assessment.reason}${assessment.detail ? ` — ${assessment.detail}` : ""}`,
    );

    if (assessment.projected !== "ELIGIBLE") continue;
    if (opts.dryRun) {
      console.log("      (dry run: eligible, not executing)");
      continue;
    }
    await executeOrder(order, symbolFor, outputTokenFor);
  }
}

async function executeOrder(
  order: OrderView,
  symbolFor: Map<Hash, string>,
  outputTokenFor: Map<Hash, Address>,
): Promise<void> {
  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();
  const outputToken = outputTokenFor.get(order.assetId)!;
  const symbol = symbolFor.get(order.assetId)!;

  // Re-derive condition and route immediately before submitting, so nothing executes on a
  // reading that went stale while other orders were being assessed.
  let evidence: `0x${string}` = "0x";
  let observation = null;
  if (order.triggerType !== TriggerType.IMMEDIATE) {
    const obs = (await observeSessions([symbol])).get(symbol)!;
    observation = obs;
    evidence = await signObservation(wallet, account, d.conditionVerifier, order.assetId, obs);
  }

  const okx = new OkxDexClient(okxCredentials());
  const chain = await okx.supportedChain();
  const swap = await okx.swap({
    fromToken: order.inputToken,
    toToken: outputToken,
    amount: order.amountIn,
    slippageBps: order.maxSlippageBps,
    caller: d.executionAdapter,
    receiver: order.receiver,
  });
  const route = validateRoute(swap, chain.dexTokenApproveAddress as Address, {
    receiver: order.receiver,
    maxAmountIn: order.amountIn,
    minAmountOut: order.minAmountOut,
  });

  const pre = await capturePreState(order, outputToken);
  const requestedAt = new Date().toISOString();

  const req = {
    router: route.router,
    approveTarget: route.approveTarget,
    amountIn: order.amountIn,
    minAmountOut: route.minReceive,
    quoteTimestamp: BigInt(route.quotedAt),
    quoteHash: route.calldata.slice(0, 66) as Hash,
    routerCalldata: route.calldata,
    conditionEvidence: evidence,
  };

  console.log(`      submitting via router ${route.router}`);
  const hash = await wallet.writeContract({
    account,
    chain: xLayer,
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "execute",
    args: [order.id, req],
  });
  const submittedAt = new Date().toISOString();
  console.log(`      tx ${hash}`);

  await client.waitForTransactionReceipt({hash});

  // Independent readback. This is the only thing that may conclude the order succeeded.
  const verification = await verifyExecution({
    orderId: order.id,
    transactionHash: hash,
    owner: order.owner,
    vault: order.vault,
    receiver: order.receiver,
    inputToken: order.inputToken,
    outputToken,
    amountReserved: order.amountIn,
    minAmountOut: order.minAmountOut,
    receiverOutputBefore: pre.receiverOutputBefore,
    vaultInputBefore: pre.vaultInputBefore,
    executionCountBefore: pre.executionCountBefore,
  });

  console.log(`      verification: ${verification.status}`);
  for (const c of verification.checks.filter((x) => !x.passed)) {
    console.log(`        FAILED ${c.name}: expected ${c.expected}, observed ${c.observed}`);
  }

  const receipt = buildReceipt({
    order,
    symbol,
    outputToken,
    route,
    verification,
    observation,
    requestedAt,
    submittedAt,
    transactionHash: hash,
  });

  mkdirSync(EVIDENCE_DIR, {recursive: true});
  const path = join(EVIDENCE_DIR, `${receipt.receiptId}.json`);
  writeFileSync(path, JSON.stringify(receipt, jsonBigint, 2) + "\n");
  console.log(`      receipt ${path}`);
}

function jsonBigint(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function buildReceipt(args: {
  order: OrderView;
  symbol: string;
  outputToken: Address;
  route: {router: Address; approveTarget: Address; quotedAt: number; expectedOut: bigint; minReceive: bigint; priceImpactPercent: number};
  verification: Awaited<ReturnType<typeof verifyExecution>>;
  observation: Awaited<ReturnType<typeof observeSessions>> extends Map<string, infer T> ? T | null : null;
  requestedAt: string;
  submittedAt: string;
  transactionHash: Hash;
}): BespeakReceipt {
  const {order, verification, observation, route} = args;

  const draft: Omit<BespeakReceipt, "receiptId"> = {
    receiptVersion: "1.0",
    orderId: order.id,
    occurrenceIndex: order.occurrenceIndex,
    recurringId:
      order.recurringId === `0x${"0".repeat(64)}` ? null : (order.recurringId as Hash),
    owner: order.owner,
    vault: order.vault,
    receiver: order.receiver,

    assetId: order.assetId,
    assetSymbol: args.symbol,
    assetRegistryRevisionAtCreation: "0x0" as Hash,
    assetRegistryRevisionAtExecution: "0x0" as Hash,
    underlyingAddress: args.outputToken,
    wrapperAddress: null,
    wrapperVersion: 2,
    deliveredInstrument: "wrapped",
    inputToken: order.inputToken,
    inputTokenSymbol: "",

    triggerType: triggerName(order.triggerType),
    conditionIntent:
      order.triggerType === TriggerType.NEXT_REGULAR_SESSION
        ? "underlying US equity in its regular trading session"
        : order.triggerType === TriggerType.WHEN_AVAILABLE
          ? "asset executable on X Layer"
          : "immediate",
    conditionSource: observation ? "xstocks.fi/api/v2/public/assets" : "none (immediate)",
    conditionSourceTier: observation ? "ATTESTED_SESSION" : "NONE",
    conditionSourceVersion: "v2",
    conditionObservationTimestamp: observation
      ? new Date(observation.observedAt * 1000).toISOString()
      : null,
    conditionObservationHash: null,
    conditionSourcePayloadHash: observation ? observation.payloadHash : null,
    marketStatus: observation ? observation.raw.currentPeriod : "n/a",
    corporateActionState: "none pending",

    amountReserved: order.amountIn.toString(),
    actualInputSpent: "0",
    unusedInputReleased: "0",
    actualOutputReceived: "0",
    minimumOutput: route.minReceive.toString(),

    quoteSource: "OKX DEX aggregator v6",
    quoteTimestamp: new Date(route.quotedAt * 1000).toISOString(),
    quoteHash: null,
    routeSummary: `OKX DEX router ${route.router}`,
    routerAddress: route.router,
    approvalTarget: route.approveTarget,
    executionPrice: null,
    observedDifferenceBps: null,

    executionRequestedAt: args.requestedAt,
    transactionSubmittedAt: args.submittedAt,
    transactionHash: args.transactionHash,
    blockNumber: verification.blockNumber,
    blockHash: verification.blockHash,

    verificationSource: verification.verificationSource,
    broadcastSource: verification.broadcastSource,
    firstVerificationAt: verification.firstVerificationAt,
    finalVerificationAt: verification.finalVerificationAt,
    verificationPolicy: `${POLICY.confirmations} confirmations, independent RPC readback`,
    confirmations: verification.confirmations,
    verificationChecks: verification.checks,
    finalOutcomeStatus: verification.status,

    limitations: attestedTierLimitations(observation ?? null),
  };

  return finalizeReceipt(draft);
}

function triggerName(t: number): string {
  return t === TriggerType.IMMEDIATE
    ? "IMMEDIATE"
    : t === TriggerType.NEXT_REGULAR_SESSION
      ? "NEXT_REGULAR_SESSION"
      : "WHEN_AVAILABLE";
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const once = process.argv.includes("--once");
  const intervalMs = Number(process.env.KEEPER_INTERVAL_MS ?? 30_000);

  if (once || dryRun) {
    await tick({dryRun});
    return;
  }
  for (;;) {
    try {
      await tick({dryRun: false});
    } catch (e) {
      console.error("tick failed:", e instanceof Error ? e.message : e);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
