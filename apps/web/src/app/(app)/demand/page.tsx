import Link from "next/link";
import {getDemand, REGISTRY, deployment} from "@/lib/server";
import {formatAmount} from "@/lib/format";
import {AssetIdentity, TokenIdentity} from "@/components/identity";

export const revalidate = 30;

/// Committed demand for assets not executable on X Layer yet.
///
/// Every figure is a live reservation on an active order. No votes, no waitlist, no wallet
/// counts standing in for interest. With one $50 commitment the board says $50 and one
/// order, and says so on an otherwise empty page.
export default async function DemandPage() {
  const deployed = deployment() !== null;
  const rows = deployed ? await getDemand() : [];
  const stable = Object.values(REGISTRY.stables)[0]!;
  const totalCommitted = rows.reduce((acc, r) => acc + r.committed, 0n);
  const totalOrders = rows.reduce((acc, r) => acc + r.orders, 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Demand</h1>
          <p className="t-sm muted prose" style={{margin: 0, maxWidth: "58ch"}}>
            Capital already reserved for official xStocks that Bespeak cannot execute on
            X Layer yet. These are funded commitments that execute automatically once the
            asset becomes tradable, or release at their deadline.
          </p>
        </div>
      </div>

      {rows.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            borderTop: "1px solid var(--line)",
            borderBottom: "1px solid var(--line)",
            marginBottom: 28,
          }}
        >
          <div style={{padding: "24px 24px 24px 0"}}>
            <div className="t-label" style={{marginBottom: 9}}>Total committed</div>
            <div className="t-figure">
              {formatAmount(totalCommitted, stable.decimals)}
            </div>
            <div style={{marginTop: 8}}>
              <TokenIdentity symbol={stable.symbol} size="xs" muted />
            </div>
          </div>
          <div style={{padding: "24px 0 24px 24px", borderLeft: "1px solid var(--line)"}}>
            <div className="t-label" style={{marginBottom: 9}}>Active commitments</div>
            <div className="t-figure">{totalOrders}</div>
            <div className="t-xs faint" style={{marginTop: 5}}>reservations</div>
          </div>
        </div>
      )}

      {!deployed ? (
        <div className="module empty-state">
          <div className="t-h3">Not deployed on this network yet</div>
          <p className="t-sm muted prose" style={{maxWidth: "46ch", margin: "0 auto"}}>
            Committed demand appears once the Bespeak contracts are live on X Layer.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="module empty-state">
          <div className="t-h3">No committed demand yet</div>
          <p className="t-sm muted prose" style={{maxWidth: "48ch", margin: "0 auto 18px"}}>
            When someone reserves funds for an asset that is not executable here, it appears
            with the real amount committed — never a placeholder.
          </p>
          <Link href="/markets" className="btn">Browse markets</Link>
        </div>
      ) : (
        <div className="module" style={{padding: "4px 24px", overflowX: "auto"}}>
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="num">Committed</th>
                <th className="num">Orders</th>
                <th>Earliest expiry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const a = REGISTRY.assets.find(
                  (x) => x.assetId.toLowerCase() === r.assetId.toLowerCase(),
                );
                return (
                  <tr key={r.assetId}>
                    <td>
                      <AssetIdentity
                        symbol={a?.symbol ?? ""}
                        underlyingSymbol={a?.underlyingSymbol ?? "Unknown"}
                        variant="row"
                        showName={false}
                      />
                    </td>
                    <td className="num">
                      <span className="row g2" style={{justifyContent: "flex-end"}}>
                        {formatAmount(r.committed, stable.decimals)}
                        <TokenIdentity symbol={stable.symbol} size="xs" showLabel={false} />
                      </span>
                    </td>
                    <td className="num">{r.orders}</td>
                    <td className="t-sm muted">
                      {new Date(Number(r.earliestExpiry) * 1000).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        timeZone: "UTC",
                      })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="t-xs faint prose" style={{marginTop: 22, maxWidth: "70ch"}}>
        These figures count reserved capital on active orders and nothing else. They are not
        a measure of adoption, and multiple orders may belong to the same person.
      </p>
    </>
  );
}
