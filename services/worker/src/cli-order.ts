import {parseUnits, getAddress, erc20Abi, type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultFactoryAbi, BespeakVaultAbi} from "@bespeak/sdk";
import {xLayer, SourceTier, TriggerType} from "@bespeak/shared";
import assetManifest from "@bespeak/assets/manifest" with {type: "json"};
import {keeperWallet, keeperAccount, publicWriteClient, deployment} from "./config.js";

/// Place a standing order from the terminal, for canonical runs and for the agent surface
/// the product advertises.
///
/// It performs exactly what the web composer performs, in the same order and with the same
/// arguments, so a run driven from here is evidence about the product rather than about a
/// bespoke script: ensure the vault, approve, deposit, create the order.
///
/// Usage:
///   pnpm order --symbol NVDAx --amount 1 --condition next-session
///   pnpm order --symbol NVDAx --amount 1 --condition immediate

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i === -1 ? undefined : process.argv[i + 1];
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

async function main() {
  const symbol = arg("symbol");
  const amountHuman = arg("amount");
  const conditionArg = arg("condition", "next-session");
  const slippageBps = Number(arg("slippage-bps", "75"));

  const condition =
    conditionArg === "immediate" ? TriggerType.IMMEDIATE : TriggerType.NEXT_REGULAR_SESSION;

  const asset = assetManifest.assets.find((a) => a.symbol === symbol);
  if (!asset) throw new Error(`unknown symbol ${symbol}`);
  if (!asset.route) throw new Error(`${symbol} has no recorded route`);

  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();
  const user = account.address;

  const stable = getAddress(asset.route.quoteToken) as Address;
  const amount = parseUnits(amountHuman, asset.route.quoteDecimals);

  console.log(`asset      ${asset.symbol}  (${asset.name})`);
  console.log(`pay with   ${asset.route.quoteSymbol} ${stable}`);
  console.log(`amount     ${amountHuman} (${amount} raw)`);
  console.log(`condition  ${conditionArg}`);
  console.log(`user       ${user}\n`);

  const held = await client.readContract({
    address: stable,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [user],
  });

  let vault = (await client.readContract({
    address: d.vaultFactory,
    abi: BespeakVaultFactoryAbi,
    functionName: "vaultOf",
    args: [user],
  })) as Address;

  if (vault === "0x0000000000000000000000000000000000000000") {
    const hash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: d.vaultFactory,
      abi: BespeakVaultFactoryAbi,
      functionName: "ensureVault",
      args: [user],
    });
    await client.waitForTransactionReceipt({hash});
    vault = (await client.readContract({
      address: d.vaultFactory,
      abi: BespeakVaultFactoryAbi,
      functionName: "vaultOf",
      args: [user],
    })) as Address;
    console.log(`vault created  ${vault}  ${hash}`);
  } else {
    console.log(`vault          ${vault}`);
  }

  const available = (await client.readContract({
    address: vault,
    abi: BespeakVaultAbi,
    functionName: "available",
    args: [stable],
  })) as bigint;

  // Only top up the shortfall. Depositing blindly would strand capital in the vault on a
  // re-run, and the point of this script is that it can be run twice.
  if (available < amount) {
    const need = amount - available;
    if (held < need) {
      throw new Error(
        `wallet holds ${held} but the order needs ${need} more in the vault (have ${available})`,
      );
    }
    const approveHash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: stable,
      abi: erc20Abi,
      functionName: "approve",
      args: [vault, need],
    });
    await client.waitForTransactionReceipt({hash: approveHash});
    const depositHash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: vault,
      abi: BespeakVaultAbi,
      functionName: "deposit",
      args: [stable, need],
    });
    await client.waitForTransactionReceipt({hash: depositHash});
    console.log(`deposited      ${need}  ${depositHash}`);
  }

  const now = Math.floor(Date.now() / 1000);
  const hash = await wallet.writeContract({
    account,
    chain: xLayer,
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "createOrder",
    args: [
      {
        inputToken: stable,
        assetId: asset.assetId as Hash,
        receiver: user,
        triggerType: condition,
        amountIn: amount,
        minAmountOut: 0n,
        maxSlippageBps: slippageBps,
        maxReferenceDeviationBps: 100,
        validAfter: 0n,
        expiresAt: BigInt(condition === TriggerType.IMMEDIATE ? now + 3600 : now + 7 * 86_400),
        minSourceTier: SourceTier.ATTESTED_SESSION,
      },
    ],
  });
  const receipt = await client.waitForTransactionReceipt({hash});
  console.log(`\norder created  ${hash}`);
  console.log(`block          ${receipt.blockNumber}`);

  const total = (await client.readContract({
    address: d.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "totalOrders",
  })) as bigint;
  console.log(`total orders   ${total}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
