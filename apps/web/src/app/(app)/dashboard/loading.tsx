import {Skeleton} from "@/components/ui/Skeleton";

/// Mirrors the dashboard's real geometry so nothing jumps when data lands.
export default function Loading() {
  return (
    <>
      <div className="page-head">
        <div>
          <Skeleton w={150} h={26} r={8} style={{marginBottom: 8}} />
          <Skeleton w={310} h={12} />
        </div>
        <div className="row g2">
          <Skeleton w={130} h={42} r={12} />
          <Skeleton w={100} h={42} r={12} />
        </div>
      </div>

      <div className="sum-row" style={{marginBottom: 16}}>
        {[0, 1, 2, 3].map((i) => (
          <div className="sum" key={i}>
            <Skeleton w={90} h={10} style={{marginBottom: "auto"}} />
            <Skeleton w="62%" h={30} r={8} style={{margin: "10px 0 8px"}} />
            <Skeleton w="76%" h={10} />
          </div>
        ))}
      </div>

      <div className="dash-row-2" style={{marginBottom: 16}}>
        <div className="module module-pad span-2">
          <Skeleton w={160} h={16} style={{marginBottom: 22}} />
          <div className="bars">
            {Array.from({length: 7}, (_, i) => (
              <div className="bar-col" key={i}>
                <Skeleton w="100%" h={148} r={999} style={{maxWidth: 54}} />
                <Skeleton w={12} h={10} />
              </div>
            ))}
          </div>
        </div>
        <div className="module module-pad">
          <Skeleton w={140} h={16} style={{marginBottom: 18}} />
          <Skeleton w={100} h={10} style={{marginBottom: 10}} />
          <Skeleton w="70%" h={26} r={8} style={{marginBottom: 10}} />
          <Skeleton w="54%" h={12} style={{marginBottom: 22}} />
          <Skeleton w={110} h={34} r={9} />
        </div>
        <div className="module module-pad">
          <Skeleton w={110} h={16} style={{marginBottom: 18}} />
          <div className="col g4">
            {[0, 1, 2].map((i) => (
              <div className="row g3" key={i}>
                <Skeleton w={30} h={30} r={10} />
                <div className="grow col g2">
                  <Skeleton w="58%" h={11} />
                  <Skeleton w="38%" h={9} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="dash-row-3">
        {[0, 1, 2].map((i) => (
          <div className="module module-pad" key={i}>
            <Skeleton w={130} h={16} style={{marginBottom: 20}} />
            <div className="col g4">
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} w="100%" h={30} r={10} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
