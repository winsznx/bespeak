"use client";

import {ConnectButton as RKConnectButton} from "@rainbow-me/rainbowkit";
import {shortAddress} from "@/lib/format";
import {NetworkIdentity} from "./identity";

/// Bespeak's wallet control, built on RainbowKit's custom render prop so the default
/// rainbow button never lands in our shell.
///
/// The wrapper renders unconditionally and only toggles visibility once `mounted`, which
/// keeps the server and client DOM shapes identical through hydration. Every state the
/// user can actually reach is handled: not connected, connecting, wrong network, and
/// connected — and each one opens the real RainbowKit modal rather than a bespoke
/// half-implementation.
export function ConnectButton({compact = false}: {compact?: boolean}) {
  return (
    <RKConnectButton.Custom>
      {({account, chain, openAccountModal, openChainModal, openConnectModal, mounted, authenticationStatus}) => {
        const ready = mounted && authenticationStatus !== "loading";
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus || authenticationStatus === "authenticated");

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: {opacity: 0, pointerEvents: "none", userSelect: "none"},
            })}
          >
            {!connected ? (
              <button
                type="button"
                onClick={openConnectModal}
                className={compact ? "btn btn-primary btn-sm" : "btn btn-primary"}
              >
                Connect wallet
              </button>
            ) : chain.unsupported ? (
              <button
                type="button"
                onClick={openChainModal}
                className={compact ? "btn btn-sm" : "btn"}
                style={{
                  borderColor: "var(--waiting-line)",
                  background: "var(--waiting-soft)",
                  color: "var(--waiting)",
                }}
              >
                Switch to X Layer
              </button>
            ) : (
              <button type="button" onClick={openAccountModal} className="wallet-pill" title={account.address}>
                <WalletAvatar ensAvatar={account.ensAvatar} address={account.address} />
                <span className="mono wallet-pill-label">
                  {account.ensName ?? shortAddress(account.address)}
                </span>
                {account.hasPendingTransactions && (
                  <span className="wallet-pending" aria-label="Transaction pending" />
                )}
              </button>
            )}
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}

/// Network control. Shows the real chain identity and opens RainbowKit's chain modal, so
/// switching networks is a real action rather than a decorative status chip.
export function NetworkButton() {
  return (
    <RKConnectButton.Custom>
      {({chain, openChainModal, mounted, account}) => {
        const ready = mounted;
        if (!ready) {
          return (
            <span className="chip chip-outline network-chip" aria-hidden="true">
              <NetworkIdentity size={15} showLabel={false} />
              <span>X Layer</span>
            </span>
          );
        }

        // Not connected: state the network Bespeak operates on, without implying a session.
        if (!account || !chain) {
          return (
            <span className="chip chip-outline network-chip" title="Bespeak runs on X Layer, chain 196">
              <NetworkIdentity size={15} showLabel={false} />
              <span>X Layer</span>
            </span>
          );
        }

        if (chain.unsupported) {
          return (
            <button type="button" onClick={openChainModal} className="chip chip-waiting network-chip" style={{cursor: "pointer"}}>
              <NetworkIdentity size={15} showLabel={false} status="warn" />
              <span>Wrong network</span>
            </button>
          );
        }

        return (
          <button
            type="button"
            onClick={openChainModal}
            className="chip chip-outline network-chip"
            style={{cursor: "pointer"}}
            title="Switch network"
          >
            <NetworkIdentity size={15} showLabel={false} status="ok" />
            <span>{chain.name ?? "X Layer"}</span>
          </button>
        );
      }}
    </RKConnectButton.Custom>
  );
}

function WalletAvatar({ensAvatar, address}: {ensAvatar?: string | undefined; address: string}) {
  if (ensAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={ensAvatar} alt="" className="wallet-avatar" width={26} height={26} />
    );
  }
  // Deterministic from the address, so the same wallet always looks the same. Not a
  // hard-coded stand-in and never shown for a wallet that is not actually connected.
  const hue = parseInt(address.slice(2, 8), 16) % 360;
  return (
    <span
      aria-hidden="true"
      className="wallet-avatar"
      style={{
        background: `linear-gradient(140deg, oklch(0.78 0.11 ${hue}), oklch(0.5 0.15 ${(hue + 48) % 360}))`,
      }}
    />
  );
}
