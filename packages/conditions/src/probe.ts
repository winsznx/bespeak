import {observeSessions} from "./session.js";
import {MarketStatus} from "@bespeak/shared";

const NAMES = Object.fromEntries(
  Object.entries(MarketStatus).map(([k, v]) => [v, k]),
) as Record<number, string>;

/// Read the live session state for the launch assets. This is the exact observation the
/// keeper signs, printed so it can be checked by hand against the issuer's own site.
async function main() {
  const obs = await observeSessions([
    "NVDAx", "TSLAx", "AAPLx", "MSFTx", "SPYx", "QQQx",
    "AMZNx", "GOOGLx", "METAx", "AMDx", "COINx", "MSTRx",
  ]);

  console.log(`observed at ${new Date().toISOString()} (UTC)\n`);
  console.log("symbol    status       period      openNow  halted  nextChangeAt");
  for (const [symbol, o] of obs) {
    console.log(
      `${symbol.padEnd(9)} ${NAMES[o.marketStatus]!.padEnd(12)} ${o.raw.currentPeriod.padEnd(11)} ` +
        `${String(o.raw.openNow).padEnd(8)} ${String(o.halted).padEnd(7)} ${o.raw.nextChangeAt}`,
    );
  }

  const regular = [...obs.values()].filter((o) => o.marketStatus === MarketStatus.REGULAR).length;
  console.log(
    `\n${regular}/${obs.size} assets currently in REGULAR session ` +
      `(the only state that satisfies a NEXT_REGULAR_SESSION order).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
