import {iconFor, DARK_PLATE_KEYS} from "@/lib/identity";
import {Logo} from "./Logo";

const SIZE = {xs: 16, sm: 20, md: 26, lg: 34} as const;

/// Payment-token identity. Plain "USDG" text is not enough where a user is deciding what
/// they are about to spend, so the token always carries its mark in primary financial
/// surfaces. Density is chosen by the caller: xs in tables, md in transaction flows.
export function TokenIdentity({
  symbol,
  size = "sm",
  showLabel = true,
  muted = false,
}: {
  symbol: string;
  size?: keyof typeof SIZE;
  showLabel?: boolean;
  muted?: boolean;
}) {
  const key = symbol.toLowerCase();
  const src = iconFor(key);
  const px = SIZE[size];

  return (
    <span className="row g2" style={{minWidth: 0}}>
      {src && (
        <Logo
          src={src}
          alt={showLabel ? "" : `${symbol} logo`}
          size={px}
          radius={px / 2}
          ring={DARK_PLATE_KEYS.has(key)}
        />
      )}
      {showLabel && (
        <span
          className="truncate"
          style={{fontWeight: 500, color: muted ? "var(--ink-2)" : undefined}}
        >
          {symbol}
        </span>
      )}
    </span>
  );
}

/// Network identity. A coloured dot alone is a health indicator, not an identity, so the
/// chain always shows its actual mark and the dot is kept as a separate status signal.
export function NetworkIdentity({
  size = 18,
  showLabel = true,
  status,
}: {
  size?: number;
  showLabel?: boolean;
  status?: "ok" | "warn";
}) {
  const src = iconFor("x-layer");
  return (
    <span className="row g2" style={{minWidth: 0}}>
      {src && <Logo src={src} alt={showLabel ? "" : "X Layer"} size={size} radius={size / 2} ring />}
      {showLabel && <span className="truncate">X Layer</span>}
      {status && (
        <span
          aria-hidden="true"
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            flex: "none",
            background: status === "ok" ? "var(--success)" : "var(--waiting)",
          }}
        />
      )}
    </span>
  );
}
