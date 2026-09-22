"use client";

import {useEffect, useState} from "react";

/// Time until the next regular session, counted down live.
///
/// Rendered client-side and only after mount, because a server-rendered countdown would
/// hydrate to a different value. It is a display hint: eligibility is decided by the
/// condition source at execution time, never by this clock.
export function Countdown({to}: {to: string}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const target = new Date(to).getTime();
    function tick() {
      const ms = target - Date.now();
      if (ms <= 0) {
        setLabel("now");
        return;
      }
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      setLabel(h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m ${String(s).padStart(2, "0")}s`);
    }
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [to]);

  return <span suppressHydrationWarning>{label ?? "—"}</span>;
}
