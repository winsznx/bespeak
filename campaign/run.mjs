#!/usr/bin/env node
/**
 * Runs the proof campaign and writes a judge-readable result.
 *
 * It does not assert that the campaign passed. It runs each mapped test, records what
 * actually happened, and writes UNPROVEN for anything whose test is missing or failing.
 * A campaign that quietly dropped a failing case would be worse than no campaign.
 */
import {execFileSync} from "node:child_process";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const manifest = JSON.parse(readFileSync(join(here, "manifest.json"), "utf8"));
const forkUrl = process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech";

function runForge(args) {
  try {
    const out = execFileSync("forge", args, {cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024});
    return {ok: true, out};
  } catch (e) {
    return {ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}`};
  }
}

console.log("Bespeak proof campaign\n");

// One forge run for the unit suite, one for the fork suite; then map results onto cases.
const unit = runForge(["test", "--root", "contracts", "--no-match-contract", "ForkXLayer", "--json"]);
const fork = runForge(["test", "--root", "contracts", "--match-contract", "ForkXLayer", "--fork-url", forkUrl, "--json"]);

function parseResults(raw) {
  const line = raw.split("\n").find((l) => l.trim().startsWith("{"));
  if (!line) return new Map();
  const byTest = new Map();
  for (const [suite, data] of Object.entries(JSON.parse(line))) {
    const contract = suite.split(":").pop();
    for (const [name, r] of Object.entries(data.test_results ?? {})) {
      byTest.set(`${contract}:${name.replace(/\(.*/, "")}`, r.status);
    }
  }
  return byTest;
}

const results = new Map([...parseResults(unit.out), ...parseResults(fork.out)]);

const cases = manifest.cases.map((c) => {
  const key = c.test.replace(/\(.*/, "");
  const status = results.get(key);
  return {
    ...c,
    result: status === "Success" ? "PROVEN" : status ? `FAILED (${status})` : "UNPROVEN — test not found",
  };
});

const proven = cases.filter((c) => c.result === "PROVEN").length;
const failed = cases.filter((c) => c.result.startsWith("FAILED")).length;
const missing = cases.filter((c) => c.result.startsWith("UNPROVEN")).length;

for (const c of cases) {
  const mark = c.result === "PROVEN" ? "ok  " : "FAIL";
  console.log(`  ${mark} ${c.id.padEnd(5)} ${c.claim}`);
  if (c.result !== "PROVEN") console.log(`        ${c.result}`);
}

console.log(`\n${proven} proven, ${failed} failed, ${missing} missing`);
console.log(`${manifest.unprovenWithoutMainnet.length} cases explicitly require mainnet and are listed as unproven:`);
for (const u of manifest.unprovenWithoutMainnet) console.log(`  --   ${u.id.padEnd(5)} ${u.claim}`);

const out = {
  generatedAt: new Date().toISOString(),
  chainId: 196,
  summary: {proven, failed, missing, requiresMainnet: manifest.unprovenWithoutMainnet.length},
  cases,
  unprovenWithoutMainnet: manifest.unprovenWithoutMainnet,
};

mkdirSync(join(root, "evidence"), {recursive: true});
writeFileSync(join(root, "evidence", "campaign.json"), JSON.stringify(out, null, 2) + "\n");
console.log("\nwrote evidence/campaign.json");

if (failed > 0 || missing > 0) process.exit(1);
