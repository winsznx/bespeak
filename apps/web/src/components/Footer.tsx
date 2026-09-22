import Link from "next/link";
import {Mark} from "./Wordmark";

export function Footer() {
  return (
    <footer style={{borderTop: "1px solid var(--line)", marginTop: 72}}>
      <div className="page" style={{padding: "32px 24px 56px"}}>
        <div
          className="between"
          style={{alignItems: "flex-start", flexWrap: "wrap", gap: 28}}
        >
          <div style={{maxWidth: "52ch"}}>
            <span className="row gap-8 mb-12" style={{color: "var(--text-2)"}}>
              <Mark size={16} />
              <span className="small strong" style={{color: "var(--text)"}}>
                Bespeak
              </span>
            </span>
            <p className="tiny muted prose" style={{margin: 0}}>
              Execution infrastructure for tokenized equities on X Layer. Bespeak does not
              give investment advice, recommend any security, or promise that waiting
              produces a better price. It carries out the instruction you authorize, inside
              the limits you set, and reports what actually happened.
            </p>
          </div>
          <div className="stack gap-8">
            <Link href="/markets" className="tiny muted">
              Markets
            </Link>
            <Link href="/demand" className="tiny muted">
              Demand
            </Link>
            <a
              className="tiny muted"
              href="https://www.oklink.com/xlayer"
              target="_blank"
              rel="noreferrer"
            >
              X Layer explorer
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
