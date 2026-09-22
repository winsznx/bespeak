import Link from "next/link";

const FAQ = [
  {
    q: "What exactly am I authorizing?",
    a: "A single order with a fixed maximum amount, a receiver, a slippage limit and a deadline. Bespeak cannot spend more than the order reserved, cannot change the receiver, and cannot execute after you cancel or after the deadline passes.",
  },
  {
    q: "Where does my money sit while I wait?",
    a: "In a vault contract that only you can withdraw from. It is not pooled with anyone else. Reserved capital is still yours — cancelling an order releases it immediately.",
  },
  {
    q: "How does Bespeak know the market is open?",
    a: "From the xStocks issuer's own published trading state for the exact token being bought. The keeper signs that observation and the contract verifies the signature and its freshness on chain. That is operator-attested, not oracle-verified, and every receipt records it.",
  },
  {
    q: "Why does one asset say USDG and another USDC?",
    a: "Because that is where the liquidity actually is. Bespeak scans X Layer for the executable pair per asset rather than assuming a single stablecoin. Ordering in the wrong one would produce an order that can never route.",
  },
  {
    q: "What does 'verified' mean on a receipt?",
    a: "Bespeak re-read X Layer through a different connection than the one it broadcast through, and confirmed the order's terminal state, the exact asset delivered, your balance increase and the vault's decrease. If it cannot confirm all of that, the receipt does not say verified.",
  },
];

export default function HelpPage() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Help</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            What Bespeak does, and what it refuses to do.
          </p>
        </div>
      </div>

      <div className="col g3" style={{maxWidth: 720}}>
        {FAQ.map((f) => (
          <section className="module module-pad" key={f.q}>
            <h2 className="t-h3" style={{marginBottom: 8}}>
              {f.q}
            </h2>
            <p className="t-sm muted prose" style={{margin: 0}}>
              {f.a}
            </p>
          </section>
        ))}
      </div>

      <p className="t-sm muted prose" style={{marginTop: 24}}>
        Still stuck? The <Link href="/automations" style={{textDecoration: "underline"}}>API</Link>{" "}
        exposes everything the interface shows, and every receipt can be re-verified
        independently from public chain state.
      </p>
    </>
  );
}
