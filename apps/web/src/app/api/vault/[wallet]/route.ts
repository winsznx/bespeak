import {NextResponse} from "next/server";
import {isAddress} from "viem";
import {getVault} from "@/lib/server";

export const dynamic = "force-dynamic";

/// GET /api/vault/:wallet — available versus reserved, read from the vault contract.
export async function GET(_req: Request, ctx: {params: Promise<{wallet: string}>}) {
  const {wallet} = await ctx.params;
  if (!isAddress(wallet)) {
    return NextResponse.json({error: "INVALID_ADDRESS"}, {status: 400});
  }
  const v = await getVault(wallet);
  return NextResponse.json({
    wallet,
    vault: v.address,
    deployed: v.balances.length > 0,
    balances: v.balances.map((b) => ({
      symbol: b.symbol,
      token: b.address,
      decimals: b.decimals,
      total: b.total.toString(),
      available: b.available.toString(),
      reserved: b.reserved.toString(),
    })),
  });
}
