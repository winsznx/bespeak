#!/usr/bin/env node
/**
 * Screenshot helper driving Chrome over CDP.
 *
 * Plain `--headless --window-size=390,H` does NOT produce a 390px viewport: Chrome clamps
 * the window to a 500px minimum and the screenshot is then cropped, which looks exactly
 * like a broken responsive layout. Emulation.setDeviceMetricsOverride sets the real
 * viewport, so mobile output is trustworthy.
 *
 * Usage: node scripts/shot.mjs <url> <out.png> <width> <height> [--full]
 */
import {spawn} from "node:child_process";
import {writeFileSync, mkdirSync} from "node:fs";
import {dirname} from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [, , url, out, wArg, hArg, ...rest] = process.argv;
const width = Number(wArg ?? 1440);
const height = Number(hArg ?? 900);
const full = rest.includes("--full");
const port = 9222 + Math.floor(Math.random() * 900);

const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-color-profile=srgb",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  "--user-data-dir=/tmp/bespeak-shot-profile-" + port,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

async function targets() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const j = await r.json();
      const page = j.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      /* chrome not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("chrome did not expose a debugging target");
}

const ws = new WebSocket(await targets());
let id = 0;
const waiting = new Map();

ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && waiting.has(msg.id)) {
    waiting.get(msg.id)(msg.result);
    waiting.delete(msg.id);
  }
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const n = ++id;
    waiting.set(n, resolve);
    ws.send(JSON.stringify({id: n, method, params}));
  });
}

await new Promise((r) => ws.addEventListener("open", r, {once: true}));

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width,
  height,
  deviceScaleFactor: 2,
  mobile: width < 768,
});
await send("Page.navigate", {url});
await new Promise((r) => setTimeout(r, Number(process.env.SHOT_WAIT ?? 6500)));

const shot = await send("Page.captureScreenshot", {
  format: "png",
  captureBeyondViewport: full,
});

mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, Buffer.from(shot.data, "base64"));

// Report any element genuinely wider than the viewport, so a real overflow is caught.
const probe = await send("Runtime.evaluate", {
  expression: `(() => {
    const w = document.documentElement.clientWidth;
    const bad = [];
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width > w + 1) bad.push(el.tagName + '.' + String(el.className).slice(0,40) + ' w=' + Math.round(r.width));
    });
    return JSON.stringify({w, scroll: document.documentElement.scrollWidth, bad: bad.slice(0,6)});
  })()`,
  returnByValue: true,
});

console.log(out, probe.result?.value ?? "");
ws.close();
chrome.kill();
process.exit(0);
