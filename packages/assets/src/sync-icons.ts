import {createHash} from "node:crypto";
import {mkdirSync, writeFileSync, existsSync, readFileSync} from "node:fs";
import {join, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {fetchAllAssets, xLayerDeployment} from "./xstocks.js";
import {
  contractInfoUrl,
  NETWORK_IDENTITIES,
  TOKEN_IDENTITIES,
  type IconManifest,
  type IconProvenance,
  type IconSourceKind,
} from "./icons.js";

/// Downloads every shipped asset, token and network icon and serves them locally.
///
/// Production must not depend on a dozen third-party hotlinks per page load, and a demo
/// must not lose its identity because an upstream rate-limits us. Everything is pinned,
/// checksummed and committed.
///
/// The script FAILS if any shipped asset cannot be resolved. A missing icon is a QA
/// failure, not something to paper over with a letter badge.

const here = dirname(fileURLToPath(import.meta.url));
const webPublic = join(here, "..", "..", "..", "apps", "web", "public", "assets");
const manifestPath = join(here, "..", "icons", "manifest.json");

const SHIPPED = [
  "NVDAx", "TSLAx", "AAPLx", "MSFTx", "SPYx", "QQQx",
  "AMZNx", "GOOGLx", "METAx", "AMDx", "COINx", "MSTRx",
];

async function download(url: string): Promise<Buffer> {
  const res = await fetch(url, {headers: {accept: "image/*,*/*"}});
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.byteLength < 400) throw new Error(`suspiciously small image (${buf.byteLength}B) from ${url}`);
  return buf;
}

function write(dir: string, name: string, buf: Buffer): string {
  const abs = join(webPublic, dir);
  mkdirSync(abs, {recursive: true});
  writeFileSync(join(abs, name), buf);
  return `/assets/${dir}/${name}`;
}

function record(
  buf: Buffer,
  localPath: string,
  sourceUrl: string,
  sourceKind: IconSourceKind,
  note?: string,
): IconProvenance {
  return {
    sourceUrl,
    sourceKind,
    ...(note ? {note} : {}),
    retrievedAt: new Date().toISOString(),
    checksum: createHash("sha256").update(buf).digest("hex"),
    bytes: buf.byteLength,
    localPath,
  };
}

async function main() {
  const icons: Record<string, IconProvenance> = {};
  const failures: string[] = [];

  // Preserve anything a human pinned deliberately.
  const existing: IconManifest | null = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, "utf8")) as IconManifest)
    : null;

  console.log("resolving shipped equity icons from the issuer CDN\n");
  const catalogue = await fetchAllAssets();

  for (const symbol of SHIPPED) {
    const prior = existing?.icons[symbol];
    if (prior?.sourceKind === "PINNED") {
      icons[symbol] = prior;
      console.log(`  keep   ${symbol.padEnd(8)} pinned by hand — ${prior.note ?? ""}`);
      continue;
    }

    const asset = catalogue.find((a) => a.symbol === symbol);
    if (!asset || !xLayerDeployment(asset)) {
      failures.push(`${symbol}: not present in the catalogue with an X Layer deployment`);
      continue;
    }
    if (!asset.logo) {
      failures.push(`${symbol}: issuer published no logo; pin one manually`);
      continue;
    }

    try {
      const buf = await download(asset.logo);
      const path = write("equities", `${symbol.toLowerCase()}.png`, buf);
      icons[symbol] = record(buf, path, asset.logo, "ISSUER");
      console.log(`  ok     ${symbol.padEnd(8)} ${buf.byteLength.toString().padStart(7)}B  issuer`);
    } catch (e) {
      failures.push(`${symbol}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nresolving payment tokens by exact X Layer contract");
  for (const [key, t] of Object.entries(TOKEN_IDENTITIES)) {
    const prior = existing?.icons[t.slug];
    if (prior?.sourceKind === "PINNED") {
      icons[t.slug] = prior;
      console.log(`  keep   ${key.padEnd(8)} pinned by hand`);
      continue;
    }
    try {
      const infoUrl = contractInfoUrl(t.address);
      const res = await fetch(infoUrl);
      if (!res.ok) throw new Error(`token info HTTP ${res.status}`);
      const body = (await res.json()) as {data?: {attributes?: {image_url?: string}}};
      const img = body.data?.attributes?.image_url;
      if (!img || img === "missing.png") throw new Error("no image_url for this contract");

      const buf = await download(img);
      const path = write("tokens", `${t.slug}.png`, buf);
      icons[t.slug] = record(buf, path, img, "CONTRACT", `resolved by contract ${t.address}`);
      console.log(`  ok     ${key.padEnd(8)} ${buf.byteLength.toString().padStart(7)}B  contract`);
    } catch (e) {
      failures.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nresolving network and native-token identity");
  for (const [key, n] of Object.entries(NETWORK_IDENTITIES)) {
    const prior = existing?.icons[n.slug];
    if (prior?.sourceKind === "PINNED") {
      icons[n.slug] = prior;
      console.log(`  keep   ${key.padEnd(8)} pinned by hand`);
      continue;
    }
    try {
      let imageUrl: string = n.sourceUrl;
      if (n.kind === "native") {
        const res = await fetch(
          `${n.sourceUrl}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
        );
        if (!res.ok) throw new Error(`coin info HTTP ${res.status}`);
        const body = (await res.json()) as {image?: {large?: string}};
        if (!body.image?.large) throw new Error("no image on coin entry");
        imageUrl = body.image.large;
      }
      const buf = await download(imageUrl);
      const path = write("networks", `${n.slug}.png`, buf);
      icons[n.slug] = record(buf, path, imageUrl, n.sourceKind);
      console.log(`  ok     ${key.padEnd(8)} ${buf.byteLength.toString().padStart(7)}B  ${n.sourceKind.toLowerCase()}`);
    } catch (e) {
      failures.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  mkdirSync(dirname(manifestPath), {recursive: true});
  const manifest: IconManifest = {generatedAt: new Date().toISOString(), icons};
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const equityCount = SHIPPED.filter((s) => icons[s]).length;
  console.log(
    `\n${equityCount}/${SHIPPED.length} equities · ` +
      `${Object.keys(TOKEN_IDENTITIES).filter((k) => icons[TOKEN_IDENTITIES[k as keyof typeof TOKEN_IDENTITIES].slug]).length}/${Object.keys(TOKEN_IDENTITIES).length} tokens · ` +
      `${Object.keys(NETWORK_IDENTITIES).filter((k) => icons[NETWORK_IDENTITIES[k as keyof typeof NETWORK_IDENTITIES].slug]).length}/${Object.keys(NETWORK_IDENTITIES).length} network`,
  );
  console.log(`manifest: packages/assets/icons/manifest.json`);

  if (failures.length > 0) {
    console.error(`\nFAILED — every shipped asset must have a real icon:`);
    for (const f of failures) console.error(`  ${f}`);
    console.error(`\nPin a verified source in icons.ts rather than allowing a placeholder.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
