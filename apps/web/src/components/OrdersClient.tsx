"use client";

import {useMemo, useState} from "react";
import Link from "next/link";
import {useAccount} from "wagmi";
import type {Address} from "viem";
import {OrderStatus} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {useOrderRecords} from "@/lib/useOrders";
import {useMarketState} from "@/lib/useMarketState";
import {OrderCard} from "./OrderCard";
import {RecurringList} from "./RecurringList";
import {Skeleton} from "./ui/Skeleton";

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

const TABS: Array<[Tab, string]> = [
  ["active", "Active"],
  ["recurring", "Repeat"],
  ["completed", "Completed"],
  ["all", "All"],
];

export function OrdersClient({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const [tab, setTab] = useState<Tab>("active");
  const {orders, isLoading, refetch} = useOrderRecords(address);
  const {byAssetId, reachable} = useMarketState();

  const counts = useMemo(
    () => ({
      active: orders.filter((o) => o.status === OrderStatus.ACTIVE).length,
      completed: orders.filter((o) => o.status === OrderStatus.FILLED).length,
    }),
    [orders],
  );

  const shown = useMemo(() => {
    if (tab === "active") return orders.filter((o) => o.status === OrderStatus.ACTIVE);
    if (tab === "completed") return orders.filter((o) => o.status === OrderStatus.FILLED);
    return orders;
  }, [orders, tab]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Orders</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            Your standing instructions. Anything waiting says what it is waiting for.
          </p>
        </div>
        <div className="row g2 page-actions">
          <Link href="/markets" className="btn btn-primary">
            Set an order
          </Link>
        </div>
      </div>

      <div className="row wrap g1" role="tablist" aria-label="Order filters" style={{marginBottom: 22}}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className="btn btn-sm"
            onClick={() => setTab(k)}
            style={
              tab === k
                ? {background: "var(--ink)", borderColor: "var(--ink)", color: "var(--surface)"}
                : undefined
            }
          >
            {label}
            {k === "active" && counts.active > 0 ? ` ${counts.active}` : ""}
            {k === "completed" && counts.completed > 0 ? ` ${counts.completed}` : ""}
          </button>
        ))}
      </div>

      {!isConnected ? (
        <EmptyState
          title="Connect a wallet"
          body="Your standing orders and their status appear here once a wallet is connected."
        />
      ) : !clientDeployment() ? (
        <EmptyState
          title="Not deployed on this network yet"
          body="Bespeak's contracts are not live on X Layer yet, so there are no orders to show."
        />
      ) : tab === "recurring" ? (
        <RecurringList assets={assets} stables={stables} />
      ) : isLoading ? (
        <div className="col g3">
          {[0, 1, 2].map((i) => (
            <div className="module module-pad" key={i}>
              <div className="row g3" style={{marginBottom: 18}}>
                <Skeleton w={38} h={38} r={12} />
                <div className="grow col g2">
                  <Skeleton w={90} h={14} />
                  <Skeleton w={150} h={10} />
                </div>
                <Skeleton w={78} h={25} r={9} />
              </div>
              <Skeleton w={120} h={26} r={8} style={{marginBottom: 18}} />
              <Skeleton w="100%" h={54} r={12} />
            </div>
          ))}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          title={tab === "active" ? "Nothing waiting" : "Nothing here yet"}
          body={
            tab === "active"
              ? "When you set an order it appears here with the condition it is waiting for."
              : "Completed purchases will appear here with their receipts."
          }
          cta
        />
      ) : (
        <div className="col g3">
          {shown.map((o) => (
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
      )}
    </>
  );
}

function EmptyState({title, body, cta}: {title: string; body: string; cta?: boolean}) {
  return (
    <div className="module empty-state">
      <div className="t-h3">{title}</div>
      <p className="t-sm muted prose" style={{maxWidth: "46ch", margin: "0 auto 18px"}}>
        {body}
      </p>
      {cta && (
        <Link href="/markets" className="btn">
          Browse markets
        </Link>
      )}
    </div>
  );
}
