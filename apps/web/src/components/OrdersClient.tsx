"use client";

import {useMemo, useState} from "react";
import {useAccount, usePublicClient, useReadContract, useWriteContract} from "wagmi";
import type {Address, Hash} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, formatLocal} from "@/lib/format";
import {useOrderRecords, type OrderRecord} from "@/lib/useOrders";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
}
interface Stable {
  address: Address;
  symbol: string;
  decimals: number;
}

type Tab = "active" | "completed" | "all";

const TRIGGER_LABEL: Record<number, string> = {
  [TriggerType.IMMEDIATE]: "Buy now",
  [TriggerType.NEXT_REGULAR_SESSION]: "Next regular session",
  [TriggerType.WHEN_AVAILABLE]: "When available on X Layer",
};

export function OrdersClient({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const [tab, setTab] = useState<Tab>("active");
  const {orders, isLoading, refetch} = useOrderRecords(address);

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
      <div className="row" style={{marginBottom: 16}}>
        {(["active", "completed", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            className="btn btn-sm"
            onClick={() => setTab(t)}
            style={{
              borderColor: tab === t ? "var(--text)" : "var(--border-strong)",
              fontWeight: tab === t ? 600 : 500,
            }}
          >
            {t === "active" ? "Active" : t === "completed" ? "Completed" : "All"}
          </button>
        ))}
      </div>

      {isLoading && <div className="empty">Loading your orders…</div>}

      {!isLoading && filtered.length === 0 && (
        <div className="empty">
          <p style={{marginTop: 0}}>
            {tab === "active" ? "No orders waiting right now." : "Nothing here yet."}
          </p>
          <a className="btn btn-sm" href="/markets">
            Browse markets
          </a>
        </div>
      )}

      <div className="grid" style={{gap: 10}}>
        {filtered.map((o) => (
          <OrderCard key={o.id} order={o} assets={assets} stables={stables} onChanged={refetch} />
        ))}
      </div>
    </>
  );
}

function OrderCard({
  order,
  assets,
  stables,
  onChanged,
}: {
  order: OrderRecord;
  assets: AssetLite[];
  stables: Stable[];
  onChanged: () => void;
}) {
  const asset = assets.find((a) => a.assetId.toLowerCase() === order.assetId.toLowerCase());
  const stable = stables.find((s) => s.address.toLowerCase() === order.inputToken.toLowerCase());
  const d = clientDeployment();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amount = stable ? `${formatAmount(order.amountIn, stable.decimals)} ${stable.symbol}` : "—";
  const expired = order.status === OrderStatus.ACTIVE && Number(order.expiresAt) * 1000 < Date.now();

  async function cancel() {
    if (!d || !publicClient) return;
    setBusy(true);
    setErr(null);
    try {
      const hash = await writeContractAsync({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: "cancelOrder",
        args: [order.id],
      });
      await publicClient.waitForTransactionReceipt({hash});
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message.split("\n")[0]! : "Could not cancel");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="between" style={{marginBottom: 10, alignItems: "flex-start"}}>
        <div className="stack">
          <strong style={{fontSize: 16}}>{asset?.underlyingSymbol ?? "Unknown asset"}</strong>
          <span className="small muted">{TRIGGER_LABEL[order.triggerType] ?? "Order"}</span>
        </div>
        <StatusBadge status={order.status} expired={expired} />
      </div>

      <div className="between small" style={{marginBottom: 6}}>
        <span className="muted">Reserved</span>
        <span className="mono">{amount}</span>
      </div>
      {order.status === OrderStatus.ACTIVE && (
        <div className="between small" style={{marginBottom: 6}}>
          <span className="muted">Deadline</span>
          <span>{formatLocal(new Date(Number(order.expiresAt) * 1000))}</span>
        </div>
      )}
      {order.recurringId !== "0x0000000000000000000000000000000000000000000000000000000000000000" && (
        <div className="between small" style={{marginBottom: 6}}>
          <span className="muted">Repeat</span>
          <span>Purchase #{order.occurrenceIndex + 1}</span>
        </div>
      )}

      {order.status === OrderStatus.ACTIVE && (
        <HoldReason orderId={order.id} />
      )}

      <div className="row" style={{marginTop: 12}}>
        {order.status === OrderStatus.ACTIVE && (
          <button className="btn btn-sm" onClick={cancel} disabled={busy}>
            {busy ? "Cancelling…" : "Cancel"}
          </button>
        )}
        {order.status === OrderStatus.FILLED && (
          <a className="btn btn-sm" href={`/receipt/${order.id}`}>
            View receipt
          </a>
        )}
      </div>
      {err && (
        <p className="tiny" style={{color: "var(--negative)", marginBottom: 0}}>
          {err}
        </p>
      )}
    </div>
  );
}

/// Why an active order has not executed. Read live from the chain so the explanation a user
/// sees is the contract's own reason, not a guess assembled in the UI.
function HoldReason({orderId}: {orderId: Hash}) {
  const {data} = useReadContract({
    address: clientDeployment()?.orderManager,
    abi: BespeakOrderManagerAbi,
    functionName: "getOrder",
    args: [orderId],
    query: {enabled: Boolean(clientDeployment())},
  });
  if (!data) return null;
  return (
    <p className="tiny muted" style={{margin: "8px 0 0"}}>
      Waiting for its condition. Your funds stay reserved and are released the moment you
      cancel.
    </p>
  );
}

function StatusBadge({status, expired}: {status: number; expired: boolean}) {
  if (status === OrderStatus.FILLED) return <span className="pill pill-done">Completed</span>;
  if (status === OrderStatus.CANCELLED) return <span className="pill pill-off">Cancelled</span>;
  if (status === OrderStatus.EXPIRED) return <span className="pill pill-off">Expired</span>;
  if (expired) return <span className="pill pill-wait">Deadline passed</span>;
  return <span className="pill pill-wait">Waiting</span>;
}
