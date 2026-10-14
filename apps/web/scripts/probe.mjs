#!/usr/bin/env node
/**
 * Measure real layout boxes at a real viewport, over CDP.
 *
 * Same reason shot.mjs exists: `--window-size` is clamped to a 500px minimum, so anything
 * measured without Emulation.setDeviceMetricsOverride is measuring a viewport the user
 * never has. This evaluates an expression in the page and prints the result.
 *
 * Usage: node scripts/probe.mjs <url> <width> <height> '<js expression>'
 */
import {spawn} from "node:child_process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [, , url, wArg, hArg, expression] = process.argv;
const width = Number(wArg ?? 390);
const height = Number(hArg ?? 800);
const port = 9222 + Math.floor(Math.random() * 900);

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/bespeak-probe-${port}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function page() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const p = list.find((t) => t.type === "page");
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {
      // Chrome has not opened the port yet.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("no debuggable page");
}

const ws = new WebSocket(await page());
await new Promise((r) => (ws.onopen = r));

let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    pending.set(n, res);
    ws.send(JSON.stringify({id: n, method, params}));
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: width < 820,
});
await send("Page.navigate", {url});
await new Promise((r) => setTimeout(r, 5000));

const out = await send("Runtime.evaluate", {
  expression: `JSON.stringify((() => { ${expression} })())`,
  returnByValue: true,
  awaitPromise: true,
});

console.log(out.result?.result?.value ?? JSON.stringify(out.result ?? out));
ws.close();
chrome.kill();
process.exit(0);
