"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useReadContract, useWriteContract} from "wagmi";
import {parseUnits, type Address} from "viem";
import {BespeakVaultAbi, BespeakVaultFactoryAbi} from "@bespeak/sdk";
import {clientDeployment} from "@/lib/addresses";
import {formatAmount, shortAddress} from "@/lib/format";
import {useVault} from "@/lib/useVault";

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

  if (!isConnected) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>Connect your wallet to open your vault.</p>
      </div>
    );
  }
  if (!clientDeployment()) {
    return (
      <div className="empty">
        <p style={{margin: 0}}>Bespeak is not deployed on this network yet.</p>
      </div>
    );
  }

  return (
    <>
      <div className="wrap-row gap-4 mb-24">
        {stables.map((s) => (
          <button
            key={s.symbol}
            className="nav-link"
            onClick={() => setSymbol(s.symbol)}
            data-active={symbol === s.symbol}
            style={{border: 0, background: symbol === s.symbol ? "var(--surface-quiet)" : "transparent", cursor: "pointer", font: "inherit", fontSize: 14}}
          >
            {s.symbol}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          marginBottom: 32,
        }}
      >
        <div style={{padding: "24px 24px 24px 0"}}>
          <div className="overline mb-8">Available</div>
          <div className="figure">{vault.availableFormatted}</div>
          <div className="tiny faint mt-4">Withdrawable, or usable for a new order</div>
        </div>
        <div style={{padding: "24px 24px 24px 0"}}>
          <div className="overline mb-8">Reserved</div>
          <div className="figure" style={{color: "var(--waiting)"}}>
            {vault.reservedFormatted}
          </div>
          <div className="tiny faint mt-4">Backing your active orders</div>
        </div>
        <div style={{padding: "24px 0"}}>
          <div className="overline mb-8">Total</div>
          <div className="figure" style={{color: "var(--text-2)"}}>
            {vault.totalFormatted}
          </div>
          <div className="tiny faint mt-4">{stable.symbol} in your vault</div>
        </div>
      </div>

      <div className="grid-auto">
        <DepositCard stable={stable} vaultAddress={vault.address} exists={vault.exists} onDone={vault.refetch} />
        <WithdrawCard stable={stable} vault={vault} onDone={vault.refetch} />
      </div>

      {vault.address && (
        <details className="tech" style={{marginTop: 16}}>
          <summary>Vault details</summary>
          <dl className="kv">
            <dt>Your vault address</dt>
            <dd>{vault.address}</dd>
            <dt>Status</dt>
            <dd>{vault.exists ? "deployed" : "not deployed yet — created with your first order"}</dd>
            <dt>Owner</dt>
            <dd>{address}</dd>
          </dl>
        </details>
      )}
    </>
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
      setErr(e instanceof Error ? e.message.split("\n")[0]! : "Deposit failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="panel panel-pad">
      <h2>Deposit</h2>
      <p className="small muted" style={{marginTop: 0}}>
        In your wallet: {formatAmount(bal, stable.decimals)} {stable.symbol}
      </p>
      <input
        className="input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{marginBottom: 10}}
      />
      <button className="btn btn-primary" style={{width: "100%"}} onClick={deposit} disabled={Boolean(busy) || !amount}>
        {busy ?? `Deposit ${stable.symbol}`}
      </button>
      {err && <p className="tiny" style={{color: "var(--negative)", marginBottom: 0}}>{err}</p>}
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
    <div className="panel panel-pad">
      <h2>Withdraw</h2>
      <p className="small muted" style={{marginTop: 0}}>
        Available to withdraw: {vault.availableFormatted} {stable.symbol}
      </p>
      <input
        className="input"
        inputMode="decimal"
        placeholder="0.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        style={{marginBottom: 10}}
      />
      <button
        className="btn"
        style={{width: "100%"}}
        onClick={withdraw}
        disabled={busy || !amount || !vault.exists}
      >
        {busy ? "Withdrawing…" : `Withdraw ${stable.symbol}`}
      </button>
      {err && <p className="tiny" style={{color: "var(--negative)", marginBottom: 0}}>{err}</p>}
      <p className="tiny muted" style={{marginBottom: 0}}>
        Reserved funds need their order cancelled or expired first.
      </p>
    </div>
  );
}

export {shortAddress};
