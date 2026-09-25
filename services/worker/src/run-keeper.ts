import {writeFileSync, mkdirSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
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
  resolveRoute,
  type OrderView,
  type RouteSource,
} from "./keeper.js";
import assetManifest from "@bespeak/assets/manifest" with {type: "json"};
import {verifyExecution} from "./verifier.js";
import {finalizeReceipt, attestedTierLimitations, type BespeakReceipt} from "./receipt.js";

/// Receipts go to the repo root so the worker that writes them and the web app that serves
/// them agree on one location, regardless of which directory either was started from.
/// Where the archival receipt copy goes on a server. Resolved lazily because
/// `import.meta.url` is undefined once this module is bundled into a worker, and computing
/// it at import time crashed the worker before it could run a single tick.
function evidenceDir(): string | null {
  if (process.env.BESPEAK_EVIDENCE_DIR) return process.env.BESPEAK_EVIDENCE_DIR;
  try {
    return join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "evidence", "executions");
  } catch {
    return null;
  }
}

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

  // Shared with the assessment path, so the keeper submits the route it said it would.
  const {route, source: routeSource} = await resolveRoute(order, outputToken, symbol);
  console.log(`      route via ${routeSource}`);

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
    routeSource,
    verification,
    observation,
    requestedAt,
    submittedAt,
    transactionHash: hash,
  });

  const body = JSON.stringify(receipt, jsonBigint, 2) + "\n";

  // The archival copy. There is no filesystem under the worker runtime, so this is
  // best-effort: losing it must not cost the receipt, which is published below either way.
  try {
    const dir = evidenceDir();
    if (!dir) throw new Error("no filesystem");
    mkdirSync(dir, {recursive: true});
    const path = join(dir, `${receipt.receiptId}.json`);
    writeFileSync(path, body);
    console.log(`      receipt ${path}`);
  } catch {
    console.log("      no local filesystem; receipt goes to the store only");
  }

  await publishReceipt(body);
}

/// Send the receipt to the deployed app.
///
/// The file above is the archival copy and lives next to the repo. It is not reachable
/// from production: the keeper and the web server do not share a filesystem, so without
/// this every fill rendered as "outcome not yet confirmed" for everyone but us.
///
/// A failure here is logged and swallowed. The execution already happened and is already
/// verified; losing the upload must never turn a good fill into a failed keeper pass.
async function publishReceipt(body: string): Promise<void> {
  const url = process.env.RECEIPT_INGEST_URL;
  const token = process.env.RECEIPT_INGEST_TOKEN;
  if (!url || !token) return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {"content-type": "application/json", authorization: `Bearer ${token}`},
      body,
      signal: AbortSignal.timeout(15_000),
    });
    console.log(
      res.ok ? "      published to the app" : `      publish failed: HTTP ${res.status}`,
    );
  } catch (e) {
    console.log(`      publish failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function jsonBigint(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function buildReceipt(args: {
  order: OrderView;
  symbol: string;
  outputToken: Address;
  route: {router: Address; approveTarget: Address; quotedAt: number; expectedOut: bigint; minReceive: bigint; priceImpactPercent: number};
  routeSource: RouteSource;
  verification: Awaited<ReturnType<typeof verifyExecution>>;
  observation: Awaited<ReturnType<typeof observeSessions>> extends Map<string, infer T> ? T | null : null;
  requestedAt: string;
  submittedAt: string;
  transactionHash: Hash;
}): BespeakReceipt {
  const {order, verification, observation, route, routeSource} = args;
  const manifestAsset = assetManifest.assets.find((a) => a.symbol === args.symbol);

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
    // The pinned manifest revision the identity was resolved against. Placeholders here
    // would make the receipt unable to answer "which registry said this token was NVDA",
    // which is the question the whole provenance claim rests on.
    assetRegistryRevisionAtCreation: assetManifest.sourceRevision as Hash,
    assetRegistryRevisionAtExecution: assetManifest.sourceRevision as Hash,
    underlyingAddress: (manifestAsset?.underlying as Address | undefined) ?? args.outputToken,
    wrapperAddress: (manifestAsset?.wrapper as Address | undefined) ?? null,
    wrapperVersion: manifestAsset?.wrapperVersion ?? 2,
    // Derived, not assumed. The adapter delivers whatever the registry names as the output
    // token, and for these assets that is the ERC-4626 wrapper; saying "wrapped" while
    // carrying a null wrapper address would be a receipt contradicting itself.
    deliveredInstrument:
      manifestAsset?.wrapper &&
      manifestAsset.wrapper.toLowerCase() === args.outputToken.toLowerCase()
        ? "wrapped"
        : "underlying",
    inputToken: order.inputToken,
    inputTokenSymbol: manifestAsset?.route?.quoteSymbol ?? "",

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
    // Taken from the verified OrderExecuted event, never from the keeper's own account of
    // what it did. Null amounts mean nothing was confirmed, so the receipt says 0 spent
    // rather than implying a fill that was not observed.
    actualInputSpent: verification.amounts?.actualInputSpent ?? "0",
    unusedInputReleased: verification.amounts?.unusedInputReleased ?? "0",
    actualOutputReceived: verification.amounts?.actualOutputReceived ?? "0",
    minimumOutput: route.minReceive.toString(),

    // The venue that actually priced this fill. Crediting the aggregator for a route the
    // pool built would misstate the evidence, and the two do not carry the same guarantees.
    quoteSource:
      routeSource === "okx-aggregator"
        ? "OKX DEX aggregator v6"
        : "Uniswap v3 pool, quoted on chain via QuoterV2",
    quoteTimestamp: new Date(route.quotedAt * 1000).toISOString(),
    quoteHash: null,
    routeSummary:
      routeSource === "okx-aggregator"
        ? `OKX DEX router ${route.router}`
        : `Uniswap v3 SwapRouter02 ${route.router}, single pool`,
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
