import {OkxDexClient, OkxApiError, X_LAYER_CHAIN_INDEX} from "./client.js";
import {getAddress} from "viem";

/// Live check of the OKX DEX integration on X Layer. Run this the moment credentials
/// exist; it is the first half of gate G1.
///
/// It answers, against the real API rather than documentation:
///   - do our credentials and signature scheme work at all
///   - is chain 196 actually served
///   - what is the current approval target (which must go into RouterRegistry)
///   - is there a real USDC -> NVDAx route with usable liquidity
///   - what router address does the swap endpoint return (which must also be allowlisted)
///   - does swapReceiverAddress work when the caller and receiver differ

const USDC = getAddress("0xb6ceceab302e2e4948951ee7843fc24e92933061");
const NVDAX = getAddress("0xc845b2894dBddd03858fd2D643B4eF725fE0849d");

async function main() {
  const creds = {
    apiKey: process.env.OKX_API_KEY ?? "",
    apiSecret: process.env.OKX_API_SECRET ?? "",
    passphrase: process.env.OKX_API_PASSPHRASE ?? "",
    projectId: process.env.OKX_PROJECT_ID ?? "",
  };
  const missing = Object.entries(creds).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) {
    console.error(`missing credentials: ${missing.join(", ")}`);
    console.error("Create them at https://web3.okx.com/onchainos/dev-portal");
    process.exit(2);
  }

  const client = new OkxDexClient(creds);
  const caller = process.env.PROBE_CALLER ?? "0x0000000000000000000000000000000000000001";
  const receiver = process.env.PROBE_RECEIVER ?? "0x0000000000000000000000000000000000000002";
  const amount = BigInt(process.env.PROBE_AMOUNT ?? "5000000"); // 5 USDC, 6dp

  try {
    const chain = await client.supportedChain(X_LAYER_CHAIN_INDEX);
    console.log("chain 196 served:      yes");
    console.log("dexTokenApproveAddress:", chain.dexTokenApproveAddress);

    const quote = await client.quote({fromToken: USDC, toToken: NVDAX, amount});
    console.log("\nquote 5 USDC -> NVDAx");
    console.log("  out:          ", quote.toTokenAmount);
    console.log("  priceImpact%: ", quote.priceImpactPercentage ?? "n/a");
    console.log("  routers:      ", JSON.stringify(quote.dexRouterList?.slice(0, 3) ?? []));

    const swap = await client.swap({
      fromToken: USDC,
      toToken: NVDAX,
      amount,
      slippageBps: 75,
      caller: getAddress(caller),
      receiver: getAddress(receiver),
    });
    console.log("\nswap calldata");
    console.log("  router tx.to: ", swap.tx.to);
    console.log("  value:        ", swap.tx.value);
    console.log("  minReceive:   ", swap.tx.minReceiveAmount ?? "n/a");
    console.log("  calldata len: ", swap.tx.data.length);
    console.log(
      "\nrouter and approve target differ:",
      swap.tx.to.toLowerCase() !== chain.dexTokenApproveAddress.toLowerCase(),
    );
    console.log("\nBoth addresses must be added to RouterRegistry before any execution.");
  } catch (e) {
    if (e instanceof OkxApiError) {
      console.error(`FAILED ${e.code}: ${e.message}`);
      process.exit(1);
    }
    throw e;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
