"use client";

import {useEffect} from "react";
import Link from "next/link";
import {StatusPage} from "@/components/StatusPage";

/// Root error boundary. No stack traces reach the user; the digest is shown because it is
/// the only thing that makes a report actionable.
///
/// The reassurance is deliberately scoped: this boundary catches rendering failures, and a
/// render failure genuinely cannot move funds — Bespeak only spends through a signed
/// transaction. It does not claim anything about a transaction already in flight.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Bespeak render error:", error);
  }, [error]);

  return (
    <StatusPage
      headline="Something went"
      serif="wrong."
      body="This is a display error. Your vault balance and standing orders are held on X Layer and are not changed by it — Bespeak only ever moves funds through a transaction you sign."
      actions={
        <>
          <button className="btn btn-primary btn-lg" onClick={reset}>
            Try again
          </button>
          <Link href="/dashboard" className="btn btn-lg">
            Return to overview
          </Link>
        </>
      }
      detail={
        error.digest ? (
          <p className="t-xs faint">
            Reference <span className="mono">{error.digest}</span>
          </p>
        ) : null
      }
    />
  );
}
