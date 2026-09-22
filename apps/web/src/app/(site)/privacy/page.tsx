import type {Metadata} from "next";

export const metadata: Metadata = {title: "Privacy — Bespeak"};

export default function PrivacyPage() {
  return (
    <div className="site-inner" style={{padding: "clamp(48px,7vw,96px) clamp(18px,3vw,44px)"}}>
      <div style={{maxWidth: 680}}>
        <h1 className="t-h1" style={{marginBottom: 20}}>
          Privacy
        </h1>
        <p className="t-body muted prose" style={{marginBottom: 28}}>
          Bespeak collects as little as it can, because most of what it needs is already
          public on chain.
        </p>

        <Section title="No accounts">
          There is no sign-up, no email and no password. You interact with Bespeak through a
          wallet you control.
        </Section>

        <Section title="What is stored in your browser">
          Your theme preference. That is all, and it never leaves your device.
        </Section>

        <Section title="What is public by nature">
          Your vault address, orders, reservations and fills are on X Layer, a public
          blockchain. Bespeak reads them; it does not create them privately and it cannot
          remove them. Anyone can read the same data.
        </Section>

        <Section title="Third-party requests">
          Loading the app requests market data from the xStocks public API and chain state
          from public X Layer RPC endpoints. Those providers may log requests under their own
          policies. Bespeak does not send them your wallet address except where a chain query
          inherently requires it.
        </Section>

        <Section title="No tracking">
          No analytics, no advertising identifiers, no third-party trackers, no fingerprinting.
        </Section>
      </div>
    </div>
  );
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
  return (
    <section style={{paddingTop: 24, borderTop: "1px solid var(--line)", marginBottom: 24}}>
      <h2 className="t-h3" style={{marginBottom: 8}}>
        {title}
      </h2>
      <p className="t-sm muted prose" style={{margin: 0}}>
        {children}
      </p>
    </section>
  );
}
