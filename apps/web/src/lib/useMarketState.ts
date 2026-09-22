"use client";

import {useEffect, useState} from "react";

export interface MarketState {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  marketStatus: string;
  issuerPeriod: string | null;
  halted: boolean;
  nextChangeAt: string | null;
  observedAt: string | null;
  eligibleForRegularSession: boolean;
}

/// Live market state for every supported asset, shared by the order list.
///
/// One poll for the whole page rather than one per card: the session is a property of the
/// market, not of an individual order, and twelve identical requests would be twelve
/// chances to show a user two different answers at once.
export function useMarketState() {
  const [byAssetId, setByAssetId] = useState<Map<string, MarketState>>(new Map());
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/markets");
        if (!res.ok) {
          if (!cancelled) setReachable(false);
          return;
        }
        const data = (await res.json()) as {markets: MarketState[]};
        if (cancelled) return;
        setReachable(true);
        setByAssetId(new Map(data.markets.map((m) => [m.assetId.toLowerCase(), m])));
      } catch {
        if (!cancelled) setReachable(false);
      }
    }
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return {byAssetId, reachable};
}
