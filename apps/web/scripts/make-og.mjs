#!/usr/bin/env node
/**
 * Renders the social card to a static 1200x630 PNG.
 *
 * Deliberately pre-generated rather than a runtime ImageResponse route: the OpenNext /
 * Cloudflare target runs on workerd, where next/og's WASM-backed renderer is the single
 * most fragile piece of the pipeline. A static file in the build output cannot fail to
 * render, cannot time out, and costs nothing per request. Reliability beats cleverness for
 * something whose entire job is to look right when someone pastes a link.
 *
 * Run: node scripts/make-og.mjs   (after `pnpm dev` is up on :3000)
 */
import {spawn} from "node:child_process";
import {writeFileSync, mkdirSync, readFileSync} from "node:fs";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9400 + Math.floor(Math.random() * 500);

function dataUri(rel) {
  const buf = readFileSync(join(root, "public", rel));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

const nvda = dataUri("assets/equities/nvdax.png");
const usdg = dataUri("assets/tokens/usdg.png");

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Newsreader:ital,wght@1,300;1,400&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#1058c6;font-family:'Instrument Sans',sans-serif;
       color:#fff;display:flex;overflow:hidden;position:relative}
  body::after{content:"";position:absolute;inset:0;
       background:linear-gradient(196deg,#1769e0 0%,#1058c6 54%,#0d47a0 100%);z-index:0}
  .l{position:relative;z-index:1;flex:1;padding:64px 0 64px 68px;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:600;letter-spacing:-.03em}
  h1{font-size:82px;line-height:.97;letter-spacing:-.042em;font-weight:500;margin-top:auto}
  .serif{font-family:'Newsreader',Georgia,serif;font-style:italic;font-weight:400}
  p{margin-top:26px;font-size:23px;line-height:1.42;color:rgba(255,255,255,.74);max-width:24ch}
  .r{position:relative;z-index:1;width:452px;display:flex;align-items:center;padding-right:60px}
  .card{width:100%;background:#fff;color:#111316;border-radius:22px;padding:28px}
  .row{display:flex;align-items:center;gap:13px}
  .nm{font-size:22px;font-weight:600;letter-spacing:-.022em}
  .sub{font-size:14px;color:#9aa0a5;margin-top:2px}
  .grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid #e3e5e2;
        border-bottom:1px solid #e3e5e2;margin:24px 0}
  .c{padding:17px 0}
  .c+.c{border-left:1px solid #e3e5e2;padding-left:19px}
  .lab{font-size:11px;font-weight:500;letter-spacing:.055em;text-transform:uppercase;color:#6e7378}
  .val{font-size:26px;font-weight:500;letter-spacing:-.026em;margin-top:8px}
  .sel{border:1px solid #1769e0;box-shadow:0 0 0 1px #1769e0;border-radius:12px;
       padding:14px 16px;display:flex;align-items:center;justify-content:space-between}
  .sm{font-size:15px;font-weight:600;letter-spacing:-.012em}
  .xs{font-size:12.5px;color:#6e7378;margin-top:2px}
  .dot{width:19px;height:19px;border-radius:999px;background:#1769e0;display:flex;
       align-items:center;justify-content:center}
  .dot i{width:6px;height:6px;border-radius:999px;background:#fff;display:block}
  .amt{display:flex;align-items:center;justify-content:space-between;margin-top:20px}
  img.logo{width:44px;height:44px;border-radius:13px;object-fit:contain}
  img.tok{width:21px;height:21px;border-radius:999px;object-fit:contain}
</style></head><body>
<div class="l">
  <div class="brand">
    <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
      <circle cx="4" cy="10" r="3" fill="#fff"/>
      <path d="M8.4 10H12" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".4"/>
      <circle cx="16" cy="10" r="2.9" stroke="#fff" stroke-width="1.6"/>
    </svg>
    Bespeak
  </div>
  <h1>Set the market<br><span class="serif">moment.</span></h1>
  <p>Condition-aware standing orders for tokenized equities on X Layer.</p>
</div>
<div class="r">
  <div class="card">
    <div class="row">
      <img class="logo" src="${nvda}">
      <div><div class="nm">NVIDIA</div><div class="sub">NVDA · Official xStock</div></div>
    </div>
    <div class="grid">
      <div class="c"><div class="lab">Underlying</div><div class="val">Closed</div></div>
      <div class="c"><div class="lab">X Layer</div><div class="val" style="color:#17794a">Trading</div></div>
    </div>
    <div class="sel">
      <div><div class="sm">Next regular session</div><div class="xs">Tue · 13:30 UTC</div></div>
      <span class="dot"><i></i></span>
    </div>
    <div class="amt">
      <span style="font-size:14px;color:#6e7378">Amount</span>
      <span class="row" style="gap:8px"><span style="font-size:25px;font-weight:500;letter-spacing:-.026em">$500</span><img class="tok" src="${usdg}"></span>
    </div>
  </div>
</div>
</body></html>`;

const tmp = join(root, ".og-tmp.html");
writeFileSync(tmp, html);

const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb",
  `--remote-debugging-port=${port}`, `--user-data-dir=/tmp/og-${port}`, "about:blank",
]);
chrome.stderr.on("data", () => {});

async function target() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const p = (await r.json()).find((t) => t.type === "page");
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("chrome unavailable");
}

const ws = new WebSocket(await target());
let id = 0;
const send = (method, params = {}) =>
  new Promise((res) => {
    const n = ++id;
    const h = (e) => {
      const m = JSON.parse(e.data);
      if (m.id === n) { ws.removeEventListener("message", h); res(m.result); }
    };
    ws.addEventListener("message", h);
    ws.send(JSON.stringify({id: n, method, params}));
  });

await new Promise((r) => ws.addEventListener("open", r, {once: true}));
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {width: 1200, height: 630, deviceScaleFactor: 1, mobile: false});
await send("Page.navigate", {url: `file://${tmp}`});
await new Promise((r) => setTimeout(r, 3500));
const shot = await send("Page.captureScreenshot", {format: "png"});

const out = join(root, "public", "og.png");
mkdirSync(dirname(out), {recursive: true});
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`wrote public/og.png (${Buffer.from(shot.data, "base64").byteLength} bytes)`);

ws.close();
chrome.kill();
process.exit(0);
