import {parseUnits, getAddress, erc20Abi, type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultFactoryAbi, BespeakVaultAbi} from "@bespeak/sdk";
import {xLayer, OrderSide, SourceTier, TriggerType} from "@bespeak/shared";
import assetManifest from "@bespeak/assets/manifest" with {type: "json"};
import {keeperWallet, keeperAccount, publicWriteClient, deployment} from "./config.js";

/// Place a conditioned sell from the terminal.
///
/// The mirror of `cli-order.ts`, and deliberately the same four steps in the same order:
/// ensure the vault, approve, deposit, create. What changes is the direction, and the point
/// of this script is to show how little else does. The asset goes in, a stablecoin comes
/// back, and the condition ladder in between is byte for byte the one a buy runs.
///
/// Requires the v1.1 order manager. Point the BESPEAK_* addresses at it before running.
///
/// Usage:
///   pnpm sell --symbol TSLAx --amount 0.001 --condition next-session
///   pnpm sell --symbol TSLAx --amount 0.001 --condition immediate

function arg(name: string, fallback?: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i === -1 ? undefined : process.argv[i + 1];
  if (v === undefined) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
  }
  return v;
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

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
  if (asset.wrapperDecimals === null) throw new Error(`${symbol} has no wrapper decimals`);

  const d = deployment();
  const client = publicWriteClient();
  const wallet = keeperWallet();
  const account = keeperAccount();
  const user = account.address;

  // What is being sold is the registered asset itself, read from the manifest rather than
  // chosen here. The contract re-checks it against the registry and refuses anything else.
  const assetToken = getAddress(asset.route.targetToken) as Address;
  const stable = getAddress(asset.route.quoteToken) as Address;
  const amount = parseUnits(amountHuman, asset.wrapperDecimals);

  console.log(`selling    ${amountHuman} ${asset.symbol}  (${asset.name})`);
  console.log(`asset      ${assetToken}`);
  console.log(`proceeds   ${asset.route.quoteSymbol} ${stable}`);
  console.log(`condition  ${conditionArg}`);
  console.log(`manager    ${d.orderManager}`);
  console.log(`user       ${user}\n`);

  const held = (await client.readContract({
    address: assetToken,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [user],
  })) as bigint;

  let vault = (await client.readContract({
    address: d.vaultFactory,
    abi: BespeakVaultFactoryAbi,
    functionName: "vaultOf",
    args: [user],
  })) as Address;

  if (vault === ZERO) {
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
    args: [assetToken],
  })) as bigint;

  // Top up only the shortfall, so the script is safe to run twice.
  if (available < amount) {
    const need = amount - available;
    if (held < need) {
      throw new Error(
        `wallet holds ${held} ${symbol} but the order needs ${need} more in the vault ` +
          `(have ${available})`,
      );
    }
    const approveHash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: assetToken,
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
      args: [assetToken, need],
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
        inputToken: assetToken,
        outputToken: stable,
        side: OrderSide.SELL,
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
  console.log(`\nsell order created  ${hash}`);
  console.log(`block               ${receipt.blockNumber}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
