import type {Metadata} from "next";
import Link from "next/link";
import {OnChainRef} from "@/components/ui/OnChainRef";
import {ExternalLink} from "@/components/ui/ExternalLink";

const VIDEO_ID = "XXNIbtmEb0A";
const WATCH_URL = `https://youtu.be/${VIDEO_ID}`;

/// The demo video, at the address given to reviewers.
///
/// This is the page a judge opens, often before anything else, so it carries the video and
/// the three facts that make the video checkable: where the product is, where the code is,
/// and a transaction they can open on a block explorer without taking our word for any of
/// it. Everything else stays on the landing page.
export const metadata: Metadata = {
  title: "Demo",
  description:
    "A three minute walkthrough of Bespeak executing a conditioned standing order on X Layer mainnet.",
  alternates: {canonical: "/demo"},
  openGraph: {
    title: "Bespeak — demo",
    description:
      "A three minute walkthrough of Bespeak executing a conditioned standing order on X Layer mainnet.",
    url: "/demo",
    type: "video.other",
  },
};

const CANONICAL_TX = "0x72be50dc257b24c0fdc06c421f94c20f1cd0d4fa2d2da86147d8ddbdc8f92e07";

export default function DemoPage() {
  return (
    <section className="site-inner" style={{padding: "var(--s-12) 0 var(--s-16)"}}>
      <div style={{maxWidth: 900, margin: "0 auto"}}>
        <h1 className="t-h1" style={{marginBottom: 10}}>
          Bespeak in three minutes
        </h1>
        <p className="t-body muted prose" style={{maxWidth: 620, margin: "0 0 var(--s-8)"}}>
          One order waiting for the market moment its owner chose, and one already executed
          and independently verified. Everything in the recording is X Layer mainnet.
        </p>

        {/* Ratio box rather than a fixed height, so the player keeps 16:9 from a phone to a
            wide desktop instead of letterboxing itself. */}
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: "var(--r-module)",
            overflow: "hidden",
            border: "1px solid var(--line)",
            background: "#000",
          }}
        >
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?rel=0&modestbranding=1`}
            title="Bespeak demo"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{position: "absolute", inset: 0, width: "100%", height: "100%", border: 0}}
          />
        </div>

        <p className="t-xs faint" style={{margin: "12px 0 var(--s-10)"}}>
          Trouble with the embed?{" "}
          <ExternalLink href={WATCH_URL}>Watch it on YouTube</ExternalLink>
        </p>

        <div className="dash-row-3">
          <section className="module module-pad">
            <div className="t-label" style={{marginBottom: 10}}>
              Try it
            </div>
            <p className="t-sm muted prose" style={{margin: "0 0 14px"}}>
              The live product on X Layer mainnet, chain 196.
            </p>
            <Link href="/dashboard" className="btn btn-primary">
              Open the app
            </Link>
          </section>

          <section className="module module-pad">
            <div className="t-label" style={{marginBottom: 10}}>
              Read it
            </div>
            <p className="t-sm muted prose" style={{margin: "0 0 14px"}}>
              Contracts, keeper, verification and the limitations we state plainly.
            </p>
            <ExternalLink href="https://github.com/winsznx/bespeak" className="btn">
              View the code
            </ExternalLink>
          </section>

          <section className="module module-pad">
            <div className="t-label" style={{marginBottom: 10}}>
              Check it
            </div>
            <p className="t-sm muted prose" style={{margin: "0 0 12px"}}>
              A real execution from the recording, routed by the OKX DEX API.
            </p>
            <OnChainRef value={CANONICAL_TX} kind="tx" />
          </section>
        </div>
      </div>
    </section>
  );
}
