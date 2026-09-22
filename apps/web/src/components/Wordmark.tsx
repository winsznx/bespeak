/// The Bespeak mark: two moments joined by a line.
///
/// A solid dot is the commitment made now, the line is the wait the user does not sit
/// through, and the open ring is execution later on their condition. It reads left to
/// right as the product's whole sentence and stays true if Bespeak ever executes something
/// other than equities — nothing in it is a candlestick, a coin or a clock.
export function Wordmark({size = 19, showText = true}: {size?: number; showText?: boolean}) {
  return (
    <span
      className="row"
      style={{gap: 9, fontWeight: 600, fontSize: 17, letterSpacing: "-0.03em", color: "var(--ink)"}}
    >
      <Mark size={size} />
      {showText && <span>Bespeak</span>}
    </span>
  );
}

export function Mark({size = 19, tone = "currentColor"}: {size?: number; tone?: string}) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="4" cy="10" r="3" fill={tone === "brand" ? "var(--brand)" : tone} />
      <path
        d="M8.4 10H12"
        stroke={tone === "brand" ? "var(--brand)" : tone}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.4"
      />
      <circle
        cx="16"
        cy="10"
        r="2.9"
        stroke={tone === "brand" ? "var(--brand)" : tone}
        strokeWidth="1.6"
      />
    </svg>
  );
}
