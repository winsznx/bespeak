import Link from "next/link";

export default function ReceiptNotFound() {
  return (
    <div className="module empty-state" style={{marginTop: 24}}>
      <div className="t-h3">Receipt not found</div>
      <p className="t-sm muted prose" style={{maxWidth: "46ch", margin: "0 auto 20px"}}>
        No order with that id exists on this deployment. Receipts are created when an order
        executes, so an order that is still waiting will not have one yet.
      </p>
      <div className="row g2" style={{justifyContent: "center"}}>
        <Link href="/orders" className="btn">
          Your orders
        </Link>
        <Link href="/activity" className="btn btn-quiet">
          Activity
        </Link>
      </div>
    </div>
  );
}
