import {getAddress, type Address} from "viem";
import {AssetRegistryAbi} from "@bespeak/sdk";
import {buildManifest} from "@bespeak/assets";
import {keeperWallet, keeperAccount, publicWriteClient, deployment} from "./config.js";
import {xLayer} from "@bespeak/shared";

/// Push the verified asset manifest into the on-chain AssetRegistry.
///
/// Only assets that passed on-chain verification are promoted to SUPPORTED. One that failed
/// is written as DISCOVERED instead, so it remains visible and inspectable but cannot
/// execute. That distinction is the whole point of the status enum: an asset Bespeak cannot
/// vouch for is recorded, not hidden and not trusted.

const LAUNCH_SYMBOLS = [
  "NVDAx", "TSLAx", "AAPLx", "MSFTx", "SPYx", "QQQx",
  "AMZNx", "GOOGLx", "METAx", "AMDx", "COINx", "MSTRx",
];

const AssetStatus = {DISCOVERED: 0, SUPPORTED: 1} as const;

async function main() {
  const d = deployment();
  const wallet = keeperWallet();
  const account = keeperAccount();
  const client = publicWriteClient();

  console.log(`registry ${d.assetRegistry}`);
  console.log(`sender   ${account.address}`);

  const manifest = await buildManifest(LAUNCH_SYMBOLS, process.env.XLAYER_VERIFY_RPC_URL);
  console.log(`manifest revision ${manifest.sourceRevision}`);
  console.log(`assets ${manifest.assets.length}, verified ${manifest.assets.filter((a) => a.onchainVerified).length}\n`);

  const payloadHash = manifest.sourceRevision as `0x${string}`;
  const fetchedAt = BigInt(Math.floor(new Date(manifest.sourceFetchedAt).getTime() / 1000));

  for (const a of manifest.assets) {
    const status = a.onchainVerified ? AssetStatus.SUPPORTED : AssetStatus.DISCOVERED;
    const hash = await wallet.writeContract({
      account,
      chain: xLayer,
      address: d.assetRegistry,
      abi: AssetRegistryAbi,
      functionName: "upsertAsset",
      args: [
        {
          assetId: a.assetId,
          symbol: a.symbol,
          canonicalId: a.canonicalId,
          underlying: getAddress(a.underlying) as Address,
          wrapper: (a.wrapper ? getAddress(a.wrapper) : "0x0000000000000000000000000000000000000000") as Address,
          wrapperVersion: a.wrapperVersion,
          status,
          sourcePayloadHash: payloadHash,
          sourceFetchedAt: fetchedAt,
          sourceUri: manifest.sourceUri,
        },
      ],
    });
    await client.waitForTransactionReceipt({hash});
    console.log(
      `  ${a.onchainVerified ? "SUPPORTED " : "DISCOVERED"} ${a.symbol.padEnd(8)} ${hash}`,
    );
  }

  const revision = await client.readContract({
    address: d.assetRegistry,
    abi: AssetRegistryAbi,
    functionName: "revision",
  });
  console.log(`\non-chain registry revision: ${revision}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
