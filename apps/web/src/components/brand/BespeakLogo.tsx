/// The Bespeak identity, served from the brand system's SVG masters.
///
/// The mark is not rebuilt in markup. The kit's lockup is a single deterministic master
/// with the required clear space already inside its 1200x320 box, so sizing the box is the
/// only correct way to place it — any hand-drawn approximation drifts from the master the
/// moment either side changes.
///
/// One element, never two. The reversed master is a separate file because it is fully
/// white, including the execution node that is blue on light, which no filter over the
/// light file could produce. An earlier version put both files in the DOM and hid one with
/// CSS; that renders the wordmark twice the moment the stylesheet is stale, missing or
/// late, which is an unacceptable failure mode for a logo. The element instead carries the
/// light master as its real `src` and CSS swaps in the reversed file for dark themes, so
/// the worst case is the light lockup on a dark surface rather than two lockups.
///
/// Plain <img> rather than next/image: these are SVG masters, which the image optimiser
/// would need `dangerouslyAllowSVG` to touch and could not improve on.

const LOCKUP_RATIO = 1200 / 320;

/// Horizontal lockup. `height` is the box height; the wordmark's cap height is ~40% of it.
export function BespeakLogo({height = 32, className}: {height?: number; className?: string}) {
  return (
    <span className={className ? `blogo ${className}` : "blogo"} style={{height}}>
      <img
        className="blogo-lockup"
        src="/brand/logos/bespeak-logo-primary.svg"
        width={Math.round(height * LOCKUP_RATIO)}
        height={height}
        alt="Bespeak"
        draggable={false}
      />
    </span>
  );
}

/// Standalone mark for anywhere the lockup would be under its 96px minimum width.
export function BespeakMark({size = 22, className}: {size?: number; className?: string}) {
  return (
    <span className={className ? `blogo ${className}` : "blogo"} style={{height: size}}>
      <img
        className="blogo-micro"
        src="/brand/logos/bespeak-micro-primary.svg"
        width={size}
        height={size}
        alt="Bespeak"
        draggable={false}
      />
    </span>
  );
}
