"use client";

import {useAccount, useReadContracts} from "wagmi";
import {keepPreviousData} from "@tanstack/react-query";
import {erc20Abi, type Address} from "viem";
import {AssetIdentity} from "@/components/identity";
import {OnChainRef} from "@/components/ui/OnChainRef";
import {formatAmount} from "@/lib/format";

export interface HoldingAsset {
  symbol: string;
  underlyingSymbol: string;
  name: string;
  outputToken: Address;
  outputDecimals: number;
}

/// What the user actually owns.
///
/// Bespeak delivers a filled order straight to the buyer's wallet and keeps no custody of
/// it, which is the right design and left a hole in the product: you could buy an xStock,
/// see it in your order history, and never see that you held it. The assets were real and
/// in the wallet the whole time; the application simply never looked.
///
/// Balances are read from the tokens themselves rather than accumulated from fill history,
/// so this stays correct if the holder sends the asset somewhere else. Bespeak has no say
/// in that, and a position it inferred from its own receipts would quietly disagree with
/// the chain the moment anyone moved anything.
export function Holdings({assets}: {assets: HoldingAsset[]}) {
  const {address, isConnected} = useAccount();

  const balances = useReadContracts({
    contracts: assets.map((a) => ({
      address: a.outputToken,
      abi: erc20Abi,
      functionName: "balanceOf" as const,
      args: [address ?? "0x0000000000000000000000000000000000000000"] as const,
    })),
    query: {
      enabled: Boolean(address),
      refetchInterval: 30_000,
      placeholderData: keepPreviousData,
      refetchOnWindowFocus: false,
    },
  });

  const held = assets
    .map((a, i) => ({asset: a, amount: (balances.data?.[i]?.result as bigint | undefined) ?? 0n}))
    .filter((h) => h.amount > 0n)
    .sort((a, b) => (b.amount > a.amount ? 1 : -1));

  return (
    <section className="module module-pad">
      <h2 className="t-h4" style={{marginBottom: 4}}>
        Your holdings
      </h2>
      <p className="t-sm muted prose" style={{margin: "0 0 18px"}}>
        {isConnected
          ? "Delivered to your wallet, not held by Bespeak. Read from the tokens themselves."
          : "Filled orders are delivered straight to your wallet."}
      </p>

      {!isConnected ? (
        <p className="t-sm faint" style={{margin: 0}}>
          Connect a wallet to see what you hold.
        </p>
      ) : held.length === 0 ? (
        <p className="t-sm faint" style={{margin: 0}}>
          Nothing yet. An order that fills delivers the xStock here.
        </p>
      ) : (
        <div className="col g4">
          {held.map(({asset, amount}) => (
            <div key={asset.symbol} className="row g3 between">
              <AssetIdentity
                symbol={asset.symbol}
                underlyingSymbol={asset.underlyingSymbol}
                name={asset.name}
                variant="row"
              />
              <div style={{textAlign: "right", minWidth: 0}}>
                <div className="t-h4" style={{fontVariantNumeric: "tabular-nums"}}>
                  {formatAmount(amount, asset.outputDecimals, 6)}
                </div>
                <OnChainRef
                  value={asset.outputToken}
                  className="t-xs faint"
                  copyable={false}
                />
              </div>
            </div>
          ))}
          <p className="t-xs faint prose" style={{margin: "6px 0 0"}}>
            These are ordinary tokens in your own wallet. Bespeak buys on a condition and
            does not sell, so moving or selling them is done wherever you would trade any
            other token on X Layer.
          </p>
        </div>
      )}
    </section>
  );
}
