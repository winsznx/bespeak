"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {usePublicClient} from "wagmi";
import type {Address, Hash} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {clientDeployment} from "./addresses";

export interface OrderRecord {
  id: Hash;
  owner: Address;
  vault: Address;
  inputToken: Address;
  assetId: Hash;
  receiver: Address;
  triggerType: number;
  amountIn: bigint;
  minAmountOut: bigint;
  maxSlippageBps: number;
  createdAt: bigint;
  validAfter: bigint;
  expiresAt: bigint;
  minSourceTier: number;
  recurringId: Hash;
  occurrenceIndex: number;
  status: number;
}

/// Read a wallet's orders straight from the order manager.
///
/// Deliberately not backed by an indexer database: the contract is the authority on what an
/// order is and what state it is in, and a cached row that disagrees would be exactly the
/// hidden authority the design forbids.
export function useOrderRecords(owner: Address | undefined) {
  const publicClient = usePublicClient();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [isLoading, setLoading] = useState(false);
  // Distinguishes the first load from every refresh after it. Without it the poll below
  // raised the loading flag every fifteen seconds and the whole list flashed back to
  // skeletons, on a page the reader was sitting still on and had not asked to change.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    const d = clientDeployment();
    if (!d || !owner || !publicClient) {
      setOrders([]);
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    try {
      const ids = (await publicClient.readContract({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: "ordersOf",
        args: [owner],
      })) as Hash[];

      const records = await Promise.all(
        ids.map(
          (id) =>
            publicClient.readContract({
              address: d.orderManager,
              abi: BespeakOrderManagerAbi,
              functionName: "getOrder",
              args: [id],
            }) as Promise<unknown> as Promise<OrderRecord>,
        ),
      );
      setOrders(records.reverse());
      loadedOnce.current = true;
    } catch {
      // A failed refresh keeps what is on screen. Clearing the list turned a momentary RPC
      // hiccup into "you have no orders", which is worse than showing data a few seconds
      // stale. The first load still falls through to the empty state.
      if (!loadedOnce.current) setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [owner, publicClient]);

  useEffect(() => {
    void load();
    // Orders change without the reader doing anything, because the keeper fills them, so
    // this polls. Thirty seconds rather than fifteen: nothing here is urgent to the second.
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
  }, [load]);

  return {orders, isLoading, refetch: load};
}
