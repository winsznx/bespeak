import {NextResponse} from "next/server";
import {loadReceiptById} from "@/lib/receipts";

export const dynamic = "force-dynamic";

/// GET /api/receipts/:receiptId — the canonical machine-readable receipt.
/// Served without authentication so a reviewer can fetch and re-verify it independently.
export async function GET(_req: Request, ctx: {params: Promise<{receiptId: string}>}) {
  const {receiptId} = await ctx.params;
  const receipt = await loadReceiptById(receiptId);
  if (!receipt) return NextResponse.json({error: "NOT_FOUND"}, {status: 404});
  return NextResponse.json(receipt);
}
