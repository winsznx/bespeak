"use client";

import {useMemo} from "react";
import Link from "next/link";
import {useAccount} from "wagmi";
import type {Address} from "viem";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, formatUtcShort} from "@/lib/format";
import {useOrderRecords, type OrderRecord} from "@/lib/useOrders";
import {AssetIdentity, TokenIdentity} from "./identity";
import {Skeleton} from "./ui/Skeleton";
import {ZeroState} from "./ZeroState";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
}
interface Stable {
  address: Address;
  symbol: string;
  decimals: number;
}

/// Chronological history, grouped by day. Dense rows rather than a card per event: a list
/// of forty events should read as a list, not forty containers.
export function ActivityClient({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const {orders, isLoading} = useOrderRecords(address);

  const groups = useMemo(() => groupByDay(orders), [orders]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Activity</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            What has happened to your capital and your orders, in order.
          </p>
        </div>
      </div>

      {!isConnected || !clientDeployment() ? (
        <ZeroState
          title={isConnected ? "Not deployed on this network yet" : "No activity yet"}
          body={
            isConnected
              ? "Activity appears once the Bespeak contracts are live on X Layer."
              : "Your Bespeak activity will appear here after your first order, grouped by day and expandable into the underlying on-chain detail."
          }
          primary={{href: "/markets", label: "Set an order"}}
          contextTitle="What gets recorded"
          context={
            <div className="col g3">
              {[
                "Capital reserved when an order is created",
                "Held, with the exact condition that blocked execution",
                "Purchase completed, with an independently verified receipt",
                "Funds released on cancel or expiry",
              ].map((t) => (
                <div
                  key={t}
                  className="t-sm prose"
                  style={{paddingLeft: 12, borderLeft: "2px solid var(--line-2)"}}
                >
                  {t}
                </div>
              ))}
            </div>
          }
        />
      ) : isLoading ? (
        <div className="module module-pad">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="row g3"
              style={{padding: "14px 0", borderBottom: i === 4 ? "none" : "1px solid var(--line)"}}
            >
              <Skeleton w={32} h={32} r={10} />
              <div className="grow col g2">
                <Skeleton w="42%" h={11} />
                <Skeleton w="26%" h={9} />
              </div>
              <Skeleton w={70} h={11} />
              <Skeleton w={62} h={22} r={8} />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <ZeroState
          title="No activity yet"
          body="Your first order will show up here the moment it is created, grouped by day."
          primary={{href: "/markets", label: "Set an order"}}
        />
      ) : (
        <div className="col g8">
          {groups.map(([day, rows]) => (
            <section key={day}>
              <div className="t-label" style={{marginBottom: 10}}>
                {day}
              </div>
              <div className="module" style={{padding: "2px 22px"}}>
                {rows.map((o, i) => {
                  const a = assets.find(
                    (x) => x.assetId.toLowerCase() === o.assetId.toLowerCase(),
                  );
                  const st = stables.find(
                    (s) => s.address.toLowerCase() === o.inputToken.toLowerCase(),
                  );
                  return (
                    <div
                      className="row g3"
                      key={o.id}
                      style={{
                        padding: "15px 0",
                        borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line)",
                      }}
                    >
                      <div className="grow" style={{minWidth: 0}}>
                        <AssetIdentity
                          symbol={a?.symbol ?? ""}
                          underlyingSymbol={`${a?.underlyingSymbol ?? "Asset"} · ${eventLabel(o.status)}`}
                          variant="row"
                          sub={`${conditionLabel(o.triggerType)} · ${formatUtcShort(new Date(Number(o.createdAt) * 1000))}`}
                        />
                      </div>
                      <span className="row g2 t-sm muted" style={{whiteSpace: "nowrap"}}>
                        ${st ? formatAmount(o.amountIn, st.decimals) : "—"}
                        {st && <TokenIdentity symbol={st.symbol} size="xs" showLabel={false} />}
                      </span>
                      <StateChip status={o.status} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function StateChip({status}: {status: number}) {
  if (status === OrderStatus.FILLED) return <span className="chip chip-success">Verified</span>;
  if (status === OrderStatus.CANCELLED) return <span className="chip chip-inactive">Cancelled</span>;
  if (status === OrderStatus.EXPIRED) return <span className="chip chip-inactive">Expired</span>;
  return (
    <span className="chip chip-waiting">
      <span className="dot" />
      Waiting
    </span>
  );
}

function groupByDay(orders: OrderRecord[]): Array<[string, OrderRecord[]]> {
  const map = new Map<string, OrderRecord[]>();
  for (const o of orders) {
    const d = new Date(Number(o.createdAt) * 1000);
    const key = d.toLocaleDateString("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    });
    const arr = map.get(key) ?? [];
    arr.push(o);
    map.set(key, arr);
  }
  return [...map.entries()];
}

function eventLabel(status: number): string {
  if (status === OrderStatus.FILLED) return "Purchase completed";
  if (status === OrderStatus.CANCELLED) return "Order cancelled, funds released";
  if (status === OrderStatus.EXPIRED) return "Order expired, funds released";
  return "Capital reserved";
}

function conditionLabel(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Buy now";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "Next regular session";
  return "When available";
}
