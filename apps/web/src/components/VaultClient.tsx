"use client";

import {useState} from "react";
import Link from "next/link";
import {useAccount, usePublicClient, useReadContract, useWriteContract} from "wagmi";
import {parseUnits, type Address} from "viem";
import {BespeakVaultAbi, BespeakVaultFactoryAbi} from "@bespeak/sdk";
import {OrderStatus} from "@bespeak/shared";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount} from "@/lib/format";
import {useVault} from "@/lib/useVault";
import {useOrderRecords} from "@/lib/useOrders";
import {Skeleton} from "./ui/Skeleton";
import {AssetGlyph} from "./ui/AssetGlyph";

interface Stable {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
}

const ERC20 = [
  {name: "balanceOf", type: "function", stateMutability: "view", inputs: [{type: "address"}], outputs: [{type: "uint256"}]},
  {name: "allowance", type: "function", stateMutability: "view", inputs: [{type: "address"}, {type: "address"}], outputs: [{type: "uint256"}]},
  {name: "approve", type: "function", stateMutability: "nonpayable", inputs: [{type: "address"}, {type: "uint256"}], outputs: [{type: "bool"}]},
] as const;

export function VaultClient({stables}: {stables: Stable[]}) {
  const {address, isConnected} = useAccount();
  const [symbol, setSymbol] = useState(stables[0]?.symbol ?? "USDC");
  const stable = stables.find((s) => s.symbol === symbol) ?? stables[0]!;
  const vault = useVault(address, stable);
  const {orders} = useOrderRecords(address);

  const reservations = orders.filter(
    (o) => o.status === OrderStatus.ACTIVE && o.inputToken.toLowerCase() === stable.address.toLowerCase(),
  );
  const pending = isConnected && vault.available === null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Vault</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            Your own vault contract, not a shared pool. Only an order you created can spend
            from it, up to what that order reserved.
          </p>
        </div>
        <div className="row g1 page-actions">
          {stables.map((s) => (
            <button
              key={s.symbol}
              className="btn btn-sm"
              onClick={() => setSymbol(s.symbol)}
              style={
                symbol === s.symbol
                  ? {background: "var(--ink)", borderColor: "var(--ink)", color: "var(--surface)"}
                  : undefined
              }
            >
              {s.symbol}
            </button>
          ))}
        </div>
      </div>

      {!isConnected ? (
        <div className="module empty-state">
          <div className="t-h3">Connect a wallet</div>
          <p className="t-sm muted prose" style={{maxWidth: "44ch", margin: "0 auto"}}>
            Your vault is created the first time you deposit or set an order.
          </p>
        </div>
      ) : !clientDeployment() ? (
        <div className="module empty-state">
          <div className="t-h3">Not deployed on this network yet</div>
          <p className="t-sm muted prose" style={{maxWidth: "46ch", margin: "0 auto"}}>
            Vaults become available once the Bespeak contracts are live on X Layer.
          </p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
              marginBottom: 28,
            }}
          >
            <Figure
              label="Available"
              value={vault.availableFormatted}
              sub="Withdrawable or usable now"
              pending={pending}
            />
            <Figure
              label="Reserved"
              value={vault.reservedFormatted}
              sub="Backing active orders"
              tone="var(--waiting)"
              pending={pending}
              bordered
            />
            <Figure
              label="Total"
              value={vault.totalFormatted}
              sub={`${stable.symbol} in your vault`}
              tone="var(--ink-2)"
              pending={pending}
              bordered
            />
          </div>

          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              marginBottom: 28,
            }}
          >
            <DepositCard
              stable={stable}
              vaultAddress={vault.address}
              exists={vault.exists}
              onDone={vault.refetch}
            />
            <WithdrawCard stable={stable} vault={vault} onDone={vault.refetch} />
          </div>

          <section className="module module-pad" style={{marginBottom: 20}}>
            <div className="between" style={{marginBottom: 18}}>
              <h2 className="t-h3">Reserved by</h2>
              <Link href="/orders" className="t-xs muted">
                All orders
              </Link>
            </div>
            {reservations.length === 0 ? (
              <p className="t-sm muted prose" style={{margin: 0}}>
                No active orders are holding {stable.symbol} right now. Everything in the vault
                is available.
              </p>
            ) : (
              <div className="col g4">
                {reservations.map((o) => (
                  <div className="row g3" key={o.id}>
                    <AssetGlyph symbol="??" size={30} />
                    <div className="grow" style={{minWidth: 0}}>
                      <div className="t-sm truncate" style={{fontWeight: 500}}>
                        Order {o.id.slice(0, 10)}
                      </div>
                      <div className="t-xs faint">Reserved until it executes or expires</div>
                    </div>
                    <span className="t-sm" style={{fontWeight: 500}}>
                      ${formatAmount(o.amountIn, stable.decimals)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {vault.address && (
            <details className="tech">
              <summary>Vault details</summary>
              <dl className="kv" style={{paddingBottom: 24}}>
                <dt>Your vault address</dt>
                <dd className="mono">{vault.address}</dd>
                <dt>Status</dt>
                <dd>{vault.exists ? "deployed" : "not deployed yet — created on first deposit"}</dd>
                <dt>Owner</dt>
                <dd className="mono">{address}</dd>
                <dt>Token</dt>
                <dd className="mono">{stable.address}</dd>
              </dl>
            </details>
          )}
        </>
      )}
    </>
  );
}

function Figure({
  label,
  value,
  sub,
  tone,
  pending,
  bordered,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: string;
  pending: boolean;
  bordered?: boolean;
}) {
  return (
    <div
      style={{
        padding: "26px 26px 26px 0",
        borderLeft: bordered ? "1px solid var(--line)" : undefined,
        paddingLeft: bordered ? 26 : 0,
      }}
    >
      <div className="t-label" style={{marginBottom: 9}}>
        {label}
      </div>
      {pending ? (
        <Skeleton w="70%" h={32} r={8} />
      ) : (
        <div className="t-figure" style={{color: tone}}>
          {value}
        </div>
      )}
      <div className="t-xs faint" style={{marginTop: 5}}>
        {sub}
      </div>
    </div>
  );
}

function DepositCard({
  stable,
  vaultAddress,
  exists,
  onDone,
}: {
  stable: Stable;
  vaultAddress: Address | null;
  exists: boolean;
  onDone: () => void;
}) {
  const {address} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const walletBalance = useReadContract({
    address: stable.address,
    abi: ERC20,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {enabled: Boolean(address), refetchInterval: 10_000},
  });
  const bal = (walletBalance.data as bigint | undefined) ?? 0n;

  async function deposit() {
    const d = clientDeployment();
    if (!d || !address || !publicClient) return;
    let raw: bigint;
    try {
      raw = parseUnits(amount, stable.decimals);
    } catch {
      setErr("Enter a valid amount");
      return;
    }
    if (raw <= 0n) return;
    setErr(null);
    try {
      let vault = vaultAddress;
      if (!exists) {
        setBusy("Creating your vault…");
        const h = await writeContractAsync({
          address: d.vaultFactory,
          abi: BespeakVaultFactoryAbi,
          functionName: "ensureVault",
          args: [address],
        });
        await publicClient.waitForTransactionReceipt({hash: h});
        vault = (await publicClient.readContract({
          address: d.vaultFactory,
          abi: BespeakVaultFactoryAbi,
          functionName: "vaultOf",
          args: [address],
        })) as Address;
      }
      if (!vault) throw new Error("vault unavailable");

      const allowance = (await publicClient.readContract({
        address: stable.address,
        abi: ERC20,
        functionName: "allowance",
        args: [address, vault],
      })) as bigint;

      if (allowance < raw) {
        setBusy(`Approving ${stable.symbol}…`);
        const h = await writeContractAsync({
          address: stable.address,
          abi: ERC20,
          functionName: "approve",
          args: [vault, raw],
        });
        await publicClient.waitForTransactionReceipt({hash: h});
      }

      setBusy("Depositing…");
      const h = await writeContractAsync({
        address: vault,
        abi: BespeakVaultAbi,
        functionName: "deposit",
        args: [stable.address, raw],
      });
      await publicClient.waitForTransactionReceipt({hash: h});
      setAmount("");
      onDone();
      void walletBalance.refetch();
    } catch (e) {
      setErr(e instanceof Error ? (e.message.split("\n")[0] ?? "Deposit failed") : "Deposit failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="module module-pad">
      <h2 className="t-h3" style={{marginBottom: 6}}>
        Deposit
      </h2>
      <p className="t-xs faint" style={{margin: "0 0 14px"}}>
        In your wallet: {formatAmount(bal, stable.decimals)} {stable.symbol}
      </p>
      <input
        className="input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{marginBottom: 12}}
        aria-label={`Amount of ${stable.symbol} to deposit`}
      />
      <button
        className="btn btn-primary btn-block"
        onClick={deposit}
        disabled={Boolean(busy) || !amount}
      >
        {busy ?? `Deposit ${stable.symbol}`}
      </button>
      {err && (
        <p className="t-sm" style={{color: "var(--danger)", margin: "10px 0 0"}}>
          {err}
        </p>
      )}
    </div>
  );
}

function WithdrawCard({
  stable,
  vault,
  onDone,
}: {
  stable: Stable;
  vault: ReturnType<typeof useVault>;
  onDone: () => void;
}) {
  const {address} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function withdraw() {
    if (!vault.address || !address || !publicClient) return;
    let raw: bigint;
    try {
      raw = parseUnits(amount, stable.decimals);
    } catch {
      setErr("Enter a valid amount");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const h = await writeContractAsync({
        address: vault.address,
        abi: BespeakVaultAbi,
        functionName: "withdraw",
        args: [stable.address, raw, address],
      });
      await publicClient.waitForTransactionReceipt({hash: h});
      setAmount("");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setErr(
        /InsufficientAvailable/i.test(msg)
          ? "That amount is reserved by an active order. Cancel it first to free the funds."
          : msg.split("\n")[0] || "Withdrawal failed",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="module module-pad">
      <h2 className="t-h3" style={{marginBottom: 6}}>
        Withdraw
      </h2>
      <p className="t-xs faint" style={{margin: "0 0 14px"}}>
        Available: {vault.availableFormatted} {stable.symbol}
      </p>
      <input
        className="input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{marginBottom: 12}}
        aria-label={`Amount of ${stable.symbol} to withdraw`}
      />
      <button
        className="btn btn-block"
        onClick={withdraw}
        disabled={busy || !amount || !vault.exists}
      >
        {busy ? "Withdrawing…" : `Withdraw ${stable.symbol}`}
      </button>
      {err && (
        <p className="t-sm" style={{color: "var(--danger)", margin: "10px 0 0"}}>
          {err}
        </p>
      )}
    </div>
  );
}
