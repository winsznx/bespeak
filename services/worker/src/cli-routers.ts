import {getAddress, type Address} from "viem";
import {RouterRegistryAbi} from "@bespeak/sdk";
import {
  OkxDexClient,
  assertVerifiedVenue,
  XLAYER_SWAP_ROUTER_02,
  XLAYER_V3_FACTORY,
} from "@bespeak/okx";
import {xLayer} from "@bespeak/shared";
import {keeperWallet, keeperAccount, publicWriteClient, deployment, okxCredentials} from "./config.js";

/// Allowlist the routers the adapter is permitted to call.
///
/// Neither address is a constant copied from a documentation page. The OKX pair is read
/// from the live API, because OKX documents that those addresses change and an address
/// nobody checked against the running system is an address nobody checked. The direct
/// venue is checked a different way: `factory()` on the router must return the same v3
/// factory the pool discovery found by tracing real xStock transfers on chain.
///
/// Pass `--direct` to allowlist only the direct venue, which needs no OKX credentials.

async function main() {
  const directOnly = process.argv.includes("--direct");
  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();

  const approvals: Array<[fn: "setRouter" | "setApproveTarget", addr: Address]> = [];

  if (directOnly) {
    await assertVerifiedVenue(client);
    console.log(`direct venue verified against factory ${XLAYER_V3_FACTORY}`);
    console.log(`router + approve target: ${XLAYER_SWAP_ROUTER_02}`);
    // SwapRouter02 pulls the input itself, so it is both the call target and the spender.
    approvals.push(["setRouter", XLAYER_SWAP_ROUTER_02], ["setApproveTarget", XLAYER_SWAP_ROUTER_02]);
    await writeAll(approvals, {wallet, account, client, d});
    return;
  }

  const okx = new OkxDexClient(okxCredentials());

  const chain = await okx.supportedChain();
  const approveTarget = getAddress(chain.dexTokenApproveAddress) as Address;
  console.log(`approve target from API: ${approveTarget}`);

  // Ask for a real route so the router address is the one that would actually be executed,
  // not a documented default.
  const USDC = getAddress("0xb6ceceab302e2e4948951ee7843fc24e92933061") as Address;
  const NVDAX = getAddress("0xc845b2894dBddd03858fd2D643B4eF725fE0849d") as Address;
  const swap = await okx.swap({
    fromToken: USDC,
    toToken: NVDAX,
    amount: 5_000_000n,
    slippageBps: 75,
    caller: d.executionAdapter,
    receiver: account.address,
  });
  const router = getAddress(swap.tx.to) as Address;
  console.log(`router from live route:  ${router}`);

  await writeAll(
    [
      ["setRouter", router],
      ["setApproveTarget", approveTarget],
    ],
    {wallet, account, client, d},
  );
}

type Ctx = {
  wallet: ReturnType<typeof keeperWallet>;
  account: ReturnType<typeof keeperAccount>;
  client: ReturnType<typeof publicWriteClient>;
  d: ReturnType<typeof deployment>;
};

async function writeAll(
  approvals: Array<[fn: "setRouter" | "setApproveTarget", addr: Address]>,
  {wallet, account, client, d}: Ctx,
): Promise<void> {
  for (const [fn, addr] of approvals) {
    const hash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: d.routerRegistry,
      abi: RouterRegistryAbi,
      functionName: fn,
      args: [addr, true],
    });
    await client.waitForTransactionReceipt({hash});
    console.log(`  ${fn}(${addr}) -> ${hash}`);
  }

  const rev = await client.readContract({
    address: d.routerRegistry,
    abi: RouterRegistryAbi,
    functionName: "configRevision",
  });
  console.log(`\nrouter registry config revision: ${rev}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
