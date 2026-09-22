"use client";

import {useReadContract, useReadContracts} from "wagmi";
import {formatUnits, type Address} from "viem";
import {BespeakVaultAbi, BespeakVaultFactoryAbi} from "@bespeak/sdk";
import {clientDeployment} from "./addresses";
import {formatAmount} from "./format";

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export interface VaultView {
  address: Address | null;
  exists: boolean;
  total: bigint | null;
  available: bigint | null;
  reserved: bigint | null;
  availableFormatted: string;
  reservedFormatted: string;
  totalFormatted: string;
  format: (v: bigint) => string;
  refetch: () => void;
}

/// Live vault state for one stablecoin. The available/reserved split is the number the user
/// actually acts on, so it is read from the contract rather than derived from order history.
export function useVault(
  owner: Address | undefined,
  stable: {address: Address; decimals: number},
): VaultView {
  const d = clientDeployment();

  const vaultQuery = useReadContract({
    address: d?.vaultFactory,
    abi: BespeakVaultFactoryAbi,
    functionName: "vaultOf",
    args: owner ? [owner] : undefined,
    query: {enabled: Boolean(d && owner)},
  });

  const vaultAddress = (vaultQuery.data as Address | undefined) ?? null;
  const exists = Boolean(vaultAddress && vaultAddress !== ZERO);

  const balances = useReadContracts({
    contracts: exists
      ? [
          {address: vaultAddress!, abi: BespeakVaultAbi, functionName: "balance", args: [stable.address]},
          {address: vaultAddress!, abi: BespeakVaultAbi, functionName: "available", args: [stable.address]},
        ]
      : [],
    query: {enabled: exists, refetchInterval: 10_000},
  });

  const total = exists ? ((balances.data?.[0]?.result as bigint | undefined) ?? null) : exists ? null : 0n;
  const available = exists ? ((balances.data?.[1]?.result as bigint | undefined) ?? null) : exists ? null : 0n;
  const reserved = total !== null && available !== null ? total - available : null;

  const fmt = (v: bigint) => formatAmount(v, stable.decimals);

  return {
    address: exists ? vaultAddress : vaultAddress,
    exists,
    total,
    available: exists ? available : 0n,
    reserved: exists ? reserved : 0n,
    availableFormatted: available === null ? "—" : fmt(available),
    reservedFormatted: reserved === null ? "—" : fmt(reserved),
    totalFormatted: total === null ? "—" : fmt(total),
    format: fmt,
    refetch: () => {
      void vaultQuery.refetch();
      void balances.refetch();
    },
  };
}

export {formatUnits};
