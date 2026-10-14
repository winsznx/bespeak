import type {SessionStat} from "@/lib/dataset";

/// Round-trip cost by session state.
///
/// One measure across four categories, so this is a single series: the bars are one hue at
/// two steps, with the regular session emphasized because it is the condition Bespeak
/// actually gates orders on. Identity is carried by the axis labels, never by colour alone.
///
/// Horizontal, because the category names are words rather than dates and vertical bars
/// would set them at an angle for no gain. Every bar is directly labelled, which is also the
/// relief the lighter step needs: it sits just under 3:1 against the page surface, so the
/// number is never left to be read from the fill.
///
/// Median is the plotted value. A single wide quote in a thin minute moves a mean much
/// further than it moves what anyone would actually pay, and plotting the mean would
/// overstate exactly the effect this dataset exists to report.
export function SpreadChart({stats}: {stats: SessionStat[]}) {
  const plotted = stats.filter((s) => s.medianBps !== null && s.samples > 0);
  if (plotted.length === 0) return null;

  const max = Math.max(...plotted.map((s) => s.medianBps ?? 0), 1);
  const hasOpen = plotted.some((s) => s.session === "market");

  return (
    <figure className="sbar" role="group" aria-label="Median round-trip cost by session state">
      {plotted.map((s) => {
        const v = s.medianBps ?? 0;
        const pct = Math.max((v / max) * 100, 1.5);
        const open = s.session === "market";
        return (
          <div
            key={s.session}
            className="sbar-row"
            title={
              `${s.label}: median ${v.toFixed(1)} bps, mean ${(s.meanBps ?? 0).toFixed(1)} bps, ` +
              `range ${(s.minBps ?? 0).toFixed(1)}–${(s.maxBps ?? 0).toFixed(1)} bps ` +
              `over ${s.samples.toLocaleString()} samples`
            }
          >
            <div className="sbar-label">
              {s.label}
              <span className="sbar-n">{s.samples.toLocaleString()} samples</span>
            </div>
            <div className="sbar-track">
              <div
                className={open ? "sbar-fill sbar-fill-on" : "sbar-fill"}
                style={{width: `${pct}%`}}
              />
            </div>
            <div className="sbar-value">
              {v.toFixed(1)}
              <span className="sbar-unit"> bps</span>
            </div>
          </div>
        );
      })}
      <figcaption className="t-xs faint" style={{marginTop: 14}}>
        Median cost of a round trip at the sampled size. Lower is cheaper.{" "}
        {hasOpen
          ? "The regular session is highlighted because it is the condition Bespeak gates orders on."
          : "No regular-session samples yet, so nothing here is a comparison. Bars are scaled to the largest value shown."}
      </figcaption>
    </figure>
  );
}
