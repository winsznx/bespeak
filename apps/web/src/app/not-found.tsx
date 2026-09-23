import Link from "next/link";
import type {Metadata} from "next";
import {StatusPage} from "@/components/StatusPage";

export const metadata: Metadata = {
  title: "Not found — Bespeak",
  robots: {index: false, follow: false},
};

/// Root not-found. Covers any unknown URL as a real 404, never a redirect to the homepage:
/// silently sending a bad link to `/` hides broken links from everyone including us.
export default function NotFound() {
  return (
    <StatusPage
      code="404"
      headline="Missed the"
      serif="market."
      body="This route isn't available. It may have moved, or the link may be incomplete."
      actions={
        <>
          <Link href="/" className="btn btn-primary btn-lg">
            Go home
          </Link>
          <Link href="/markets" className="btn btn-lg">
            Explore markets
          </Link>
        </>
      }
    />
  );
}
