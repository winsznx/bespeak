import Link from "next/link";

/// A zero state that does work rather than apologising for itself.
///
/// The pattern: an editorial header explaining what belongs here, a real next action, and
/// a context panel carrying live product data so the page is informative even with no
/// user history. It is left-aligned and full-width — a small centred message floating in
/// an empty region is what makes a route feel abandoned.
export function ZeroState({
  title,
  body,
  primary,
  secondary,
  context,
  contextTitle,
}: {
  title: string;
  body: string;
  primary?: {href: string; label: string};
  secondary?: {href: string; label: string};
  context?: React.ReactNode;
  contextTitle?: string;
}) {
  return (
    <div className="zero">
      <div className="zero-head">
        <h2 className="t-h2" style={{marginBottom: 10}}>
          {title}
        </h2>
        <p className="t-body muted prose" style={{margin: "0 0 24px", maxWidth: "46ch"}}>
          {body}
        </p>
        <div className="row wrap g2">
          {primary && (
            <Link href={primary.href} className="btn btn-primary">
              {primary.label}
            </Link>
          )}
          {secondary && (
            <Link href={secondary.href} className="btn">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>

      {context && (
        <div className="zero-context">
          {contextTitle && (
            <div className="t-label" style={{marginBottom: 14}}>
              {contextTitle}
            </div>
          )}
          {context}
        </div>
      )}
    </div>
  );
}
