import {sampleSpreads} from "./sampler.js";

/// Take one spread sample and print it, without writing anywhere.
///
/// The dataset is a public claim about how xStocks price on X Layer, so the measurement has
/// to be inspectable by hand before it is published on a schedule. Run with `--json` to get
/// the rows the keeper would have stored.
const json = process.argv.includes("--json");

const rows = await sampleSpreads();

if (json) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const num = (v: number | null, d = 2) => (v === null ? "n/a" : v.toFixed(d));
  console.log(
    pad("asset", 8) + pad("session", 11) + pad("mid", 12) + pad("buy", 12) +
    pad("sell", 12) + pad("round trip", 12) + "note",
  );
  console.log("-".repeat(90));
  for (const r of rows) {
    console.log(
      pad(r.symbol, 8) +
      pad(r.session, 11) +
      pad(num(r.midPx, 4), 12) +
      pad(num(r.buyPx, 4), 12) +
      pad(num(r.sellPx, 4), 12) +
      pad(r.roundTripBps === null ? "n/a" : `${r.roundTripBps.toFixed(1)} bps`, 12) +
      (r.note ?? ""),
    );
  }
  const ok = rows.filter((r) => r.ok === 1);
  const avg = ok.length
    ? ok.reduce((s, r) => s + (r.roundTripBps ?? 0), 0) / ok.length
    : null;
  console.log("-".repeat(90));
  console.log(`${ok.length}/${rows.length} quoted` + (avg === null ? "" : `, mean round trip ${avg.toFixed(1)} bps`));
}
