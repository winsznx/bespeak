import Link from "next/link";
import {Mark} from "@/components/Wordmark";
import {ExternalGlyph} from "@/components/ui/ExternalLink";

const COLUMNS: Array<{title: string; links: Array<{href: string; label: string; external?: boolean}>}> = [
  {
    title: "Product",
    links: [
      {href: "/markets", label: "Markets"},
      {href: "/demand", label: "Demand"},
      {href: "/dashboard", label: "Open app"},
    ],
  },
  {
    title: "Developers",
    links: [
      {href: "/automations", label: "API & agents"},
      {href: "/api/assets", label: "Asset registry"},
      {href: "/api/markets", label: "Market state"},
    ],
  },
  {
    title: "Legal",
    links: [
      {href: "/terms", label: "Terms"},
      {href: "/privacy", label: "Privacy"},
      {
        href: "https://github.com",
        label: "GitHub",
        external: true,
      },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-inner">
        <div className="footer-grid">
          <div>
            <span className="row g2" style={{marginBottom: 14}}>
              <Mark size={17} />
              <span className="t-h4">Bespeak</span>
            </span>
            <p className="t-sm muted prose" style={{margin: 0, maxWidth: "42ch"}}>
              Condition-aware standing orders for tokenized equities on X Layer. Bespeak does
              not give investment advice, recommend any security, or promise that waiting
              produces a better price. It carries out the instruction you authorize, inside
              the limits you set, and reports what actually happened.
            </p>
          </div>

          {COLUMNS.map((c) => (
            <div key={c.title}>
              <div className="t-label" style={{marginBottom: 14}}>
                {c.title}
              </div>
              <div className="col g3">
                {c.links.map((l) =>
                  l.external ? (
                    <a
                      key={l.label}
                      href={l.href}
                      className="t-sm muted row"
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      {l.label}
                      <ExternalGlyph />
                    </a>
                  ) : (
                    <Link key={l.label} href={l.href} className="t-sm muted">
                      {l.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>

        <div
          className="between"
          style={{padding: "20px 0 40px", borderTop: "1px solid var(--line)", flexWrap: "wrap"}}
        >
          <span className="t-xs faint">X Layer mainnet · chain 196</span>
          <span className="t-xs faint">Execution infrastructure. Not investment advice.</span>
        </div>
      </div>
    </footer>
  );
}
