"use client";

import Link from "next/link";
import {useMemo} from "react";
import {useAccount} from "wagmi";
import type {Address} from "viem";
import {OrderStatus, TriggerType} from "@bespeak/shared";
import {useOrderRecords} from "@/lib/useOrders";
import {useVault} from "@/lib/useVault";
import {formatAmount} from "@/lib/format";
import {AssetGlyph} from "@/components/ui/AssetGlyph";
import {Skeleton} from "@/components/ui/Skeleton";
import {Icon} from "@/components/ui/Icon";
import {Countdown} from "@/components/Countdown";
import {ExecutionActivity} from "./ExecutionActivity";
import {VaultAllocation} from "./VaultAllocation";

interface AssetLite {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  payWith: string | null;
}
interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

export function DashboardClient({
  deployed,
  assets,
  stables,
  openNow,
  nextOpenIso,
  nextOpenLabel,
}: {
  deployed: boolean;
  assets: AssetLite[];
  stables: Stable[];
  openNow: string[];
  nextOpenIso: string;
  nextOpenLabel: string;
}) {
  const {address, isConnected} = useAccount();
  const {orders, isLoading} = useOrderRecords(address);
  const stable = stables[0]!;
  const vault = useVault(address, stable);

  const active = useMemo(() => orders.filter((o) => o.status === OrderStatus.ACTIVE), [orders]);
  const filled = useMemo(() => orders.filter((o) => o.status === OrderStatus.FILLED), [orders]);

  const waitingForSession = active.filter(
    (o) => o.triggerType === TriggerType.NEXT_REGULAR_SESSION,
  ).length;

  const pending = isConnected && (isLoading || vault.available === null);
  const ready = isConnected && deployed && !pending;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Overview</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            Your standing orders, capital and next market moments.
          </p>
        </div>
        <div className="row g2 page-actions">
          <Link href="/markets" className="btn btn-primary">
            <Icon name="arrow" size={16} />
            Set an order
          </Link>
          <Link href="/vault" className="btn">
            Deposit
          </Link>
        </div>
      </div>

      {!deployed && (
        <div
          className="module module-pad"
          style={{
            marginBottom: 16,
            background: "var(--waiting-soft)",
            borderColor: "var(--waiting-line)",
          }}
        >
          <div className="t-h4" style={{color: "var(--waiting)", marginBottom: 4}}>
            Not yet deployed on this network
          </div>
          <p className="t-sm prose" style={{margin: 0, color: "var(--waiting)"}}>
            Market data below is live. Vaults and orders become available once the Bespeak
            contracts are deployed to X Layer.
          </p>
        </div>
      )}

      {/* ---------------- summary row ---------------- */}
      <div className="sum-row" style={{marginBottom: 16}}>
        <div className="sum sum-brand">
          <div className="between" style={{marginBottom: "auto"}}>
            <span className="t-label" style={{color: "inherit", opacity: 0.8}}>
              Vault balance
            </span>
            <Link
              href="/vault"
              aria-label="Open vault"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background: "color-mix(in srgb, var(--brand-ink) 18%, transparent)",
                color: "var(--brand-ink)",
              }}
            >
              <Icon name="arrow" size={15} />
            </Link>
          </div>
          <Figure
            value={ready ? `$${vault.totalFormatted}` : null}
            pending={pending}
            placeholder={isConnected ? undefined : "—"}
          />
          <span className="t-xs" style={{opacity: 0.8}}>
            {isConnected ? `${stable.symbol} in your vault` : "Connect a wallet"}
          </span>
        </div>

        <SumCard
          label="Available"
          value={ready ? `$${vault.availableFormatted}` : null}
          pending={pending}
          sub="Withdrawable or usable now"
          connected={isConnected}
        />
        <SumCard
          label="Active orders"
          value={ready ? String(active.length) : null}
          pending={pending}
          sub={
            waitingForSession > 0
              ? `${waitingForSession} waiting for a session`
              : "Standing instructions"
          }
          connected={isConnected}
        />
        <SumCard
          label="Reserved"
          value={ready ? `$${vault.reservedFormatted}` : null}
          pending={pending}
          sub="Backing active orders"
          connected={isConnected}
        />
      </div>

      {/* ---------------- second row ---------------- */}
      <div className="dash-row-2" style={{marginBottom: 16}}>
        <section className="module module-pad span-2">
          <div className="between" style={{marginBottom: 20}}>
            <h2 className="t-h3">Execution activity</h2>
            <span className="t-xs faint">Last 7 sessions</span>
          </div>
          <ExecutionActivity orders={orders} pending={pending} connected={isConnected} />
        </section>

        <section className="module module-pad">
          <h2 className="t-h3" style={{marginBottom: 16}}>
            Next market event
          </h2>
          <div className="t-label" style={{marginBottom: 6}}>
            Regular session opens
          </div>
          <div className="t-figure-sm" style={{marginBottom: 4}}>
            <Countdown to={nextOpenIso} />
          </div>
          <div className="t-sm muted" style={{marginBottom: 18}}>
            {nextOpenLabel}
          </div>

          <div className="t-sm muted prose" style={{marginBottom: 18}}>
            {openNow.length > 0
              ? `${openNow.length} underlying markets are open right now.`
              : "All underlying markets are outside their regular session."}
            {waitingForSession > 0 && ` ${waitingForSession} of your orders are waiting on it.`}
          </div>

          <Link href="/orders" className="btn btn-sm">
            View orders
          </Link>
        </section>

        <section className="module module-pad">
          <div className="between" style={{marginBottom: 16}}>
            <h2 className="t-h3">Active orders</h2>
            <Link href="/orders" className="t-xs muted">
              View all
            </Link>
          </div>

          {pending ? (
            <div className="col g4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="row g3">
                  <Skeleton w={30} h={30} r={10} />
                  <div className="grow col g2">
                    <Skeleton w="62%" h={11} />
                    <Skeleton w="40%" h={9} />
                  </div>
                </div>
              ))}
            </div>
          ) : active.length === 0 ? (
            <div>
              <p className="t-sm muted prose" style={{margin: "0 0 16px"}}>
                {isConnected
                  ? "Nothing waiting right now."
                  : "No standing orders yet. These markets are ready to schedule."}
              </p>
              <div className="col g4">
                {assets.slice(0, 3).map((a) => (
                  <Link href={`/asset/${a.symbol}`} className="row g3" key={a.assetId}>
                    <AssetGlyph symbol={a.symbol} size={30} />
                    <div className="grow" style={{minWidth: 0}}>
                      <div className="t-sm truncate" style={{fontWeight: 500}}>
                        {a.underlyingSymbol}
                      </div>
                      <div className="t-xs faint truncate">
                        {openNow.includes(a.underlyingSymbol) ? "In session" : "Opens next session"}
                      </div>
                    </div>
                    {a.payWith && <span className="chip chip-outline">{a.payWith}</span>}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <div className="col g4">
              {active.slice(0, 4).map((o) => {
                const a = assets.find(
                  (x) => x.assetId.toLowerCase() === o.assetId.toLowerCase(),
                );
                const st = stables.find(
                  (s) => s.address.toLowerCase() === o.inputToken.toLowerCase(),
                );
                return (
                  <div className="row g3" key={o.id}>
                    <AssetGlyph symbol={a?.symbol ?? "??"} size={30} />
                    <div className="grow" style={{minWidth: 0}}>
                      <div className="t-sm truncate" style={{fontWeight: 500}}>
                        {a?.underlyingSymbol ?? "Asset"}
                      </div>
                      <div className="t-xs faint truncate">
                        {conditionLabel(o.triggerType)}
                      </div>
                    </div>
                    <div style={{textAlign: "right"}}>
                      <div className="t-sm" style={{fontWeight: 500}}>
                        ${st ? formatAmount(o.amountIn, st.decimals) : "—"}
                      </div>
                      <div className="t-xs" style={{color: "var(--waiting)"}}>
                        Waiting
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ---------------- bottom row ---------------- */}
      <div className="dash-row-3">
        <section className="module module-pad">
          <div className="between" style={{marginBottom: 18}}>
            <h2 className="t-h3">Recent activity</h2>
            <Link href="/activity" className="t-xs muted">
              View all
            </Link>
          </div>

          {pending ? (
            <div className="col g5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="row g3">
                  <Skeleton w={34} h={34} r={11} />
                  <div className="grow col g2">
                    <Skeleton w="54%" h={11} />
                    <Skeleton w="34%" h={9} />
                  </div>
                  <Skeleton w={62} h={22} r={8} />
                </div>
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div>
              <p className="t-sm muted prose" style={{margin: "0 0 16px"}}>
                {isConnected
                  ? "Nothing has happened yet. Your first order will appear here."
                  : "No activity yet. Current market state across supported assets:"}
              </p>
              <div className="col g5">
                {assets.slice(0, 4).map((a) => (
                  <div className="row g3" key={a.assetId}>
                    <AssetGlyph symbol={a.symbol} size={34} />
                    <div className="grow" style={{minWidth: 0}}>
                      <div className="t-sm truncate" style={{fontWeight: 500}}>
                        {a.underlyingSymbol}
                      </div>
                      <div className="t-xs faint truncate">{a.name}</div>
                    </div>
                    <span className="t-sm muted" style={{whiteSpace: "nowrap"}}>
                      {a.payWith ?? "—"}
                    </span>
                    <span
                      className={
                        openNow.includes(a.underlyingSymbol)
                          ? "chip chip-success"
                          : "chip chip-inactive"
                      }
                    >
                      {openNow.includes(a.underlyingSymbol) ? "In session" : "Closed"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="col g5">
              {orders.slice(0, 4).map((o) => {
                const a = assets.find(
                  (x) => x.assetId.toLowerCase() === o.assetId.toLowerCase(),
                );
                const st = stables.find(
                  (s) => s.address.toLowerCase() === o.inputToken.toLowerCase(),
                );
                return (
                  <div className="row g3" key={o.id}>
                    <AssetGlyph symbol={a?.symbol ?? "??"} size={34} />
                    <div className="grow" style={{minWidth: 0}}>
                      <div className="t-sm truncate" style={{fontWeight: 500}}>
                        {a?.underlyingSymbol ?? "Asset"}
                      </div>
                      <div className="t-xs faint truncate">{eventLabel(o.status)}</div>
                    </div>
                    <div className="t-sm muted" style={{whiteSpace: "nowrap"}}>
                      ${st ? formatAmount(o.amountIn, st.decimals) : "—"}{" "}
                      <span className="faint">{st?.symbol}</span>
                    </div>
                    <StatusChip status={o.status} />
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="module module-pad">
          <h2 className="t-h3" style={{marginBottom: 16}}>
            Vault allocation
          </h2>
          <VaultAllocation
            available={vault.available}
            reserved={vault.reserved}
            connected={isConnected}
            pending={pending}
            symbol={stable.symbol}
          />
        </section>

        <NextExecution
          nextOpenIso={nextOpenIso}
          nextOpenLabel={nextOpenLabel}
          waiting={active.length}
          amount={
            active.length > 0 && stables[0]
              ? `$${formatAmount(
                  active.reduce((acc, o) => acc + o.amountIn, 0n),
                  stables[0].decimals,
                )}`
              : null
          }
        />
      </div>
    </>
  );
}

function SumCard({
  label,
  value,
  sub,
  pending,
  connected,
}: {
  label: string;
  value: string | null;
  sub: string;
  pending: boolean;
  connected: boolean;
}) {
  return (
    <div className="sum">
      <div className="t-label" style={{marginBottom: "auto"}}>
        {label}
      </div>
      <Figure value={value} pending={pending} placeholder={connected ? undefined : "—"} />
      <span className="t-xs faint">{sub}</span>
    </div>
  );
}

function Figure({
  value,
  pending,
  placeholder,
}: {
  value: string | null;
  pending: boolean;
  placeholder?: string | undefined;
}) {
  if (pending) {
    return <Skeleton w="64%" h={30} r={8} style={{margin: "10px 0 8px"}} />;
  }
  return (
    <div className="t-figure" style={{margin: "10px 0 6px"}}>
      {value ?? placeholder ?? "—"}
    </div>
  );
}

function StatusChip({status}: {status: number}) {
  if (status === OrderStatus.FILLED) return <span className="chip chip-success">Verified</span>;
  if (status === OrderStatus.CANCELLED) return <span className="chip chip-inactive">Cancelled</span>;
  if (status === OrderStatus.EXPIRED) return <span className="chip chip-inactive">Expired</span>;
  return (
    <span className="chip chip-waiting">
      <span className="dot" />
      Waiting
    </span>
  );
}

function NextExecution({
  nextOpenIso,
  nextOpenLabel,
  waiting,
  amount,
}: {
  nextOpenIso: string;
  nextOpenLabel: string;
  waiting: number;
  amount: string | null;
}) {
  return (
    <section
      style={{
        background: "var(--invert)",
        color: "var(--invert-ink)",
        borderRadius: "var(--r-module)",
        padding: "var(--s-6)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="t-label" style={{color: "var(--invert-ink-2)", marginBottom: 14}}>
        Next execution window
      </div>

      <div
        className="t-figure"
        style={{fontVariantNumeric: "tabular-nums", marginBottom: 6, letterSpacing: "-0.03em"}}
      >
        <Countdown to={nextOpenIso} />
      </div>
      <div className="t-sm" style={{color: "var(--invert-ink-2)", marginBottom: "auto"}}>
        {nextOpenLabel}
      </div>

      <div style={{marginTop: 20}}>
        {waiting > 0 ? (
          <div className="t-sm" style={{marginBottom: 14}}>
            {waiting} order{waiting === 1 ? "" : "s"} waiting
            {amount ? ` · ${amount} reserved` : ""}
          </div>
        ) : (
          <div className="t-sm" style={{color: "var(--invert-ink-2)", marginBottom: 14}}>
            No orders waiting on this session.
          </div>
        )}
        <Link
          href="/orders"
          className="btn btn-sm btn-block"
          style={{
            background: "var(--invert-ink)",
            borderColor: "var(--invert-ink)",
            color: "var(--invert)",
          }}
        >
          View
        </Link>
      </div>
    </section>
  );
}

function conditionLabel(t: number): string {
  if (t === TriggerType.IMMEDIATE) return "Buy now";
  if (t === TriggerType.NEXT_REGULAR_SESSION) return "Next regular session";
  return "When available";
}

function eventLabel(status: number): string {
  if (status === OrderStatus.FILLED) return "Purchase completed";
  if (status === OrderStatus.CANCELLED) return "Order cancelled";
  if (status === OrderStatus.EXPIRED) return "Order expired";
  return "Capital reserved";
}
