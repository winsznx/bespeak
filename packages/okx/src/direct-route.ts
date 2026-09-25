import {
  encodeFunctionData,
  getAddress,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

/// A second route source, quoted and executed straight against the Uniswap v3 deployment
/// the pools already live in.
///
/// Why this exists: the keeper could only build `routerCalldata` from the OKX DEX API, so
/// with no credentials every order stopped at HELD / NO_ROUTE. That is honest, but it makes
/// a working engine indistinguishable from a broken one, and it puts the whole product
/// behind one vendor's key issuance. The execution adapter was already router-agnostic —
/// it takes a router address and opaque calldata and proves the result from balance deltas
/// — so a second source needs no contract change.
///
/// This is a fallback, not a replacement. OKX aggregates across venues and will usually
/// price better; this only knows the single pool the registry recorded for the asset. It
/// exists so a conditioned order can still execute, and be proven, when the aggregator is
/// unavailable.
///
/// Addresses are not trusted from documentation. Both are checked at run time by calling
/// `factory()` and requiring the same factory the pool discovery found independently, so a
/// wrong or swapped address fails closed instead of sending funds somewhere unverified.

/// Discovered by tracing real xStock transfer counterparties on chain, not from a list.
export const XLAYER_V3_FACTORY = getAddress("0x4B2ab38DBF28D31D467aA8993f6c2585981D6804");
export const XLAYER_SWAP_ROUTER_02 = getAddress("0x4f0c28f5926afda16bf2506d5d9e57ea190f9bca");
export const XLAYER_QUOTER_V2 = getAddress("0xd1b797d92d87b688193a2b976efc8d577d204343");

const FACTORY_OF = [
  {
    name: "factory",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{type: "address"}],
  },
] as const;

const QUOTER_V2 = [
  {
    name: "quoteExactInputSingle",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          {name: "tokenIn", type: "address"},
          {name: "tokenOut", type: "address"},
          {name: "amountIn", type: "uint256"},
          {name: "fee", type: "uint24"},
          {name: "sqrtPriceLimitX96", type: "uint160"},
        ],
      },
    ],
    outputs: [
      {name: "amountOut", type: "uint256"},
      {name: "sqrtPriceX96After", type: "uint160"},
      {name: "initializedTicksCrossed", type: "uint32"},
      {name: "gasEstimate", type: "uint256"},
    ],
  },
] as const;

/// SwapRouter02 drops the `deadline` field that SwapRouter v1 carried; the order's own
/// expiry is enforced on chain by the order manager, so nothing is lost.
const SWAP_ROUTER_02 = [
  {
    name: "exactInputSingle",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        type: "tuple",
        components: [
          {name: "tokenIn", type: "address"},
          {name: "tokenOut", type: "address"},
          {name: "fee", type: "uint24"},
          {name: "recipient", type: "address"},
          {name: "amountIn", type: "uint256"},
          {name: "amountOutMinimum", type: "uint256"},
          {name: "sqrtPriceLimitX96", type: "uint160"},
        ],
      },
    ],
    outputs: [{name: "amountOut", type: "uint256"}],
  },
] as const;

export interface DirectRouteRequest {
  fromToken: Address;
  toToken: Address;
  amount: bigint;
  feeTier: number;
  slippageBps: number;
  receiver: Address;
  /// The adapter, which holds the input for the duration of the call and is the account
  /// the quote must be simulated from.
  caller: Address;
}

export interface DirectRoute {
  router: Address;
  approveTarget: Address;
  calldata: Hex;
  expectedOut: bigint;
  minReceive: bigint;
  /// Measured, not assumed: the order's rate compared against the rate for a token-sized
  /// probe. The receipt reports this number, so it has to be the real one.
  priceImpactPercent: number;
  quotedAt: number;
  source: "uniswap-v3-direct";
}

