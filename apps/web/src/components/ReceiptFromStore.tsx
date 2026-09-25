"use client";

import {useEffect, useState} from "react";
import {ReceiptView} from "./ReceiptView";
import type {StoredReceipt} from "@/lib/receipts";

type ViewProps = Omit<Parameters<typeof ReceiptView>[0], "receipt">;

/// Load a receipt the server could not.
///
/// Receipts live in a KV store written by the keeper. The server cannot read it: from
/// inside a server component `getCloudflareContext` yields no binding, and the worker
/// cannot fetch its own hostname to go through the route that can. The browser has neither
/// problem, so the read happens here.
///
/// Rendered only when the server found nothing, so a receipt held locally or in the build
/// still renders server-side with no request and no flash. This is the path a brand new
/// order takes, which before this always read as "outcome not yet confirmed" no matter what
/// the chain said.
export function ReceiptFromStore({
  orderId,
  receiptId,
  ...view
}: {orderId?: string; receiptId?: string} & ViewProps) {
  const [receipt, setReceipt] = useState<StoredReceipt | null>(null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const q = orderId
      ? `order=${encodeURIComponent(orderId)}`
      : `receipt=${encodeURIComponent(receiptId ?? "")}`;
    fetch(`/api/receipts?${q}`, {cache: "no-store"})
      .then((r) => (r.ok ? r.json() : null))
      .then((r: StoredReceipt | null) => {
        if (!cancelled) setReceipt(r);
      })
      .catch(() => {
        // The fallback below is the same thing the server would have rendered, so a failed
        // lookup costs nothing beyond the detail the receipt would have added.
      })
      .finally(() => {
        if (!cancelled) setSettled(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, receiptId]);

  // Until the lookup settles, render the unconfirmed view rather than a spinner: it is
  // what the page would otherwise have shown, and it is not wrong, only less complete.
  if (!settled) return <ReceiptView receipt={null} {...view} />;
  return <ReceiptView receipt={receipt} {...view} />;
}
