import {Skeleton} from "@/components/ui/Skeleton";

/// Mirrors the markets table geometry so nothing shifts when the real rows arrive.
export function MarketsSkeleton() {
  return (
    <>
      <div className="page-head">
        <div>
          <Skeleton w={140} h={26} r={8} style={{marginBottom: 8}} />
          <Skeleton w={320} h={12} />
        </div>
      </div>
      <div className="row wrap g3" style={{marginBottom: 20}}>
        <Skeleton w={320} h={44} r={12} />
        <Skeleton w={240} h={34} r={9} />
      </div>
      <div className="module" style={{padding: "20px 24px"}}>
        {Array.from({length: 8}, (_, i) => (
          <div
            key={i}
            className="row g4"
            style={{padding: "15px 0", borderBottom: i === 7 ? "none" : "1px solid var(--line)"}}
          >
            <Skeleton w={32} h={32} r={10} />
            <div className="grow col g2">
              <Skeleton w={90} h={12} />
              <Skeleton w={130} h={9} />
            </div>
            <Skeleton w={70} h={12} />
            <Skeleton w={60} h={12} />
            <Skeleton w={54} h={25} r={9} />
            <Skeleton w={84} h={34} r={9} />
          </div>
        ))}
      </div>
    </>
  );
}
