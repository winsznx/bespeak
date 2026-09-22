/// The Bespeak mark: two moments joined by a line.
///
/// A solid dot is the commitment made now; the line is the wait the user does not have to
/// sit through; the open ring is the execution that happens later, on their condition. It
/// reads left to right as the product's whole sentence, and it stays true if Bespeak ever
/// executes something other than equities — nothing in it is a candlestick or a coin.
export function Wordmark({showText = true, size = 18}: {showText?: boolean; size?: number}) {
  return (
    <span className="wordmark">
      <Mark size={size} />
      {showText && <span>Bespeak</span>}
    </span>
  );
}

export function Mark({size = 18}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      role="presentation"
    >
      <circle cx="4" cy="10" r="3" fill="currentColor" />
      <path
        d="M8.4 10H12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.42"
      />
      <circle cx="16" cy="10" r="2.9" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
