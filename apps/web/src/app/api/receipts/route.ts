import {getCloudflareContext} from "@opennextjs/cloudflare";
import type {StoredReceipt} from "@/lib/receipts";

export const dynamic = "force-dynamic";

/// Receipt ingest.
///
/// The keeper writes receipts to its own disk. That server does not share a filesystem
/// with this one, so in production every fill except the handful bundled at build time
/// rendered as "outcome not yet confirmed" — the order had executed and the assets had
/// arrived, and the page said it could not confirm it.
///
/// Reconstructing the receipt from chain was the obvious alternative and does not work:
/// X Layer's public RPC caps eth_getLogs at roughly a hundred blocks, so finding one
/// execution event would take hundreds of calls per page view.
///
/// So the keeper posts here instead and the receipt lands in shared storage. The bearer
/// token only gates who may write; receipts are public evidence and are readable by
/// anyone. Nothing here can invent a fill: a receipt is only meaningful because the
/// transaction it names is on chain and anyone can check it.
export async function POST(request: Request): Promise<Response> {
  const expected = process.env.RECEIPT_INGEST_TOKEN;
  if (!expected) {
    return Response.json({error: "ingest not configured"}, {status: 503});
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return Response.json({error: "unauthorized"}, {status: 401});
  }

  let receipt: StoredReceipt;
  try {
    receipt = (await request.json()) as StoredReceipt;
  } catch {
    return Response.json({error: "invalid json"}, {status: 400});
  }

  if (!receipt?.receiptId || !receipt?.orderId || !receipt?.transactionHash) {
    return Response.json({error: "receipt missing receiptId, orderId or transactionHash"}, {status: 400});
  }

  const kv = getCloudflareContext().env.RECEIPTS;
  if (!kv) return Response.json({error: "no receipt store bound"}, {status: 503});

  const body = JSON.stringify(receipt);
  // Stored under both keys so a page can resolve from either the receipt hash or the
  // order it belongs to, which is what the two receipt routes each have in hand.
  await kv.put(`receipt:${receipt.receiptId.toLowerCase()}`, body);
  await kv.put(`order:${receipt.orderId.toLowerCase()}`, body);

  return Response.json({stored: receipt.receiptId});
}

/// Read a receipt back. Public: receipts are evidence, and the transaction each one names
/// is on chain for anyone to check.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const order = url.searchParams.get("order");
  const receipt = url.searchParams.get("receipt");
  if (!order && !receipt) {
    return Response.json({error: "pass ?order= or ?receipt="}, {status: 400});
  }
  const kv = getCloudflareContext().env.RECEIPTS;
  if (!kv) return Response.json({error: "no receipt store bound"}, {status: 503});
  const key = order ? `order:${order.toLowerCase()}` : `receipt:${receipt!.toLowerCase()}`;
  const raw = await kv.get(key);
  if (!raw) return Response.json({error: "not found", key}, {status: 404});
  return new Response(raw, {headers: {"content-type": "application/json"}});
}
