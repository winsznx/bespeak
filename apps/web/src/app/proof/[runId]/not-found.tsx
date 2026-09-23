import Link from "next/link";
import {StatusPage} from "@/components/StatusPage";

export default function ProofNotFound() {
  return (
    <StatusPage
      headline="Run not"
      serif="found."
      body="No verification run with that id exists. Runs are created when an execution is independently verified on X Layer."
      actions={
        <>
          <Link href="/markets" className="btn btn-primary btn-lg">
            Explore markets
          </Link>
          <Link href="/" className="btn btn-lg">
            Go home
          </Link>
        </>
      }
    />
  );
}
