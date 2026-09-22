import Link from "next/link";
import {getDemand, REGISTRY, deployment} from "@/lib/server";
import {formatAmount} from "@/lib/format";

export const revalidate = 30;

/// Committed demand for assets not yet executable on X Layer.
///
/// Every number here is a live reservation on an active order. There are no votes, no
/// waitlist signups and no wallet counts standing in for interest. If one person has
/// committed $50, the board says $50 and one order (PRD 31).
export default async function DemandPage() {
  const deployed = deployment() !== null;
  const rows = deployed ? await getDemand() : [];
  const stable = Object.values(REGISTRY.stables)[0]!;

  const totalCommitted = rows.reduce((acc, r) => acc + r.committed, 0n);
  const totalOrders = rows.reduce((acc, r) => acc + r.orders, 0);

  return (
    <section className="section">
      <h1>Demand</h1>
      <p className="lede">
        Capital already reserved for official xStocks that Bespeak cannot execute on X Layer
        yet. These are funded commitments that execute automatically once the asset becomes
        tradable, or release automatically at their deadline.
      </p>

      {!deployed ? (
        <div className="empty">
          <p style={{margin: 0}}>
            Bespeak is not deployed on this network yet, so there is no committed demand to
            report.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <p style={{marginTop: 0}}>No committed demand yet.</p>
          <p className="small muted" style={{maxWidth: "48ch", margin: "0 auto 16px"}}>
            When someone reserves funds for an asset that is not yet executable here, it
            appears on this board with the real amount committed.
          </p>
          <Link className="btn btn-sm" href="/markets">
            Browse markets
          </Link>
        </div>
      ) : (
        <>
          <div className="grid-auto" style={{marginBottom: 20}}>
            <div className="panel panel-pad">
              <h3 className="muted small" style={{fontWeight: 500}}>Total committed</h3>
              <div style={{fontSize: 24, fontWeight: 600}}>
                {formatAmount(totalCommitted, stable.decimals)} {stable.symbol}
              </div>
            </div>
            <div className="panel panel-pad">
              <h3 className="muted small" style={{fontWeight: 500}}>Active commitments</h3>
              <div style={{fontSize: 24, fontWeight: 600}}>{totalOrders}</div>
            </div>
          </div>

          <div style={{overflowX: "auto"}}>
            <table className="table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th className="num">Committed capital</th>
                  <th className="num">Orders</th>
                  <th>Earliest expiry</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const asset = REGISTRY.assets.find(
                    (a) => a.assetId.toLowerCase() === r.assetId.toLowerCase(),
                  );
                  return (
                    <tr key={r.assetId}>
                      <td>
                        <strong>{asset?.underlyingSymbol ?? "Unknown"}</strong>
                      </td>
                      <td className="num mono">
                        {formatAmount(r.committed, stable.decimals)} {stable.symbol}
                      </td>
                      <td className="num">{r.orders}</td>
                      <td className="small muted">
                        {new Date(Number(r.earliestExpiry) * 1000).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="tiny muted" style={{marginTop: 16, maxWidth: "70ch"}}>
        These figures count reserved capital on active orders and nothing else. They are not
        a measure of adoption, and multiple orders may belong to the same person.
      </p>
    </section>
  );
}
