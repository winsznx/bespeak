"use client";

import {useCallback} from "react";
import {useRouter} from "next/navigation";
import {useQueryClient} from "@tanstack/react-query";

/// Refresh what a confirmed transaction actually changed.
///
/// Two caches go stale at once and they need different instruments. wagmi's contract reads
/// are TanStack queries, so balances and vault state are refetched directly. Orders,
/// dashboard and activity are server components and re-render only when the router is told
/// to, so without `refresh()` the page keeps serving the payload it was rendered with no
/// matter what the chain now says.
///
/// Only contract reads are invalidated. Invalidating everything refetched queries the
/// transaction had not touched, and each of those briefly dropped its data, which is what
/// made the screen blink after every action. Paired with `keepPreviousData` on the polled
/// queries, a refresh now changes numbers without the layout moving.
///
/// Call this after `waitForTransactionReceipt` resolves, never before. Invalidating on
/// submission refetches state the transaction has not changed yet and shows the user their
/// old balance as though it were the new one.
export function useAfterWrite(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return key === "readContract" || key === "readContracts" || key === "balance";
      },
    });
    router.refresh();
  }, [queryClient, router]);
}
