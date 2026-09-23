"use client";

import Link from "next/link";
import {ConnectButton as RKConnectButton} from "@rainbow-me/rainbowkit";
import {shortAddress} from "@/lib/format";
import {NetworkIdentity, TokenIdentity} from "@/components/identity";

/// The shell's single high-contrast module. Shows the real connection state — not
/// connected, wrong network, or connected — and every action opens the real wallet modal.
export function WalletModule() {
  return (
    <RKConnectButton.Custom>
      {({account, chain, openAccountModal, openChainModal, openConnectModal, mounted}) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            className="wallet-card"
            {...(!ready && {"aria-hidden": true, style: {opacity: 0}})}
          >
            <div className="between" style={{marginBottom: 12}}>
              <span className="t-label" style={{color: "var(--invert-ink-2)"}}>
                Wallet
              </span>
              {connected && (
                <button
                  type="button"
                  onClick={openChainModal}
                  className="row g2"
                  style={{
                    border: 0,
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 11.5,
                    color: chain.unsupported ? "var(--waiting)" : "var(--invert-ink-2)",
                  }}
                >
                  <NetworkIdentity
                    size={13}
                    showLabel={false}
                    status={chain.unsupported ? "warn" : "ok"}
                  />
                  {chain.unsupported ? "Wrong network" : (chain.name ?? "X Layer")}
                </button>
              )}
            </div>

            {!connected ? (
              <>
                <p
                  className="t-sm prose"
                  style={{margin: "0 0 14px", color: "var(--invert-ink-2)"}}
                >
                  Connect to fund a vault and set standing orders.
                </p>
                <button type="button" onClick={openConnectModal} className="wallet-card-btn">
                  Connect wallet
                </button>
              </>
            ) : chain.unsupported ? (
              <>
                <p
                  className="t-sm prose"
                  style={{margin: "0 0 14px", color: "var(--invert-ink-2)"}}
                >
                  Bespeak runs on X Layer. Switch network to continue.
                </p>
                <button type="button" onClick={openChainModal} className="wallet-card-btn">
                  Switch to X Layer
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={openAccountModal}
                  className="mono"
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,
                    marginBottom: 6,
                    color: "var(--invert-ink)",
                    fontSize: 12.5,
                    cursor: "pointer",
                  }}
                >
                  {account.ensName ?? shortAddress(account.address)}
                </button>
                {account.displayBalance && (
                  <div
                    className="row g2"
                    style={{marginBottom: 14, color: "var(--invert-ink-2)", fontSize: 12.5}}
                  >
                    <TokenIdentity symbol="OKB" size="xs" showLabel={false} />
                    {account.displayBalance}
                  </div>
                )}
                <Link href="/vault" className="wallet-card-btn">
                  Deposit
                </Link>
              </>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
