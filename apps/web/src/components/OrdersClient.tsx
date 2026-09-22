"use client";

import {useMemo, useState} from "react";
import {useAccount} from "wagmi";
import type {Address} from "viem";
import {OrderStatus} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {useMarketState} from "@/lib/useMarketState";
import {useOrderRecords} from "@/lib/useOrders";
import {OrderCard} from "./OrderCard";
import {RecurringList} from "./RecurringList";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
}
interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

type Tab = "active" | "recurring" | "completed" | "all";

export function OrdersClient({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const [tab, setTab] = useState<Tab>("active");
  const {orders, isLoading, refetch} = useOrderRecords(address);
  const {byAssetId, reachable} = useMarketState();

  const filtered = useMemo(() => {
    if (tab === "active") return orders.filter((o) => o.status === OrderStatus.ACTIVE);
    if (tab === "completed") return orders.filter((o) => o.status === OrderStatus.FILLED);
    return orders;
  }, [orders, tab]);

  if (!isConnected) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>Connect your wallet to see your orders.</p>
      </div>
    );
  }

  if (!clientDeployment()) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>
          Bespeak is not deployed on this network yet, so there are no orders to show.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="wrap-row gap-4 mb-24" role="tablist">
        {(["active", "recurring", "completed", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className="nav-link"
            onClick={() => setTab(t)}
            data-active={tab === t}
            style={{border: 0, background: tab === t ? "var(--surface-quiet)" : "transparent", cursor: "pointer", font: "inherit", fontSize: 14}}
          >
            {t === "active"
              ? "Active"
              : t === "recurring"
                ? "Repeat"
                : t === "completed"
                  ? "Completed"
                  : "All"}
          </button>
        ))}
      </div>

      {tab === "recurring" && <RecurringList assets={assets} stables={stables} />}

      {tab !== "recurring" && isLoading && <div className="empty">Loading your orders…</div>}

      {tab !== "recurring" && !isLoading && filtered.length === 0 && (
        <div className="empty">
          <p className="body-2 mb-16" style={{marginTop: 0}}>
            {tab === "active"
              ? "Nothing waiting right now."
              : tab === "completed"
                ? "No completed purchases yet."
                : "Nothing here yet."}
          </p>
          <a className="btn" href="/markets">
            Browse markets
          </a>
        </div>
      )}

      <div className="stack gap-12">
        {tab !== "recurring" && filtered.map((o) => (
          <OrderCard
            key={o.id}
            order={o}
            assets={assets}
            stables={stables}
            market={byAssetId.get(o.assetId.toLowerCase())}
            sourceReachable={reachable}
            onChanged={refetch}
          />
        ))}
      </div>
    </>
  );
}
