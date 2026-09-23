import Image from "next/image";

/// One normalisation wrapper for every logo in the product.
///
/// Official marks are not recoloured to fit the brand — they arrive with their own plates
/// and palettes, and rewriting them would misrepresent the asset. What this does is make
/// them behave consistently: a fixed square, object-fit contain so nothing stretches,
/// centred, and a hairline ring on marks whose own plate is dark so they still separate
/// from a dark surface.
export function Logo({
  src,
  alt,
  size = 32,
  radius,
  ring = false,
}: {
  src: string;
  alt: string;
  size?: number;
  radius?: number;
  ring?: boolean;
}) {
  const r = radius ?? Math.round(size * 0.28);
  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "none",
        display: "block",
        position: "relative",
        borderRadius: r,
        overflow: "hidden",
        boxShadow: ring ? "inset 0 0 0 1px var(--line-2)" : undefined,
        background: "transparent",
      }}
    >
      <Image
        src={src}
        alt={alt}
        width={size * 2}
        height={size * 2}
        style={{width: "100%", height: "100%", objectFit: "contain", display: "block"}}
        unoptimized
      />
    </span>
  );
}
