/// Asset identity, in place of an avatar.
///
/// Deterministic hue from the ticker so the same asset always reads the same way, at low
/// saturation so a market list does not turn into a rainbow. This is identity, not status —
/// status colour stays reserved for filled, waiting and failed.
export function AssetGlyph({symbol, size = 34}: {symbol: string; size?: number}) {
  const label = symbol.replace(/x$/, "").slice(0, 4);
  const hue = hashHue(symbol);
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "grid",
        placeItems: "center",
        borderRadius: Math.round(size * 0.3),
        background: `oklch(0.93 0.035 ${hue})`,
        color: `oklch(0.42 0.09 ${hue})`,
        fontSize: Math.max(9, Math.round(size * 0.31)),
        fontWeight: 600,
        letterSpacing: "-0.02em",
        fontVariantNumeric: "normal",
      }}
    >
      {label}
    </span>
  );
}

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}
