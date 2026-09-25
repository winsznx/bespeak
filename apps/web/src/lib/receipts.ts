import "server-only";
import {readFile, readdir} from "node:fs/promises";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {BUNDLED_RECEIPTS} from "./receipts.generated";

export interface StoredReceipt {
  receiptId: string;
  orderId: string;
  transactionHash: `0x${string}`;
  blockNumber: string | null;
  actualInputSpent: string;
  actualOutputReceived: string;
  unusedInputReleased: string;
  amountReserved: string;
  transactionSubmittedAt: string;
  conditionSource: string;
  conditionSourceTier: string;
  conditionObservationTimestamp: string | null;
  conditionSourcePayloadHash: string | null;
  marketStatus: string;
  routerAddress: string | null;
  approvalTarget: string | null;
  verificationSource: string;
  broadcastSource: string;
  confirmations: number;
  verificationChecks: Array<{name: string; passed: boolean; expected: string; observed: string}>;
  finalOutcomeStatus: string;
  limitations: string[];
  [k: string]: unknown;
}

/// Receipts live at the repo root, written there by the worker and read here. The path is
/// resolved from this module rather than from `process.cwd()`, because the web app's
/// working directory is `apps/web` in development and something else again under the
/// worker runtime, and a relative default silently resolved to a directory that never
/// existed — the proof page rendered "not found" for receipts that were on disk.
const DIR =
  process.env.BESPEAK_EVIDENCE_DIR ??
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "evidence", "executions");

/// Receipts are files on disk, content-addressed by their own hash.
///
/// Kept out of a database on purpose: a receipt is evidence, and evidence that a running
/// service can silently rewrite is weaker evidence. A file can be committed, hashed and
/// checked by someone who does not trust the server that produced it.
export async function loadReceipt(orderId: string): Promise<StoredReceipt | null> {
  try {
    const files = await readdir(DIR);
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      const raw = await readFile(join(DIR, f), "utf8");
      const parsed = JSON.parse(raw) as StoredReceipt;
      if (parsed.orderId?.toLowerCase() === orderId.toLowerCase()) return parsed;
    }
  } catch {
    // No evidence directory yet is a normal state before the first execution.
  }
  for (const r of Object.values(BUNDLED_RECEIPTS)) {
    if (r.orderId?.toLowerCase() === orderId.toLowerCase()) return r;
  }
  return null;
}

export async function loadReceiptById(receiptId: string): Promise<StoredReceipt | null> {
  // Disk first, so a receipt written moments ago is served before the next build. The
  // bundle is the fallback and the only source that exists on the worker, which has no
  // filesystem; without it the proof pages 404 in production while the receipts sit in
  // the repo.
  try {
    const raw = await readFile(join(DIR, `${receiptId}.json`), "utf8");
    return JSON.parse(raw) as StoredReceipt;
  } catch {
    return BUNDLED_RECEIPTS[receiptId] ?? null;
  }
}

export async function listReceipts(): Promise<StoredReceipt[]> {
  try {
    const files = await readdir(DIR);
    const out: StoredReceipt[] = [];
    for (const f of files) {
      if (!f.endsWith(".json")) continue;
      out.push(JSON.parse(await readFile(join(DIR, f), "utf8")) as StoredReceipt);
    }
    return out.length ? out : Object.values(BUNDLED_RECEIPTS);
  } catch {
    return Object.values(BUNDLED_RECEIPTS);
  }
}
