import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";

/// Export the ABIs the app and worker need straight from the Foundry build output, so the
/// TypeScript side can never drift from the deployed bytecode.
const CONTRACTS = [
  "AssetRegistry",
  "RouterRegistry",
  "BespeakOrderManager",
  "BespeakVault",
  "BespeakVaultFactory",
  "OkxExecutionAdapter",
  "AttestedSessionVerifier",
];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "abi");
const artifacts = join(here, "..", "..", "..", "contracts", "out");

mkdirSync(outDir, {recursive: true});

const index: string[] = [];
for (const name of CONTRACTS) {
  const artifact = JSON.parse(readFileSync(join(artifacts, `${name}.sol`, `${name}.json`), "utf8"));
  writeFileSync(
    join(outDir, `${name}.ts`),
    `// Generated from contracts/out/${name}.sol/${name}.json. Do not edit by hand.\n` +
      `export const ${name}Abi = ${JSON.stringify(artifact.abi)} as const;\n`,
  );
  index.push(`export * from "./${name}.js";`);
}
writeFileSync(join(outDir, "index.ts"), index.join("\n") + "\n");
console.log(`exported ${CONTRACTS.length} ABIs to packages/sdk/src/abi`);
