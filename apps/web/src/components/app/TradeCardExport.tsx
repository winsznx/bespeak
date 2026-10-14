"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import {drawTradeCard, cardFilename, type CardSize, type CardTheme, type TradeCardData} from "@/lib/tradeCard";
import {useResolvedTheme} from "@/components/theme";

/// Export a verified trade as a shareable Bespeak card.
///
/// The reason to build this into the product rather than leave people to screenshot: a
/// screenshot carries whatever the page looked like at that moment, at that width, in that
/// theme, and crops the one thing that makes the claim checkable. A drawn card always
/// carries the transaction hash in full, at a resolution where it stays legible after the
/// compression any social platform will apply.
///
/// Amounts are off by default. The usual reason to share one of these is to show that
/// something happened and invite someone to verify it, which needs a hash and a time, not a
/// position size.
export function TradeCardExport({data}: {data: TradeCardData}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState<CardSize>("2k");
  // Follows the app's theme by default, because a card exported from a dark interface
  // should not arrive light. Overridable, since the destination is often not this app.
  const appTheme = useResolvedTheme();
  const [theme, setTheme] = useState<CardTheme | null>(null);
  const effectiveTheme: CardTheme = theme ?? (appTheme === "dark" ? "dark" : "light");
  const [showAmounts, setShowAmounts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteLabel =
    typeof window === "undefined" ? "bespeak" : window.location.host.replace(/^www\./, "");

  const render = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      await drawTradeCard(canvas, data, {size, theme: effectiveTheme, showAmounts, siteLabel});
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not render the card");
    }
  }, [data, size, effectiveTheme, showAmounts, siteLabel]);

  useEffect(() => {
    void render();
  }, [render]);

  async function download() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setBusy(true);
    try {
      await render();
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("Could not encode the image");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = cardFilename(data, size);
      a.click();
      // Revoked on the next tick rather than immediately: Safari cancels an in-flight
      // download when the object URL is released synchronously.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the image");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module module-pad">
      <h2 className="t-h4" style={{marginBottom: 4}}>
        Export this trade
      </h2>
      <p className="t-sm muted prose" style={{margin: "0 0 18px"}}>
        A Bespeak card carrying the condition, the time and the full transaction hash, so
        anyone you send it to can check it rather than take your word for it.
      </p>

      {/* The preview is the real canvas, scaled down by CSS. What is downloaded is exactly
          what is shown, at full resolution. */}
      <div
        style={{
          borderRadius: "var(--r-module)",
          overflow: "hidden",
          border: "1px solid var(--line)",
          marginBottom: 18,
          background: "var(--surface-2)",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-label={`Shareable card for the ${data.symbol} ${data.side.toLowerCase()}`}
          style={{width: "100%", height: "auto", display: "block"}}
        />
      </div>

      <div className="row wrap g3 between">
        <div className="row wrap g2">
          {(["2k", "4k"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className="btn btn-sm"
              aria-pressed={size === s}
              onClick={() => setSize(s)}
              style={
                size === s
                  ? {borderColor: "var(--brand)", color: "var(--brand)"}
                  : undefined
              }
            >
              {s === "2k" ? "2K · 2560×1440" : "4K · 3840×2160"}
            </button>
          ))}
          {(["dark", "light"] as const).map((t) => (
            <button
              key={t}
              type="button"
              className="btn btn-sm"
              aria-pressed={effectiveTheme === t}
              onClick={() => setTheme(t)}
              style={
                effectiveTheme === t
                  ? {borderColor: "var(--brand)", color: "var(--brand)"}
                  : undefined
              }
            >
              {t === "dark" ? "Dark" : "Light"}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={showAmounts}
            onClick={() => setShowAmounts((v) => !v)}
            style={
              showAmounts ? {borderColor: "var(--brand)", color: "var(--brand)"} : undefined
            }
          >
            {showAmounts ? "Amounts shown" : "Amounts hidden"}
          </button>
        </div>

        <button type="button" className="btn btn-primary" disabled={busy} onClick={download}>
          {busy ? "Preparing…" : "Download PNG"}
        </button>
      </div>

      {error && (
        <p className="t-sm" style={{color: "var(--danger)", margin: "12px 0 0"}}>
          {error}
        </p>
      )}
    </section>
  );
}
