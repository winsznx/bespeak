import {getAddress, type Address} from "viem";
import {RouterRegistryAbi} from "@bespeak/sdk";
import {OkxDexClient} from "@bespeak/okx";
import {xLayer} from "@bespeak/shared";
import {keeperWallet, keeperAccount, publicWriteClient, deployment, okxCredentials} from "./config.js";

/// Allowlist the OKX router and approval target that the LIVE API returns.
///
/// Deliberately not a constant in source. OKX documents that these addresses change, and an
/// address copied from documentation into a deploy script is an address nobody checked
/// against the running system. This reads them from the API, prints them for a human to
/// eyeball, and only then writes them to the registry.

async function main() {
  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();
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

  for (const [fn, addr] of [
    ["setRouter", router],
    ["setApproveTarget", approveTarget],
  ] as const) {
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
