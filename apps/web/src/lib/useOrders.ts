"use client";

import {useCallback, useEffect, useState} from "react";
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

  const load = useCallback(async () => {
    const d = clientDeployment();
    if (!d || !owner || !publicClient) {
      setOrders([]);
      return;
    }
    setLoading(true);
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
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [owner, publicClient]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  return {orders, isLoading, refetch: load};
}
