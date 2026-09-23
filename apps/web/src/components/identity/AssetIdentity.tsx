import {iconFor} from "@/lib/identity";
import {Logo} from "./Logo";

export type AssetVariant = "compact" | "row" | "header" | "hero";

const SIZE: Record<AssetVariant, number> = {compact: 24, row: 34, header: 44, hero: 60};

/// The single way an equity is identified anywhere in Bespeak.
///
/// No route hand-rolls this. `compact` is for tables and dense lists, `row` for order and
/// activity rows, `header` for page headers, `hero` for the asset page and landing.
export function AssetIdentity({
  symbol,
  underlyingSymbol,
  name,
  variant = "row",
  showName = true,
  sub,
}: {
  /// The xStock symbol, e.g. NVDAx — this is the manifest key.
  symbol: string;
  /// The underlying ticker shown to the user, e.g. NVDA.
  underlyingSymbol: string;
  name?: string;
  variant?: AssetVariant;
  showName?: boolean;
  sub?: React.ReactNode;
}) {
  const src = iconFor(symbol);
  const size = SIZE[variant];

  if (variant === "compact") {
    return (
      <span className="row g2" style={{minWidth: 0}}>
        {src && <Logo src={src} alt="" size={size} />}
        <span className="truncate" style={{fontWeight: 500}}>
          {underlyingSymbol}
        </span>
      </span>
    );
  }

  if (variant === "hero") {
    return (
      <span className="row g4" style={{minWidth: 0}}>
        {src && <Logo src={src} alt={`${name ?? underlyingSymbol} logo`} size={size} />}
        <span style={{minWidth: 0}}>
          <span className="t-h2" style={{display: "block", marginBottom: 3}}>
            {name ?? underlyingSymbol}
          </span>
          <span className="row wrap g2 t-sm muted">
            <span style={{color: "var(--ink)", fontWeight: 500}}>{underlyingSymbol}</span>
            {sub}
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className="row g3" style={{minWidth: 0}}>
      {src && <Logo src={src} alt="" size={size} />}
      <span style={{minWidth: 0}}>
        <span
          className="truncate"
          style={{display: "block", fontWeight: 560, letterSpacing: "-0.012em"}}
        >
          {underlyingSymbol}
        </span>
        {showName && (name || sub) && (
          <span className="t-xs faint truncate" style={{display: "block"}}>
            {sub ?? name}
          </span>
        )}
      </span>
    </span>
  );
}
