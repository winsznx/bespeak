import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {getOrdersOf, REGISTRY, OrderStatus, TriggerType} from "@/lib/server";

export const dynamic = "force-dynamic";

const STATUS: Record<number, string> = {
  [OrderStatus.NONE]: "NONE",
  [OrderStatus.ACTIVE]: "ACTIVE",
  [OrderStatus.FILLED]: "FILLED",
  [OrderStatus.CANCELLED]: "CANCELLED",
  [OrderStatus.EXPIRED]: "EXPIRED",
};
const TRIGGER: Record<number, string> = {
  [TriggerType.IMMEDIATE]: "IMMEDIATE",
  [TriggerType.NEXT_REGULAR_SESSION]: "NEXT_REGULAR_SESSION",
  [TriggerType.WHEN_AVAILABLE]: "WHEN_AVAILABLE",
};

/// GET /api/orders/:wallet — orders read from the contract, never from a cache.
export async function GET(_req: Request, ctx: {params: Promise<{wallet: string}>}) {
  const {wallet} = await ctx.params;
  if (!isAddress(wallet)) {
    return NextResponse.json({error: "INVALID_ADDRESS"}, {status: 400});
  }

  const orders = await getOrdersOf(wallet);
  return NextResponse.json({
    wallet,
    source: "on-chain read of BespeakOrderManager",
    orders: orders.map((o) => ({
      orderId: o.id,
      status: STATUS[o.status] ?? "UNKNOWN",
      triggerType: TRIGGER[o.triggerType] ?? "UNKNOWN",
      assetId: o.assetId,
      symbol: REGISTRY.assets.find((a) => a.assetId.toLowerCase() === o.assetId.toLowerCase())
        ?.symbol ?? null,
      inputToken: o.inputToken,
      amountIn: o.amountIn.toString(),
      minAmountOut: o.minAmountOut.toString(),
      maxSlippageBps: Number(o.maxSlippageBps),
      receiver: o.receiver,
      vault: o.vault,
      createdAt: new Date(Number(o.createdAt) * 1000).toISOString(),
      expiresAt: new Date(Number(o.expiresAt) * 1000).toISOString(),
      occurrenceIndex: Number(o.occurrenceIndex),
      recurringId:
        o.recurringId === `0x${"0".repeat(64)}` ? null : o.recurringId,
    })),
  });
}
