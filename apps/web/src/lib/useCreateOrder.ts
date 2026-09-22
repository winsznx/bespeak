"use client";

import {useState} from "react";
import {useAccount, usePublicClient, useWriteContract} from "wagmi";
import {type Address, type Hash} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultFactoryAbi} from "@bespeak/sdk";
import {TriggerType, SourceTier} from "@bespeak/shared";
import {clientDeployment} from "./addresses";
import type {ComposerAsset} from "@/components/OrderComposer";

export interface SubmitArgs {
  asset: ComposerAsset;
  stable: {address: Address; decimals: number; symbol: string};
  amountRaw: bigint;
  condition: number;
  recurring: {intervalDays: number; occurrences: number} | null;
  slippageBps: number;
  deadlineDays: number;
  receiver: Address;
}

/// Create an order, ensuring the user has a vault first.
///
/// The vault is created on demand rather than at connect time, so a user who is only
/// browsing never signs anything. `minAmountOut` is submitted as 0 here because the binding
/// floor comes from the route at execution time and is enforced by the contract; setting a
/// price floor at creation would require quoting a market that may be days away.
export function useCreateOrder() {
  const {address} = useAccount();
  const publicClient = usePublicClient();
  const {writeContractAsync} = useWriteContract();
  const [isPending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<Hash | null>(null);

  async function submit(args: SubmitArgs) {
    const d = clientDeployment();
    if (!d || !address || !publicClient) {
      setError("Bespeak is not configured for this network yet.");
      return;
    }

    setPending(true);
    setError(null);
    setOrderId(null);

    try {
      const existing = (await publicClient.readContract({
        address: d.vaultFactory,
        abi: BespeakVaultFactoryAbi,
        functionName: "vaultOf",
        args: [address],
      })) as Address;

      if (existing === "0x0000000000000000000000000000000000000000") {
        const hash = await writeContractAsync({
          address: d.vaultFactory,
          abi: BespeakVaultFactoryAbi,
          functionName: "ensureVault",
          args: [address],
        });
        await publicClient.waitForTransactionReceipt({hash});
      }

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = BigInt(now + args.deadlineDays * 86_400);

      if (args.recurring) {
        const hash = await writeContractAsync({
          address: d.orderManager,
          abi: BespeakOrderManagerAbi,
          functionName: "createRecurring",
          args: [
            {
              inputToken: args.stable.address,
              assetId: args.asset.assetId,
              receiver: args.receiver,
              amountPerOccurrence: args.amountRaw,
              minAmountOutPerOccurrence: 0n,
              maxSlippageBps: args.slippageBps,
              intervalSeconds: args.recurring.intervalDays * 86_400,
              totalOccurrences: args.recurring.occurrences,
              firstEligibleAt: BigInt(now),
              occurrenceTrigger: args.condition,
              minSourceTier: SourceTier.ATTESTED_SESSION,
            },
          ],
        });
        await publicClient.waitForTransactionReceipt({hash});
        setOrderId(hash);
      } else {
        const hash = await writeContractAsync({
          address: d.orderManager,
          abi: BespeakOrderManagerAbi,
          functionName: "createOrder",
          args: [
            {
              inputToken: args.stable.address,
              assetId: args.asset.assetId,
              receiver: args.receiver,
              triggerType: args.condition,
              amountIn: args.amountRaw,
              minAmountOut: 0n,
              maxSlippageBps: args.slippageBps,
              maxReferenceDeviationBps: 100,
              validAfter: 0n,
              expiresAt:
                args.condition === TriggerType.IMMEDIATE ? BigInt(now + 3600) : expiresAt,
              minSourceTier: SourceTier.ATTESTED_SESSION,
            },
          ],
        });
        await publicClient.waitForTransactionReceipt({hash});
        setOrderId(hash);
      }
    } catch (e) {
      setError(readableError(e));
    } finally {
      setPending(false);
    }
  }

  return {submit, isPending, error, orderId};
}

/// Wallet and RPC errors are long and mostly noise. Surface the part a user can act on.
function readableError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/User rejected|denied transaction/i.test(msg)) return "You cancelled the transaction.";
  if (/InsufficientAvailable/i.test(msg)) return "Your vault does not have enough available balance.";
  if (/UnsupportedInputToken/i.test(msg)) return "That stablecoin is not supported yet.";
  if (/insufficient funds/i.test(msg)) return "Not enough OKB to pay for gas on X Layer.";
  return msg.split("\n")[0] ?? "Something went wrong.";
}
