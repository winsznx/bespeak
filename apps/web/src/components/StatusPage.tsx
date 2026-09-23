import Link from "next/link";
import {BespeakLogo} from "./brand/BespeakLogo";

/// The shared composition for 404 and error states.
///
/// Editorial rather than apologetic, and always offering a real way onward. It renders
/// standalone (no app shell) so it works for an unknown URL that never matched a route
/// group at all.
export function StatusPage({
  code,
  headline,
  serif,
  body,
  actions,
  detail,
}: {
  code?: string;
  headline: string;
  serif?: string;
  body: string;
  actions: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--page)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="site-inner" style={{paddingTop: 28, width: "100%"}}>
        <Link href="/" aria-label="Bespeak home">
          <BespeakLogo height={34} />
        </Link>
      </div>

      <div
        className="site-inner grow"
        style={{display: "flex", alignItems: "center", paddingBottom: "10vh", width: "100%"}}
      >
        <div style={{maxWidth: 620}}>
          {code && (
            <div
              className="t-label"
              style={{marginBottom: 20, color: "var(--ink-3)", letterSpacing: "0.1em"}}
            >
              {code}
            </div>
          )}
          <h1 className="t-h1" style={{marginBottom: 20}}>
            {headline}
            {serif && (
              <>
                {" "}
                <span className="serif">{serif}</span>
              </>
            )}
          </h1>
          <p className="t-body-lg muted prose" style={{margin: "0 0 32px", maxWidth: "44ch"}}>
            {body}
          </p>
          <div className="row wrap g3">{actions}</div>
          {detail && <div style={{marginTop: 32}}>{detail}</div>}
        </div>
      </div>
    </div>
  );
}
