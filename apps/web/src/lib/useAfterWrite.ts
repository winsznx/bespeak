"use client";

import {useCallback} from "react";
import {useRouter} from "next/navigation";
import {useQueryClient} from "@tanstack/react-query";

/// Refresh everything a confirmed transaction just invalidated.
///
/// Two caches go stale at once and they need different instruments, which is why doing
/// only one of them left the app needing a manual reload after every deposit and order:
///
/// - wagmi's contract reads are TanStack queries. Invalidating them refetches balances and
///   vault state immediately instead of waiting out the polling interval.
/// - Orders, dashboard and activity are server components. They re-render only when the
///   router is told to, so without `refresh()` the page keeps serving the payload it was
///   rendered with, no matter what the chain now says.
///
/// Call this after `waitForTransactionReceipt` resolves, never before. Invalidating on
/// submission refetches state the transaction has not changed yet and shows the user their
/// old balance as though it were the new one.
export function useAfterWrite(): () => Promise<void> {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(async () => {
    await queryClient.invalidateQueries();
    router.refresh();
  }, [queryClient, router]);
}
