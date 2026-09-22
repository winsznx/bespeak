import {createPublicClient, http, getAddress, type Address} from "viem";
import {xLayer, DEFAULT_VERIFY_RPC} from "@bespeak/shared";
import {XLAYER_STABLES, type StableSymbol} from "./registry.js";

/// Discovering which pair is actually executable, rather than assuming one stablecoin.
///
/// Found by tracing real xStock transfer counterparties on X Layer: a Uniswap-V3-compatible
/// factory whose pools carry the liquidity these assets actually trade against. Two things
/// that scan established, which no documentation stated:
///
///   1. Every liquid pool is quoted against the WRAPPER, never the underlying. All
///      underlying pools hold zero.
///   2. The quote stablecoin differs per asset. NVDAx and SPYx trade against USDG; TSLAx
///      and QQQx against USDC. Assuming either one universally would mean offering users an
///      unexecutable pair.
///
/// This is route DISCOVERY only. A pool found here is never executed against directly —
/// execution still goes through the OKX adapter, the RouterRegistry allowlist and the
/// on-chain balance-delta postconditions. It exists so Bespeak can tell a user which
/// stablecoin will actually work, and so the sponsor ablation has a real baseline.
export const XLAYER_V3_FACTORY = getAddress("0x4B2ab38DBF28D31D467aA8993f6c2585981D6804");

/// All observed liquidity sits at the 0.05% tier; the others are empty shells.
export const FEE_TIERS = [100, 500, 3000, 10000] as const;

const FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [{type: "address"}, {type: "address"}, {type: "uint24"}],
    outputs: [{type: "address"}],
  },
] as const;

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{type: "address"}],
    outputs: [{type: "uint256"}],
  },
] as const;

const ZERO = "0x0000000000000000000000000000000000000000";

export interface DiscoveredRoute {
  quoteSymbol: StableSymbol;
  quoteToken: Address;
  quoteDecimals: number;
  /// The token the pool actually trades — in practice always the wrapper.
  targetToken: Address;
  pool: Address;
  feeTier: number;
  /// Quote-side reserves, in whole units. A proxy for depth, not a precise TVL.
  quoteDepth: number;
}

/// Find the deepest executable pair for a target token.
/// Returns null when nothing with liquidity exists, which is a legitimate answer: that
/// asset simply is not executable here yet, and a WHEN_AVAILABLE order is the honest
/// product response.
export async function discoverRoute(
  targetToken: Address,
  rpcUrl = DEFAULT_VERIFY_RPC,
): Promise<DiscoveredRoute | null> {
  const client = createPublicClient({chain: xLayer, transport: http(rpcUrl)});

  const candidates: DiscoveredRoute[] = [];

  for (const [symbol, stable] of Object.entries(XLAYER_STABLES)) {
    for (const fee of FEE_TIERS) {
      let pool: Address;
      try {
        pool = (await client.readContract({
          address: XLAYER_V3_FACTORY,
          abi: FACTORY_ABI,
          functionName: "getPool",
          args: [stable.address, targetToken, fee],
        })) as Address;
      } catch {
        continue;
      }
      if (!pool || pool === ZERO) continue;

      let depth = 0n;
      try {
        depth = (await client.readContract({
          address: stable.address,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [pool],
        })) as bigint;
      } catch {
        continue;
      }
      if (depth === 0n) continue;

      candidates.push({
        quoteSymbol: symbol as StableSymbol,
        quoteToken: stable.address,
        quoteDecimals: stable.decimals,
        targetToken,
        pool: getAddress(pool),
        feeTier: fee,
        quoteDepth: Number(depth) / 10 ** stable.decimals,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.quoteDepth - a.quoteDepth);
  return candidates[0]!;
}
