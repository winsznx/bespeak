import "server-only";
import {readFile, readdir} from "node:fs/promises";
import {join} from "node:path";

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

const DIR = process.env.BESPEAK_EVIDENCE_DIR ?? "evidence/executions";

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
  return null;
}

export async function loadReceiptById(receiptId: string): Promise<StoredReceipt | null> {
  try {
    const raw = await readFile(join(DIR, `${receiptId}.json`), "utf8");
    return JSON.parse(raw) as StoredReceipt;
  } catch {
    return null;
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
    return out;
  } catch {
    return [];
  }
}
