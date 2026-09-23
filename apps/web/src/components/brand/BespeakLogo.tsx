/// The Bespeak identity, served from the brand system's SVG masters.
///
/// The mark is not rebuilt in markup. The kit's lockup is a single deterministic master
/// with the required clear space already inside its 1200x320 box, so sizing the box is the
/// only correct way to place it — any hand-drawn approximation drifts from the master the
/// moment either side changes.
///
/// Light and dark are two different files rather than one file under a filter: the reversed
/// lockup is fully white, including the execution node that is blue on light, so a filter
/// could not produce it. Both variants render and CSS reveals the right one, which keeps the
/// correct mark on screen through the theme bootstrap with no flash and no client JS.
///
/// Plain <img> rather than next/image: these are SVG masters, which the image optimiser
/// would need `dangerouslyAllowSVG` to touch and could not improve on.

const LOCKUP_RATIO = 1200 / 320;

/// Horizontal lockup. `height` is the box height; the wordmark's cap height is ~40% of it.
export function BespeakLogo({height = 32, className}: {height?: number; className?: string}) {
  const width = Math.round(height * LOCKUP_RATIO);
  const common = {width, height, alt: "Bespeak", draggable: false} as const;
  return (
    <span className={className ? `blogo ${className}` : "blogo"} style={{height}}>
      <img {...common} className="blogo-light" src="/brand/logos/bespeak-logo-primary.svg" />
      <img {...common} className="blogo-dark" src="/brand/logos/bespeak-logo-reversed.svg" />
    </span>
  );
}

/// Standalone mark for anywhere the lockup would be under its 96px minimum width.
export function BespeakMark({size = 22, className}: {size?: number; className?: string}) {
  const common = {width: size, height: size, alt: "Bespeak", draggable: false} as const;
  return (
    <span className={className ? `blogo ${className}` : "blogo"} style={{height: size}}>
      <img {...common} className="blogo-light" src="/brand/logos/bespeak-micro-primary.svg" />
      <img {...common} className="blogo-dark" src="/brand/logos/bespeak-micro-white.svg" />
    </span>
  );
}
