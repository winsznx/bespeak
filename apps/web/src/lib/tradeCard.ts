/// Render a receipt as a shareable Bespeak card, on a canvas, at print-grade resolution.
///
/// Drawn rather than screenshotted. A screenshot carries whatever the page happened to look
/// like at that viewport, at that theme, with that scroll position, and bakes in interface
/// furniture nobody wants in a shared image. Drawing it means the card is the same every
/// time and the resolution is a parameter rather than a function of someone's monitor.
///
/// The card leads with what a reader can check for themselves: the condition that released
/// the order, the time, and the full transaction hash. Amounts are optional, because the
/// usual reason to share one is to show that a thing happened, not to publish a position.

export type CardSize = "2k" | "4k";
export type CardTheme = "dark" | "light";

export interface TradeCardData {
  symbol: string;
  underlying: string;
  assetName: string;
  side: "BUY" | "SELL";
  /// Rendered verbatim. A card that showed PARTIALLY_VERIFIED as "filled" would be the
  /// exact overstatement this product exists to refuse.
  outcome: string;
  conditionIntent: string;
  observedAt?: string | null;
  submittedAt?: string | null;
  verifiedAt?: string | null;
  transactionHash: string;
  blockNumber?: string | null;
  confirmations?: number | null;
  checksPassed?: number | null;
  checksTotal?: number | null;
  broadcastSource?: string | null;
  verificationSource?: string | null;
  receiptVersion?: string | null;
  /// Already formatted and rounded by the caller. Hidden unless asked for.
  amountIn?: string | null;
  amountOut?: string | null;
  /// Shown on the flow row whether or not amounts are.
  fromSymbol: string;
  toSymbol: string;
  /// Same-origin icon paths. Same origin matters: a cross-origin image taints the canvas
  /// and `toBlob` then throws, so the download would silently stop working.
  fromIcon?: string | null;
  toIcon?: string | null;
}

export interface CardOptions {
  size: CardSize;
  theme: CardTheme;
  showAmounts: boolean;
  siteLabel: string;
}

const DIMS: Record<CardSize, {w: number; h: number}> = {
  "2k": {w: 2560, h: 1440},
  "4k": {w: 3840, h: 2160},
};

interface Palette {
  backdrop: string;
  backdropEdge: string;
  glow: string;
  card: string;
  ink: string;
  muted: string;
  line: string;
  tileEdge: string;
  headerInk: string;
  headerMuted: string;
  baseInk: string;
  baseStrong: string;
}

/// Both themes are the product's own tokens, not an inversion. Dark is the deep navy the
/// brand uses for reversed surfaces; light is the warm paper the app sits on.
const PALETTES: Record<CardTheme, Palette> = {
  dark: {
    backdrop: "#071321",
    backdropEdge: "#0B1B31",
    glow: "rgba(31,111,229,0.30)",
    card: "#F7F7F4",
    ink: "#11171D",
    muted: "#6F7883",
    line: "#D9DDE1",
    tileEdge: "rgba(17,23,29,0.08)",
    headerInk: "#FFFFFF",
    headerMuted: "#8FA6C4",
    baseInk: "#7E93AE",
    baseStrong: "#A8BFDC",
  },
  light: {
    backdrop: "#EEEFEA",
    backdropEdge: "#E4E6E0",
    glow: "rgba(31,111,229,0.14)",
    card: "#FFFFFF",
    ink: "#11171D",
    muted: "#686E74",
    line: "#D9DDE1",
    tileEdge: "rgba(17,23,29,0.08)",
    headerInk: "#11171D",
    headerMuted: "#6F7883",
    baseInk: "#6F7883",
    baseStrong: "#1F6FE5",
  },
};

const STATUS = {
  success: "#1D8B55",
  waiting: "#B56D13",
  danger: "#C94343",
  brand: "#1F6FE5",
};

/// Only VERIFIED_FILLED is green. Everything else is a weaker claim and must not borrow the
/// colour reserved for a confirmed outcome.
function outcomeTone(outcome: string): string {
  if (outcome === "VERIFIED_FILLED") return STATUS.success;
  if (outcome === "CONTRADICTED" || outcome === "ROLLED_BACK") return STATUS.danger;
  return STATUS.waiting;
}

function clock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : `${d.toISOString().slice(11, 19)} UTC`;
}

function longDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {day: "numeric", month: "long", year: "numeric", timeZone: "UTC"});
}

