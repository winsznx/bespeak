"use client";

import {useAccount} from "wagmi";
import type {Address} from "viem";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, formatLocal} from "@/lib/format";
import {useOrderRecords} from "@/lib/useOrders";

interface AssetLite {
  assetId: string;
  underlyingSymbol: string;
}
interface Stable {
  address: Address;
  symbol: string;
  decimals: number;
}

const TRIGGER: Record<number, string> = {
  [TriggerType.IMMEDIATE]: "buy now",
  [TriggerType.NEXT_REGULAR_SESSION]: "next regular session",
  [TriggerType.WHEN_AVAILABLE]: "when available",
};

export function ActivityClient({assets, stables}: {assets: AssetLite[]; stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const {orders, isLoading} = useOrderRecords(address);

  if (!isConnected) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>Connect your wallet to see your activity.</p>
      </div>
    );
  }
  if (!clientDeployment()) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>Bespeak is not deployed on this network yet.</p>
      </div>
    );
  }
  if (isLoading) return <div className="empty">Loading…</div>;
  if (orders.length === 0) {
    return (
      <div className="empty">
        <p style={{marginTop: 0}}>Nothing has happened yet.</p>
        <a className="btn btn-sm" href="/markets">
          Create your first order
        </a>
      </div>
    );
  }

  return (
    <div className="grid" style={{gap: 8}}>
      {orders.map((o) => {
        const asset = assets.find((a) => a.assetId.toLowerCase() === o.assetId.toLowerCase());
        const stable = stables.find((s) => s.address.toLowerCase() === o.inputToken.toLowerCase());
        const amount = stable ? `${formatAmount(o.amountIn, stable.decimals)} ${stable.symbol}` : "";

        return (
          <div className="card" key={o.id}>
            <div className="between">
              <div className="stack">
                <span>
                  <strong>{verb(o.status)}</strong> {amount} — {asset?.underlyingSymbol ?? "asset"} (
                  {TRIGGER[o.triggerType]})
                </span>
                <span className="tiny muted">
                  Created {formatLocal(new Date(Number(o.createdAt) * 1000))}
                </span>
              </div>
            </div>
            <details className="tech">
              <summary>Technical detail</summary>
              <dl className="kv">
                <dt>Order id</dt>
                <dd>{o.id}</dd>
                <dt>Vault</dt>
                <dd>{o.vault}</dd>
                <dt>Receiver</dt>
                <dd>{o.receiver}</dd>
                <dt>Input token</dt>
                <dd>{o.inputToken}</dd>
                <dt>Asset id</dt>
                <dd>{o.assetId}</dd>
                <dt>Max slippage</dt>
                <dd>{o.maxSlippageBps} bps</dd>
                <dt>Expires</dt>
                <dd>{new Date(Number(o.expiresAt) * 1000).toISOString()}</dd>
              </dl>
            </details>
          </div>
        );
      })}
    </div>
  );
}

function verb(status: number): string {
  switch (status) {
    case OrderStatus.FILLED:
      return "Purchased";
    case OrderStatus.CANCELLED:
      return "Cancelled";
    case OrderStatus.EXPIRED:
      return "Expired, funds released:";
    default:
      return "Reserved";
  }
}
