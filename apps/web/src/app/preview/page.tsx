import {notFound} from "next/navigation";
import {PreviewStates} from "@/components/PreviewStates";

/// Design-review surface for order states that only exist after a real execution.
///
/// Development only — it 404s in production. It exists so the waiting and filled
/// personalities can be reviewed side by side before any capital has moved, and it is
/// deliberately not reachable from the product navigation so synthetic data can never be
/// mistaken for a real order.
export default function PreviewPage() {
  if (process.env.NODE_ENV === "production" && process.env.BESPEAK_ENABLE_PREVIEW !== "1") {
    notFound();
  }
  return (
    <section style={{paddingTop: 48, paddingBottom: 48, maxWidth: 680}}>
      <h1 className="mb-8">State preview</h1>
      <p className="lede mb-32">
        Synthetic data, for design review only. Not reachable from the product and not
        served in production.
      </p>
      <PreviewStates />
    </section>
  );
}
