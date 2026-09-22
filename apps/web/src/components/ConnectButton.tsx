"use client";

import {useAccount, useConnect, useDisconnect, useSwitchChain} from "wagmi";
import {X_LAYER_CHAIN_ID} from "@bespeak/shared";
import {shortAddress} from "@/lib/format";

/// Wallet entry point. Handles the three states a user can actually be in: disconnected,
/// connected on the wrong chain, and ready. The wrong-network case gets a real action
/// rather than a dead end, because X Layer is not a chain most wallets already have.
export function ConnectButton() {
  const {address, isConnected, chainId} = useAccount();
  const {connect, connectors, isPending} = useConnect();
  const {disconnect} = useDisconnect();
  const {switchChain, isPending: switching} = useSwitchChain();

  if (!isConnected) {
    const injected = connectors[0];
    return (
      <button
        className="btn btn-sm"
        disabled={!injected || isPending}
        onClick={() => injected && connect({connector: injected})}
      >
        {isPending ? "Connecting" : injected ? "Connect" : "No wallet"}
      </button>
    );
  }

  if (chainId !== X_LAYER_CHAIN_ID) {
    return (
      <button
        className="btn btn-sm"
        disabled={switching}
        onClick={() => switchChain({chainId: X_LAYER_CHAIN_ID})}
      >
        {switching ? "Switching" : "Switch to X Layer"}
      </button>
    );
  }

  return (
    <button className="btn btn-sm" onClick={() => disconnect()} title={address}>
      {address ? shortAddress(address) : "Connected"}
    </button>
  );
}
