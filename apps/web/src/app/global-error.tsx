"use client";

import {useEffect} from "react";

/// Last-resort boundary, used when the root layout itself fails. It must render its own
/// html and body, and cannot rely on providers or the token sheet having loaded, so the
/// few styles it needs are inline.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & {digest?: string};
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Bespeak fatal error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#eeefea",
          color: "#11171d",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 24,
        }}
      >
        <main style={{maxWidth: 460}}>
          <h1 style={{fontSize: 30, letterSpacing: "-0.03em", margin: "0 0 12px"}}>
            Bespeak could not load
          </h1>
          <p style={{color: "#6f7883", lineHeight: 1.55, margin: "0 0 24px"}}>
            Your vault balance and standing orders are held on X Layer and are unaffected by
            this. Reload to try again.
          </p>
          <button
            onClick={reset}
            style={{
              height: 44,
              padding: "0 20px",
              borderRadius: 12,
              border: "1px solid #1f6fe5",
              background: "#1f6fe5",
              color: "#fff",
              fontSize: 15,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
