/// Skeletons mirror the geometry of what they replace, so nothing shifts when data lands.
export function Skeleton({
  w = "100%",
  h = 14,
  r,
  style,
}: {
  w?: number | string | undefined;
  h?: number | string | undefined;
  r?: number | undefined;
  style?: React.CSSProperties | undefined;
}) {
  return (
    <span
      className="sk"
      aria-hidden="true"
      style={{display: "block", width: w, height: h, borderRadius: r, ...style}}
    />
  );
}

export function SkeletonText({lines = 3, width = ["100%", "92%", "64%"]}: {lines?: number; width?: string[]}) {
  return (
    <span className="col g2" style={{display: "flex"}}>
      {Array.from({length: lines}, (_, i) => (
        <Skeleton key={i} w={width[i % width.length] ?? "100%"} h={11} />
      ))}
    </span>
  );
}
