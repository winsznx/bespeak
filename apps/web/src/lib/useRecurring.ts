"use client";

import {useCallback, useEffect, useState} from "react";
import {usePublicClient} from "wagmi";
import type {Address, Hash} from "viem";
import {BespeakOrderManagerAbi} from "@bespeak/sdk";
import {clientDeployment} from "./addresses";

export interface RecurringRecord {
  id: Hash;
  owner: Address;
  vault: Address;
  inputToken: Address;
  assetId: Hash;
  receiver: Address;
  amountPerOccurrence: bigint;
  maxSlippageBps: number;
  intervalSeconds: number;
  totalOccurrences: number;
  completedOccurrences: number;
  createdOccurrences: number;
  nextEligibleAt: bigint;
  occurrenceTrigger: number;
  minSourceTier: number;
  active: boolean;
  paused: boolean;
}

/// A repeat instruction is a different object from the orders it produces, so the UI reads
/// it separately. Showing only the occurrences would leave a user unable to see how many
/// purchases remain, or that the series is held waiting on a top-up.
export function useRecurring(owner: Address | undefined) {
  const publicClient = usePublicClient();
  const [series, setSeries] = useState<RecurringRecord[]>([]);
  const [isLoading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const d = clientDeployment();
    if (!d || !owner || !publicClient) {
      setSeries([]);
      return;
    }
    setLoading(true);
    try {
      const ids = (await publicClient.readContract({
        address: d.orderManager,
        abi: BespeakOrderManagerAbi,
        functionName: "recurringOf",
        args: [owner],
      })) as Hash[];

      const records = await Promise.all(
        ids.map(
          (id) =>
            publicClient.readContract({
              address: d.orderManager,
              abi: BespeakOrderManagerAbi,
              functionName: "getRecurring",
              args: [id],
            }) as Promise<unknown> as Promise<RecurringRecord>,
        ),
      );
      setSeries(records.reverse());
    } catch {
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [owner, publicClient]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 20_000);
    return () => clearInterval(t);
  }, [load]);

  return {series, isLoading, refetch: load};
}
