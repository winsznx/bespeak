import {writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";
import {buildManifest} from "./registry.js";

/// The assets Bespeak supports at launch. Deliberately a short list: PRD 13 requires
/// restricting to assets with a proven execution route rather than exposing everything the
/// catalogue contains. The catalogue has 1026 entries; supporting all of them would mean
/// claiming routes we have not checked.
const LAUNCH_SYMBOLS = [
  "NVDAx", "TSLAx", "AAPLx", "MSFTx", "SPYx", "QQQx",
  "AMZNx", "GOOGLx", "METAx", "AMDx", "COINx", "MSTRx",
];

async function main() {
  const rpc = process.env.XLAYER_VERIFY_RPC_URL;
  const manifest = await buildManifest(LAUNCH_SYMBOLS, rpc);

  const out = join(dirname(fileURLToPath(import.meta.url)), "..", "manifest.json");
  writeFileSync(out, JSON.stringify(manifest, null, 2) + "\n");

  const verified = manifest.assets.filter((a) => a.onchainVerified);
  console.log(`catalogue:        ${manifest.catalogueSize} assets`);
  console.log(`requested:        ${LAUNCH_SYMBOLS.length}`);
  console.log(`resolved:         ${manifest.assets.length}`);
  console.log(`onchain verified: ${verified.length}`);
  console.log(`sourceRevision:   ${manifest.sourceRevision}`);
  console.log(`\n${"asset".padEnd(9)}${"verified".padEnd(10)}${"quote".padEnd(7)}${"depth".padStart(12)}  pool`);
  for (const a of manifest.assets) {
    const mark = a.onchainVerified ? "ok" : "FAIL";
    const r = a.route;
    console.log(
      `${a.symbol.padEnd(9)}${mark.padEnd(10)}` +
        (r
          ? `${r.quoteSymbol.padEnd(7)}${r.quoteDepth.toLocaleString("en-US", {maximumFractionDigits: 0}).padStart(12)}  ${r.pool}`
          : `${"-".padEnd(7)}${"no route".padStart(12)}`),
    );
  }

  const routable = manifest.assets.filter((a) => a.route);
  console.log(`\n${routable.length}/${manifest.assets.length} assets have an executable route.`);
  const byQuote = new Map<string, number>();
  for (const a of routable) byQuote.set(a.route!.quoteSymbol, (byQuote.get(a.route!.quoteSymbol) ?? 0) + 1);
  for (const [q, n] of byQuote) console.log(`  ${q}: ${n} assets`);
  if (verified.length !== manifest.assets.length) {
    console.error("\nSome assets failed on-chain verification and must not be promoted to SUPPORTED.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
