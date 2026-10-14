"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {usePublicClient} from "wagmi";
import type {Address, Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakOrderManagerV1Abi} from "@bespeak/sdk";
import {clientDeployment, legacyDeployment} from "./addresses";

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
  /// v1.1 only. 0 = BUY, 1 = SELL. Filled in as BUY for v1 orders, which is accurate:
  /// buying is all v1 could do.
  side?: number;
  outputToken?: Address;
  /// Which manager holds this order. Cancelling needs it: a v1 order can only be cancelled
  /// through the v1 manager.
  generation?: "v1" | "v1.1";
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
    const current = clientDeployment();
    const legacy = legacyDeployment();
    if (!current || !owner || !publicClient) {
      setOrders([]);
      return;
    }
    if (!loadedOnce.current) setLoading(true);

    // Two generations run at once, each with its own ABI. v1.1's Order struct carries two
    // fields v1 does not return, so one shared ABI would fail to decode every historical
    // order. Read separately, tagged, then merged newest first.
    const sources = [
      {gen: "v1.1" as const, manager: current.orderManager, abi: BespeakOrderManagerAbi},
      ...(legacy
        ? [{gen: "v1" as const, manager: legacy.orderManager, abi: BespeakOrderManagerV1Abi}]
        : []),
    ];

    try {
      const perSource = await Promise.all(
        sources.map(async (src) => {
          try {
            const ids = (await publicClient.readContract({
              address: src.manager,
              abi: src.abi,
              functionName: "ordersOf",
              args: [owner],
            })) as Hash[];

            const records = await Promise.all(
              ids.map(
                (id) =>
                  publicClient.readContract({
                    address: src.manager,
                    abi: src.abi,
                    functionName: "getOrder",
                    args: [id],
                  }) as Promise<unknown> as Promise<OrderRecord>,
              ),
            );
            return records.map((r) => ({...r, side: r.side ?? 0, generation: src.gen}));
          } catch {
            // One unreachable generation must not blank the other. A shorter history is a
            // better outcome than an empty one.
            return [] as OrderRecord[];
          }
        }),
      );

      setOrders(
        perSource.flat().sort((a, b) => Number(b.createdAt) - Number(a.createdAt)),
      );
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
