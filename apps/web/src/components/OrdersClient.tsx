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
import {ZeroState} from "./ZeroState";
import {AssetIdentity, TokenIdentity} from "./identity";
import {Countdown} from "./Countdown";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  payWith: string | null;
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

export function OrdersClient({
  assets,
  stables,
  nextOpenIso,
  nextOpenLabel,
}: {
  assets: AssetLite[];
  stables: Stable[];
  nextOpenIso: string;
  nextOpenLabel: string;
}) {
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

      {!isConnected || !clientDeployment() || (!isLoading && shown.length === 0 && tab !== "recurring") ? (
        <ZeroState
          title={
            !isConnected
              ? "Connect a wallet to see your orders"
              : !clientDeployment()
                ? "Not deployed on this network yet"
                : tab === "completed"
                  ? "No completed purchases yet"
                  : "No standing orders yet"
          }
          body={
            !isConnected
              ? "Your standing instructions and their status live here. Each one shows exactly what it is waiting for, and you can cancel and take the funds back at any time."
              : !clientDeployment()
                ? "Bespeak's contracts are not live on X Layer yet. Market data is live and you can explore what is supported in the meantime."
                : tab === "completed"
                  ? "Completed purchases appear here with a receipt you can verify independently against X Layer."
                  : "Choose an asset, choose when Bespeak may buy it, and it waits for that condition without you keeping a browser open."
          }
          primary={{href: "/markets", label: "Set an order"}}
          {...(isConnected ? {secondary: {href: "/vault", label: "Deposit"}} : {})}
          contextTitle="Next market moment"
          context={
            <>
              <div className="t-figure-sm" style={{marginBottom: 4}}>
                <Countdown to={nextOpenIso} />
              </div>
              <div className="t-sm muted" style={{marginBottom: 18}}>
                Regular session opens {nextOpenLabel}
              </div>
              <div className="t-label" style={{marginBottom: 12}}>
                Ready to schedule
              </div>
              <div className="col g4">
                {assets.slice(0, 3).map((a) => (
                  <Link href={`/asset/${a.symbol}`} className="row g3" key={a.assetId}>
                    <div className="grow" style={{minWidth: 0}}>
                      <AssetIdentity
                        symbol={a.symbol}
                        underlyingSymbol={a.underlyingSymbol}
                        variant="row"
                        sub={a.name}
                      />
                    </div>
                    {a.payWith && <TokenIdentity symbol={a.payWith} size="xs" showLabel={false} />}
                  </Link>
                ))}
              </div>
            </>
          }
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
