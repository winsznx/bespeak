import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {xLayer} from "@bespeak/shared";
import {keeperWallet, keeperAccount, publicWriteClient, deployment} from "./config.js";

/// Cancel an active order and release its reservation.
///
/// The owner can always do this from the UI; this exists for operating a run from the
/// terminal. Cancellation is the user's escape hatch, so it is worth being able to
/// exercise it without a browser.
///
/// Usage: pnpm cancel 0x<orderId>

async function main() {
  const id = process.argv[2] as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(id ?? "")) {
    throw new Error("pass a full 32-byte order id");
  }

  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();

  const hash = await wallet.writeContract({
    account,
    chain: xLayer,
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "cancelOrder",
    args: [id],
  });
  await client.waitForTransactionReceipt({hash});
  console.log(`cancelled ${id}\n  ${hash}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
