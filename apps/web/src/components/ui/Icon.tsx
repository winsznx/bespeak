/// Bespeak's icon language.
///
/// One consistent construction: 18px grid, 1.5 stroke, round caps, geometric rather than
/// illustrative. Deliberately narrow — navigation and a handful of controls only. Icons are
/// not sprinkled onto every action, because an interface where everything has a glyph has
/// no hierarchy left to spend.
export type IconName =
  | "home"
  | "markets"
  | "orders"
  | "vault"
  | "demand"
  | "activity"
  | "automations"
  | "settings"
  | "help"
  | "search"
  | "theme"
  | "wallet"
  | "chevron"
  | "arrow"
  | "check"
  | "close"
  | "more";

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

const PATHS: Record<IconName, React.ReactNode> = {
  // A committed point and a later one, the same idea as the wordmark.
  home: (
    <>
      <circle cx="4.5" cy="9" r="2.2" fill="currentColor" stroke="none" />
      <path d="M8.4 9h2.2" opacity="0.5" />
      <circle cx="13.4" cy="9" r="2.2" />
    </>
  ),
  markets: (
    <>
      <path d="M3 13.5V7.5" />
      <path d="M7 13.5V4.5" />
      <path d="M11 13.5V9.5" />
      <path d="M15 13.5V6" />
    </>
  ),
  orders: (
    <>
      <rect x="3" y="3.5" width="12" height="11" rx="2.5" />
      <path d="M6.2 7.5h5.6M6.2 10.8h3.4" />
    </>
  ),
  vault: (
    <>
      <rect x="2.75" y="4" width="12.5" height="10" rx="2.5" />
      <path d="M2.75 7.5h12.5" opacity="0.55" />
      <circle cx="12" cy="10.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  demand: (
    <>
      <path d="M9 2.8v8.4" />
      <path d="M5.8 8l3.2 3.2L12.2 8" />
      <path d="M3.4 14.2h11.2" opacity="0.6" />
    </>
  ),
  activity: (
    <>
      <path d="M2.5 9h3l2-4.5 2.6 9L12.4 9h3.1" />
    </>
  ),
  automations: (
    <>
      <circle cx="6" cy="6" r="2.1" />
      <circle cx="12" cy="12" r="2.1" />
      <path d="M8.1 6h2.2a1.6 1.6 0 0 1 1.6 1.6v2.3" opacity="0.6" />
    </>
  ),
  settings: (
    <>
      <circle cx="9" cy="9" r="2.2" />
      <path d="M9 2.6v1.6M9 13.8v1.6M15.4 9h-1.6M4.2 9H2.6M13.5 4.5l-1.1 1.1M5.6 12.4l-1.1 1.1M13.5 13.5l-1.1-1.1M5.6 5.6L4.5 4.5" opacity="0.62" />
    </>
  ),
  help: (
    <>
      <circle cx="9" cy="9" r="6.4" />
      <path d="M7.2 7.2a1.85 1.85 0 1 1 2.3 1.9c-.35.12-.5.4-.5.75v.4" />
      <circle cx="9" cy="12.6" r="0.75" fill="currentColor" stroke="none" />
    </>
  ),
  search: (
    <>
      <circle cx="8.2" cy="8.2" r="4.7" />
      <path d="M11.8 11.8l3 3" />
    </>
  ),
  theme: (
    <>
      <circle cx="9" cy="9" r="5.6" />
      <path d="M9 3.4v11.2" opacity="0.5" />
      <path d="M9 3.4a5.6 5.6 0 0 1 0 11.2z" fill="currentColor" stroke="none" opacity="0.85" />
    </>
  ),
  wallet: (
    <>
      <rect x="2.6" y="4.4" width="12.8" height="9.2" rx="2.4" />
      <path d="M11.4 9h2.6" />
    </>
  ),
  chevron: <path d="M6.8 4.2L11.4 9l-4.6 4.8" />,
  arrow: (
    <>
      <path d="M3.6 9h10.2" />
      <path d="M10.2 5.4L13.8 9l-3.6 3.6" />
    </>
  ),
  check: <path d="M3.8 9.4l3.4 3.4L14.2 5.8" />,
  close: <path d="M4.6 4.6l8.8 8.8M13.4 4.6l-8.8 8.8" />,
  more: (
    <>
      <circle cx="4.4" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="13.6" cy="9" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
};
