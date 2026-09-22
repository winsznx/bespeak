import type {Metadata} from "next";

export const metadata: Metadata = {title: "Terms — Bespeak"};

export default function TermsPage() {
  return (
    <div className="site-inner" style={{padding: "clamp(48px,7vw,96px) clamp(18px,3vw,44px)"}}>
      <div style={{maxWidth: 680}}>
        <h1 className="t-h1" style={{marginBottom: 20}}>
          Terms
        </h1>
        <p className="t-body muted prose" style={{marginBottom: 28}}>
          Bespeak is execution infrastructure for tokenized equities on X Layer. Using it
          means accepting the following.
        </p>

        <Section title="What Bespeak does">
          Bespeak carries out an instruction you authorize: it reserves a fixed maximum
          amount of stablecoin in a vault only you can withdraw from, waits for the market
          condition you chose, and attempts execution inside the limits you set. It reports
          what actually happened, including when execution did not occur.
        </Section>

        <Section title="What Bespeak does not do">
          Bespeak does not provide investment advice, does not recommend any security, does
          not guarantee execution, and does not promise that waiting produces a better price.
          It does not take custody of your funds and cannot move them outside the order you
          authorized. It does not circumvent any issuer or venue restriction.
        </Section>

        <Section title="Market data">
          The market-session condition is derived from the asset issuer's published trading
          state and attested by the Bespeak operator. It is operator-attested, not
          oracle-verified. Every receipt records the source and its trust tier, and the
          limitation travels with the claim.
        </Section>

        <Section title="Risk">
          Tokenized equities carry market risk. Smart contracts carry technical risk; Bespeak
          has not been externally audited. Routing depends on third-party liquidity that may
          be unavailable, in which case your order waits or expires and your capital is
          released. You may lose money.
        </Section>

        <Section title="Eligibility">
          Availability follows the restrictions of the asset issuer and the venues Bespeak
          routes through. Bespeak provides no functionality to bypass them.
        </Section>

        <Section title="No warranty">
          The software is provided as is, without warranty of any kind. To the extent
          permitted by law, the authors accept no liability for loss arising from its use.
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
