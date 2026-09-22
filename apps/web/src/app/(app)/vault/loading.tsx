import {Skeleton} from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <>
      <div className="page-head">
        <div>
          <Skeleton w={130} h={26} r={8} style={{marginBottom: 8}} />
          <Skeleton w={330} h={12} />
        </div>
      </div>
      <div className="col g3">
        {[0, 1, 2].map((i) => (
          <div className="module module-pad" key={i}>
            <div className="row g3" style={{marginBottom: 18}}>
              <Skeleton w={38} h={38} r={12} />
              <div className="grow col g2">
                <Skeleton w="34%" h={14} />
                <Skeleton w="52%" h={10} />
              </div>
              <Skeleton w={78} h={25} r={9} />
            </div>
            <Skeleton w="100%" h={54} r={12} />
          </div>
        ))}
      </div>
    </>
  );
}
