/// External links carry a restrained affordance so leaving Bespeak is never a surprise,
/// and always open safely. The glyph is static — an arrow that animates on hover is the
/// kind of decoration this product deliberately avoids.
export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={className}>
      {children}
      <ExternalGlyph />
    </a>
  );
}

export function ExternalGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{flex: "none", opacity: 0.55, marginLeft: 5, marginTop: -1}}
    >
      <path d="M4.4 2.4h5.2v5.2" />
      <path d="M9.6 2.4L2.8 9.2" />
    </svg>
  );
}
