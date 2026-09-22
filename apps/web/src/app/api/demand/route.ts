import {NextResponse} from "next/server";
import {getDemand, REGISTRY, deployment} from "@/lib/server";

export const revalidate = 30;

/// GET /api/demand — committed capital for assets not yet executable on X Layer.
/// Counts live reservations on active orders only. Not an adoption metric.
export async function GET() {
  if (!deployment()) {
    return NextResponse.json({deployed: false, totalCommitted: "0", demand: []});
  }
  const rows = await getDemand();
  return NextResponse.json({
    deployed: true,
    basis: "live reservations on active WHEN_AVAILABLE orders; not a measure of adoption",
    totalCommitted: rows.reduce((a, r) => a + r.committed, 0n).toString(),
    demand: rows.map((r) => ({
      assetId: r.assetId,
      symbol: REGISTRY.assets.find((a) => a.assetId.toLowerCase() === r.assetId.toLowerCase())
        ?.symbol ?? null,
      committed: r.committed.toString(),
      orders: r.orders,
      earliestExpiry: new Date(Number(r.earliestExpiry) * 1000).toISOString(),
    })),
  });
}
