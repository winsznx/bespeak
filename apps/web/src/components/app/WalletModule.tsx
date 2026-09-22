"use client";

import {useAccount, useConnect} from "wagmi";
import Link from "next/link";
import {X_LAYER_CHAIN_ID} from "@bespeak/shared";
import {shortAddress} from "@/lib/format";

/// The shell's single high-contrast module. Shows the real connection state rather than a
/// decorative promo: disconnected, wrong network, or connected with a route to add funds.
export function WalletModule() {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const injected = connectors[0];

  if (!isConnected) {
    return (
      <div className="wallet-card">
        <div className="t-label" style={{color: "var(--invert-ink-2)"}}>
          Wallet
        </div>
        <p className="t-sm prose" style={{margin: "10px 0 14px", color: "var(--invert-ink-2)"}}>
          Connect to fund a vault and set standing orders.
        </p>
        <button
          className="btn btn-block"
          style={{
            background: "var(--invert-ink)",
            borderColor: "var(--invert-ink)",
            color: "var(--invert)",
            height: 38,
          }}
          disabled={!injected || isPending}
          onClick={() => injected && connect({connector: injected})}
        >
          {isPending ? "Connecting" : injected ? "Connect wallet" : "No wallet found"}
        </button>
      </div>
    );
  }

  const wrongNetwork = chainId !== X_LAYER_CHAIN_ID;

  return (
    <div className="wallet-card">
      <div className="between" style={{marginBottom: 12}}>
        <span className="t-label" style={{color: "var(--invert-ink-2)"}}>
          Wallet
        </span>
        <span
          className="row g1"
          style={{fontSize: 11.5, color: wrongNetwork ? "var(--waiting)" : "var(--invert-ink-2)"}}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: 999,
              background: wrongNetwork ? "var(--waiting)" : "var(--success)",
            }}
          />
          {wrongNetwork ? "Wrong network" : "X Layer"}
        </span>
      </div>

      <div className="mono" style={{fontSize: 12.5, marginBottom: 14}}>
        {address ? shortAddress(address) : ""}
      </div>

      <Link
        href="/vault"
        className="btn btn-block"
        style={{
          background: "var(--invert-ink)",
          borderColor: "var(--invert-ink)",
          color: "var(--invert)",
          height: 38,
        }}
      >
        Deposit
      </Link>
    </div>
  );
}
