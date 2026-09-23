import Link from "next/link";

/// Entity-specific. A user who mistyped a ticker needs to know it was the asset that was
/// not found, not that Bespeak is broken — and the way back is Markets, not the homepage.
export default function AssetNotFound() {
  return (
    <div className="module empty-state" style={{marginTop: 24}}>
      <div className="t-h3">Asset not found</div>
      <p className="t-sm muted prose" style={{maxWidth: "44ch", margin: "0 auto 20px"}}>
        That asset isn&apos;t one Bespeak supports on X Layer. Supported assets have a
        verified on-chain deployment and an executable route.
      </p>
      <Link href="/markets" className="btn">
        Browse markets
      </Link>
    </div>
  );
}