function families(): {sans: string; serif: string; mono: string} {
  if (typeof window === "undefined") return {sans: "sans-serif", serif: "serif", mono: "monospace"};
  const cs = getComputedStyle(document.documentElement);
  const pick = (v: string, fb: string) => {
    const name = cs.getPropertyValue(v).trim();
    return name ? `${name}, ${fb}` : fb;
  };
  return {
    sans: pick("--font-sans", "system-ui, sans-serif"),
    serif: pick("--font-serif", "Georgia, serif"),
    mono: pick("--font-mono", "ui-monospace, monospace"),
  };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/// The Bespeak mark, drawn as geometry so the card never renders with a missing logo.
function mark(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x + s * 0.17, y + s * 0.5, s * 0.125, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(x + s * 0.3, y + s * 0.455, s * 0.22, s * 0.09);
  ctx.beginPath();
  ctx.arc(x + s * 0.7, y + s * 0.5, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
}

/// Load an icon, resolving to null rather than rejecting. A missing token mark degrades to
/// a card without it, never to no card at all.
function loadIcon(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src || typeof window === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function tile(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | null,
  x: number,
  y: number,
  size: number,
  fallback: string,
  pal: Palette,
  family: string,
): void {
  const r = size * 0.28;
  ctx.save();
  roundRect(ctx, x, y, size, size, r);
  ctx.clip();
  if (img) {
    // contain, so a non-square mark is never stretched
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  } else {
    ctx.fillStyle = pal.line;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = pal.muted;
    ctx.font = `700 ${size * 0.34}px ${family}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(fallback.slice(0, 2).toUpperCase(), x + size / 2, y + size / 2);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }
  ctx.restore();
  ctx.strokeStyle = pal.tileEdge;
  ctx.lineWidth = Math.max(1, size * 0.012);
  roundRect(ctx, x, y, size, size, r);
  ctx.stroke();
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, k: number, colour: string): void {
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3 * k;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + len - 16 * k, y);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(x + len, y);
  ctx.lineTo(x + len - 18 * k, y - 9 * k);
  ctx.lineTo(x + len - 18 * k, y + 9 * k);
  ctx.closePath();
  ctx.fill();
}

/// Letterspacing, which canvas has no property for. Used only on the small caps labels.
function tracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/// Shrink to fit. Used for the hash, which is 66 characters and must never be clipped or
/// ellipsised: a partial hash is not checkable.
function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startPx: number,
  family: string,
  weight = "500",
): number {
  let px = startPx;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxWidth && px > 8) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  return px;
}

export async function drawTradeCard(
  canvas: HTMLCanvasElement,
  data: TradeCardData,
  opts: CardOptions,
): Promise<void> {
  const {w, h} = DIMS[opts.size];
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context unavailable");

  // Authored against a 2560 wide frame and scaled, so 4K is the same card at twice the
  // detail rather than a different layout.
  const k = w / 2560;
  const f = families();
  const pal = PALETTES[opts.theme];

  // Fonts must resolve before the first measureText, or every width computed from it is
  // wrong and the layout drifts.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // A browser that cannot report readiness still draws, and the fallback stack is
      // metrically close enough that nothing clips.
    }
  }

  const [assetImg, fromImg, toImg] = await Promise.all([
    loadIcon(data.side === "SELL" ? data.fromIcon : data.toIcon),
    loadIcon(data.fromIcon),
    loadIcon(data.toIcon),
  ]);

  // ---------------------------------------------------------------- backdrop
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, pal.backdrop);
  bg.addColorStop(1, pal.backdropEdge);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const glow = ctx.createRadialGradient(w * 0.86, h * -0.1, 0, w * 0.86, h * -0.1, w * 0.46);
  glow.addColorStop(0, pal.glow);
  glow.addColorStop(1, "rgba(31,111,229,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const pad = 116 * k;

  // ---------------------------------------------------------------- header
  mark(ctx, pad, 74 * k, 62 * k, pal.headerInk);
  ctx.fillStyle = pal.headerInk;
  ctx.font = `700 ${48 * k}px ${f.sans}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Bespeak", pad + 76 * k, 121 * k);

  ctx.fillStyle = pal.headerMuted;
  ctx.font = `600 ${20 * k}px ${f.sans}`;
  const label = "EXECUTION RECEIPT";
  const trackW =
    [...label].reduce((n, c) => n + ctx.measureText(c).width, 0) + (label.length - 1) * 5 * k;
  tracked(ctx, label, w - pad - trackW, 115 * k, 5 * k);

  // ---------------------------------------------------------------- card
  const cardX = pad;
  const cardY = 182 * k;
  const cardW = w - pad * 2;
  const cardH = h - cardY - 120 * k;

  ctx.save();
  ctx.shadowColor = opts.theme === "dark" ? "rgba(0,0,0,0.5)" : "rgba(17,23,29,0.14)";
  ctx.shadowBlur = 70 * k;
  ctx.shadowOffsetY = 26 * k;
  ctx.fillStyle = pal.card;
  roundRect(ctx, cardX, cardY, cardW, cardH, 34 * k);
  ctx.fill();
  ctx.restore();

  const ix = cardX + 74 * k;
  const iw = cardW - 148 * k;

  const smallCap = (text: string, x: number, y: number) => {
    ctx.fillStyle = pal.muted;
    ctx.font = `700 ${19 * k}px ${f.sans}`;
    tracked(ctx, text, x, y, 3.4 * k);
  };

  // ---- identity row
  const tileSize = 104 * k;
  const tileY = cardY + 62 * k;
  tile(ctx, assetImg, ix, tileY, tileSize, data.underlying, pal, f.sans);

  const tx = ix + tileSize + 28 * k;
  ctx.fillStyle = pal.ink;
  ctx.font = `700 ${70 * k}px ${f.sans}`;
  ctx.fillText(data.symbol, tx, tileY + 48 * k);
  const tickerW = ctx.measureText(data.symbol).width;

  ctx.fillStyle = data.side === "SELL" ? STATUS.waiting : STATUS.brand;
  ctx.font = `700 ${21 * k}px ${f.sans}`;
  tracked(ctx, data.side === "SELL" ? "SOLD" : "BOUGHT", tx + tickerW + 22 * k, tileY + 48 * k, 3.2 * k);

  ctx.fillStyle = pal.muted;
  ctx.font = `500 ${26 * k}px ${f.sans}`;
  ctx.fillText(`${data.assetName} · tokenized equity on X Layer`, tx, tileY + 90 * k);

  // ---- outcome pill
  const tone = outcomeTone(data.outcome);
  const pillLabel = data.outcome.replace(/_/g, " ");
  ctx.font = `700 ${23 * k}px ${f.sans}`;
  const pillTextW =
    [...pillLabel].reduce((n, c) => n + ctx.measureText(c).width, 0) + (pillLabel.length - 1) * 3 * k;
  const pillW = pillTextW + 92 * k;
  const pillH = 62 * k;
  const pillX = cardX + cardW - 74 * k - pillW;
  const pillY = tileY + 10 * k;

  ctx.fillStyle = `${tone}1A`;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = `${tone}4D`;
  ctx.lineWidth = 2 * k;
  roundRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(pillX + 34 * k, pillY + pillH / 2, 9 * k, 0, Math.PI * 2);
  ctx.fill();
  tracked(ctx, pillLabel, pillX + 56 * k, pillY + pillH / 2 + 8 * k, 3 * k);

  let y = tileY + tileSize + 48 * k;
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(ix, y);
  ctx.lineTo(ix + iw, y);
  ctx.stroke();

  // ---- condition
  y += 52 * k;
  smallCap("CONDITION THAT RELEASED THIS ORDER", ix, y);
  y += 54 * k;
  const condition = `“${data.conditionIntent}”`;
  const condPx = fitText(ctx, condition, iw, 52 * k, f.serif, "italic 400");
  ctx.fillStyle = pal.ink;
  ctx.font = `italic 400 ${condPx}px ${f.serif}`;
  ctx.fillText(condition, ix, y);

  // ---- the flow, with real token marks
  y += 70 * k;
  const fs = 60 * k;
  tile(ctx, fromImg, ix, y - fs * 0.72, fs, data.fromSymbol, pal, f.sans);
  ctx.fillStyle = pal.ink;
  ctx.font = `600 ${34 * k}px ${f.sans}`;
  const fromText = opts.showAmounts && data.amountIn ? data.amountIn : data.fromSymbol;
  ctx.fillText(fromText, ix + fs + 18 * k, y);
  const fromW = ctx.measureText(fromText).width;

  const ax = ix + fs + 18 * k + fromW + 34 * k;
  arrow(ctx, ax, y - 11 * k, 62 * k, k, pal.line);

  const tox = ax + 62 * k + 30 * k;
  tile(ctx, toImg, tox, y - fs * 0.72, fs, data.toSymbol, pal, f.sans);
  ctx.fillStyle = pal.ink;
  ctx.font = `600 ${32 * k}px ${f.sans}`;
  ctx.fillText(
    opts.showAmounts && data.amountOut ? data.amountOut : data.toSymbol,
    tox + fs + 18 * k,
    y,
  );

  // ---- two columns
  y += 74 * k;
  const colW = iw / 2;
  smallCap("EXECUTED", ix, y);
  smallCap("VERIFICATION", ix + colW, y);

  y += 48 * k;
  ctx.fillStyle = pal.ink;
  ctx.font = `600 ${42 * k}px ${f.sans}`;
  ctx.fillText(longDate(data.verifiedAt ?? data.submittedAt), ix, y);
  ctx.fillText(
    data.checksPassed != null && data.checksTotal
      ? `${data.checksPassed} of ${data.checksTotal} checks`
      : "Independently read back",
    ix + colW,
    y,
  );

  let ty = y + 46 * k;
  const times: Array<[string, string]> = [];
  const obs = clock(data.observedAt);
  const sub = clock(data.submittedAt);
  const ver = clock(data.verifiedAt);
  if (obs) times.push([obs, "condition observed"]);
  if (sub) times.push([sub, "transaction submitted"]);
  if (ver) times.push([ver, "independently verified"]);
  for (const [t, what] of times) {
    ctx.fillStyle = pal.ink;
    ctx.font = `500 ${24 * k}px ${f.mono}`;
    ctx.fillText(t, ix, ty);
    ctx.fillStyle = pal.muted;
    ctx.font = `400 ${24 * k}px ${f.sans}`;
    ctx.fillText(what, ix + 196 * k, ty);
    ty += 38 * k;
  }

  let vy = y + 46 * k;
  const right: Array<[string, string]> = [];
  if (data.broadcastSource) right.push(["Broadcast on", data.broadcastSource.replace(/^https?:\/\//, "")]);
  if (data.verificationSource) right.push(["Read back on", data.verificationSource.replace(/^https?:\/\//, "")]);
  if (data.confirmations) right.push(["Confirmations", String(data.confirmations)]);
  for (const [a, b] of right) {
    ctx.fillStyle = pal.muted;
    ctx.font = `400 ${24 * k}px ${f.sans}`;
    ctx.fillText(a, ix + colW, vy);
    const aw = ctx.measureText(a).width;
    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${24 * k}px ${f.sans}`;
    ctx.fillText(b, ix + colW + aw + 14 * k, vy);
    vy += 38 * k;
  }

  // ---- hash
  //
  // Flows after the content rather than being pinned to the card's bottom edge. Pinned, it
  // left a band of dead space in the middle of the card whenever the timeline was short,
  // which is most of the time. The footer strip stays pinned, so what is left over reads as
  // margin above a rule rather than as a hole in the middle.
  const contentBottom = Math.max(ty, vy);
  const footerDividerY = cardY + cardH - 110 * k;
  const hashBlockH = 104 * k;
  // Centre the hash in whatever is left rather than letting the slack pool underneath it.
  // The timeline is three rows at most and often two, so the leftover is large and visible.
  const free = footerDividerY - contentBottom - hashBlockH;
  const hashY = contentBottom + Math.max(56 * k, Math.min(free * 0.5, 130 * k));
  smallCap("TRANSACTION HASH", ix, hashY);
  // Never ellipsised: a partial hash cannot be checked, which would defeat the only reason
  // this card is worth sharing.
  const hashPx = fitText(ctx, data.transactionHash, iw, 40 * k, f.mono, "500");
  ctx.font = `500 ${hashPx}px ${f.mono}`;
  ctx.fillStyle = pal.ink;
  ctx.fillText(data.transactionHash, ix, hashY + 56 * k);

  // ---- footer strip
  const stripY = cardY + cardH - 62 * k;
  ctx.strokeStyle = pal.line;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(ix, footerDividerY);
  ctx.lineTo(ix + iw, footerDividerY);
  ctx.stroke();

  const facts: Array<[string, string]> = [];
  if (data.blockNumber) facts.push(["Block", Number(data.blockNumber).toLocaleString()]);
  facts.push(["X Layer", "mainnet"], ["Chain", "196"]);
  if (data.receiptVersion) facts.push(["Receipt", `v${data.receiptVersion}`]);

  let fx = ix;
  for (const [a, b] of facts) {
    ctx.fillStyle = pal.muted;
    ctx.font = `400 ${23 * k}px ${f.sans}`;
    ctx.fillText(a, fx, stripY);
    const aw = ctx.measureText(a).width;
    ctx.fillStyle = pal.ink;
    ctx.font = `600 ${23 * k}px ${f.sans}`;
    ctx.fillText(b, fx + aw + 10 * k, stripY);
    fx += aw + 10 * k + ctx.measureText(b).width + 44 * k;
  }

  // ---- base
  ctx.fillStyle = pal.baseStrong;
  ctx.font = `600 ${24 * k}px ${f.sans}`;
  ctx.fillText(opts.siteLabel, pad, h - 54 * k);
  ctx.fillStyle = pal.baseInk;
  ctx.font = `400 ${24 * k}px ${f.sans}`;
  const tail = "Condition-aware standing orders for tokenized equities";
  ctx.fillText(tail, w - pad - ctx.measureText(tail).width, h - 54 * k);
}

export function cardFilename(data: TradeCardData, size: CardSize): string {
  const when = (data.verifiedAt ?? data.submittedAt ?? "").slice(0, 10);
  return `bespeak-${data.symbol.toLowerCase()}-${data.side.toLowerCase()}${when ? `-${when}` : ""}-${size}.png`;
}
