import {NextResponse} from "next/server";
import {deployment, rpc, REGISTRY} from "@/lib/server";

export const dynamic = "force-dynamic";

/// GET /api/health — is Bespeak actually able to operate right now.
/// Reports each dependency separately so a partial outage is legible rather than a single
/// opaque "down".
export async function GET() {
  const d = deployment();
  let chain: {ok: boolean; blockNumber?: string; error?: string};
  try {
    const bn = await rpc().getBlockNumber();
    chain = {ok: true, blockNumber: bn.toString()};
  } catch (e) {
    chain = {ok: false, error: e instanceof Error ? e.message : String(e)};
  }

  let conditionSource = {ok: false};
  try {
    const res = await fetch(`${REGISTRY.sourceUri}?page=0`, {cache: "no-store"});
    conditionSource = {ok: res.ok};
  } catch {
    conditionSource = {ok: false};
  }

  return NextResponse.json({
    chainId: REGISTRY.chainId,
    deployed: d !== null,
    contracts: d ?? null,
    chain,
    conditionSource,
    registry: {
      revision: REGISTRY.sourceRevision,
      supportedAssets: REGISTRY.assets.length,
      verified: REGISTRY.assets.filter((a) => a.onchainVerified).length,
    },
  });
}