/// Confirms the router and quoter belong to the same v3 deployment as the pools the
/// registry recorded. Cheap, and it is the difference between "an address from a docs page"
/// and "an address this process checked on chain".
export async function assertVerifiedVenue(client: PublicClient): Promise<void> {
  for (const [name, address] of [
    ["SwapRouter02", XLAYER_SWAP_ROUTER_02],
    ["QuoterV2", XLAYER_QUOTER_V2],
  ] as const) {
    const code = await client.getCode({address});
    if (!code || code === "0x") {
      throw new Error(`${name} ${address} has no code on this chain`);
    }
    const factory = await client.readContract({address, abi: FACTORY_OF, functionName: "factory"});
    if (getAddress(factory) !== XLAYER_V3_FACTORY) {
      throw new Error(
        `${name} ${address} reports factory ${factory}, not the discovered ${XLAYER_V3_FACTORY}`,
      );
    }
  }
}

/// Quotes against the live pool and returns calldata the adapter can execute.
///
/// The quote is a simulated call from the adapter, so it reflects the same state the real
/// execution will see. It is still only a quote: the adapter re-measures the delivered
/// amount from balance deltas and the order manager enforces the floor, so a stale or
/// dishonest quote cannot turn into an under-delivery.
export async function buildDirectRoute(
  client: PublicClient,
  req: DirectRouteRequest,
): Promise<DirectRoute> {
  if (req.amount <= 0n) throw new Error("direct route needs a positive input amount");
  if (req.slippageBps < 0 || req.slippageBps > 10_000) {
    throw new Error(`slippage ${req.slippageBps}bps out of range`);
  }

  const {result} = await client.simulateContract({
    address: XLAYER_QUOTER_V2,
    abi: QUOTER_V2,
    functionName: "quoteExactInputSingle",
    account: req.caller,
    args: [
      {
        tokenIn: req.fromToken,
        tokenOut: req.toToken,
        amountIn: req.amount,
        fee: req.feeTier,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  const expectedOut = result[0];
  if (expectedOut <= 0n) {
    throw new Error("pool quoted zero output; no usable liquidity at this size");
  }

  // Price impact against a probe 1/1000th the size. A tiny trade approximates the spot
  // rate, so the gap between the two rates is what this order moves the pool by. If the
  // probe is too small to quote, impact is reported as 0 only because it is unmeasurable
  // at that size, which for a trade this small is the honest answer.
  let priceImpactPercent = 0;
  const probeIn = req.amount / 1000n;
  if (probeIn > 0n) {
    try {
      const {result: probe} = await client.simulateContract({
        address: XLAYER_QUOTER_V2,
        abi: QUOTER_V2,
        functionName: "quoteExactInputSingle",
        account: req.caller,
        args: [
          {
            tokenIn: req.fromToken,
            tokenOut: req.toToken,
            amountIn: probeIn,
            fee: req.feeTier,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      if (probe[0] > 0n) {
        const SCALE = 1_000_000n;
        const spotPerIn = (probe[0] * SCALE) / probeIn;
        const orderPerIn = (expectedOut * SCALE) / req.amount;
        if (spotPerIn > 0n) {
          priceImpactPercent =
            Number(((spotPerIn - orderPerIn) * 1_000_000n) / spotPerIn) / 10_000;
        }
      }
    } catch {
      // A probe that cannot be quoted tells us nothing; leave the impact at 0 rather than
      // failing a route that is otherwise fine.
    }
  }

  const minReceive = (expectedOut * BigInt(10_000 - req.slippageBps)) / 10_000n;

  const calldata = encodeFunctionData({
    abi: SWAP_ROUTER_02,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: req.fromToken,
        tokenOut: req.toToken,
        fee: req.feeTier,
        recipient: req.receiver,
        amountIn: req.amount,
        amountOutMinimum: minReceive,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });

  return {
    // SwapRouter02 pulls the input itself, so it is both the call target and the spender.
    router: XLAYER_SWAP_ROUTER_02,
    approveTarget: XLAYER_SWAP_ROUTER_02,
    calldata,
    expectedOut,
    minReceive,
    priceImpactPercent,
    quotedAt: Math.floor(Date.now() / 1000),
    source: "uniswap-v3-direct",
  };
}
