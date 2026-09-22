import {Skeleton} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <Skeleton w={80} h={12} style={{marginBottom: 18}} />
      <div className="asset-head">
        <div>
          <div className="row g4" style={{marginBottom: 20}}>
            <Skeleton w={48} h={48} r={15} />
            <div className="col g2">
              <Skeleton w={170} h={24} r={7} />
              <Skeleton w={220} h={12} />
            </div>
          </div>
          <div className="facts">
            {[0, 1, 2].map((i) => (
              <div className="fact" key={i}>
                <Skeleton w={110} h={10} style={{marginBottom: 12}} />
                <Skeleton w="64%" h={22} r={7} style={{marginBottom: 8}} />
                <Skeleton w="82%" h={10} />
              </div>
            ))}
          </div>
        </div>
        <div className="module module-pad">
          <Skeleton w={110} h={10} style={{marginBottom: 14}} />
          <Skeleton w="72%" h={22} r={7} style={{marginBottom: 12}} />
          <Skeleton w="100%" h={30} style={{marginBottom: 18}} />
          <Skeleton w="100%" h={42} r={12} style={{marginBottom: 8}} />
          <Skeleton w="100%" h={42} r={12} />
        </div>
      </div>
      <Skeleton w={300} h={28} r={8} style={{marginBottom: 20}} />
      <Skeleton w="100%" h={104} r={20} style={{marginBottom: 14}} />
      <Skeleton w="100%" h={120} r={12} />
    </>
  );
}
