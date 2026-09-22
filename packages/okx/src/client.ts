import {createHmac} from "node:crypto";
import {getAddress, type Address, type Hex} from "viem";

/// Client for the OKX DEX aggregator (Onchain OS), API v6.
///
/// Verified live on 2026-09-22: every path below resolves and returns
///   {"msg":"Request header OK-ACCESS-KEY can not be empty.","code":"50103"}
/// when unauthenticated. There is no public tier.
///
/// The header set here is five, not the four the public docs page lists: OK-ACCESS-PROJECT
/// is required in practice, as the official okx/okx-dex-sdk sends it. Requests built from
/// the docs page alone fail.

export const OKX_BASE_URL = "https://web3.okx.com";
/// X Layer. The v6 aggregator calls this `chainIndex`, never `chainId`.
export const X_LAYER_CHAIN_INDEX = "196";

export interface OkxCredentials {
  apiKey: string;
  apiSecret: string;
  passphrase: string;
  projectId: string;
}

export class OkxApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path: string,
  ) {
    super(`OKX DEX ${code}: ${message} (${path})`);
    this.name = "OkxApiError";
  }
}

interface OkxEnvelope<T> {
  code: string;
  msg: string;
  data: T;
}

export interface QuoteResult {
  chainIndex: string;
  fromTokenAmount: string;
  toTokenAmount: string;
  tradeFee?: string;
  estimateGasFee?: string;
  priceImpactPercentage?: string;
  fromToken?: {tokenContractAddress: string; tokenSymbol: string; decimal: string};
  toToken?: {tokenContractAddress: string; tokenSymbol: string; decimal: string};
  dexRouterList?: Array<{router: string; routerPercent: string; subRouterList?: unknown[]}>;
}

export interface SwapTx {
  to: string;
  data: string;
  value: string;
  gas?: string;
  gasPrice?: string;
  maxPriorityFeePerGas?: string;
  minReceiveAmount?: string;
  from?: string;
}

export interface SwapResult {
  routerResult: QuoteResult;
  tx: SwapTx;
}

export interface ApproveResult {
  data: string;
  /// The spender to approve. This is the address the adapter's allowlist must contain.
  dexContractAddress: string;
  gasLimit?: string;
  gasPrice?: string;
}

export interface ChainData {
  chainIndex: string;
  chainName?: string;
  /// Per-chain approval target, usable without a per-token call.
  dexTokenApproveAddress: string;
}

export class OkxDexClient {
  constructor(
    private readonly creds: OkxCredentials,
    private readonly baseUrl = OKX_BASE_URL,
  ) {}

  /// Sign = Base64(HMAC_SHA256(secret, timestamp + METHOD + requestPath + queryString)).
  /// The query string is part of the prehash for GET requests; there is no body.
  private headers(method: string, pathWithQuery: string): Record<string, string> {
    const timestamp = new Date().toISOString();
    const prehash = timestamp + method.toUpperCase() + pathWithQuery;
    const sign = createHmac("sha256", this.creds.apiSecret).update(prehash).digest("base64");

    return {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": this.creds.apiKey,
      "OK-ACCESS-SIGN": sign,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": this.creds.passphrase,
      "OK-ACCESS-PROJECT": this.creds.projectId,
    };
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const pathWithQuery = qs ? `${path}?${qs}` : path;
    const res = await fetch(this.baseUrl + pathWithQuery, {
      method: "GET",
      headers: this.headers("GET", pathWithQuery),
    });

    const body = (await res.json()) as OkxEnvelope<T[]>;
    // OKX signals failure in the envelope with HTTP 200, so the status code alone is not a
    // success test.
    if (body.code !== "0") {
      throw new OkxApiError(body.code, body.msg, pathWithQuery);
    }
    const first = Array.isArray(body.data) ? body.data[0] : (body.data as unknown as T);
    if (first === undefined) {
      throw new OkxApiError("EMPTY", "API returned no data element", pathWithQuery);
    }
    return first;
  }

  async supportedChain(chainIndex = X_LAYER_CHAIN_INDEX): Promise<ChainData> {
    return this.get<ChainData>("/api/v6/dex/aggregator/supported/chain", {chainIndex});
  }

  async quote(args: {
    fromToken: Address;
    toToken: Address;
    amount: bigint;
    chainIndex?: string;
  }): Promise<QuoteResult> {
    return this.get<QuoteResult>("/api/v6/dex/aggregator/quote", {
      chainIndex: args.chainIndex ?? X_LAYER_CHAIN_INDEX,
      amount: args.amount.toString(),
      fromTokenAddress: args.fromToken,
      toTokenAddress: args.toToken,
    });
  }

  async approveTransaction(args: {token: Address; amount: bigint}): Promise<ApproveResult> {
    return this.get<ApproveResult>("/api/v6/dex/aggregator/approve-transaction", {
      chainIndex: X_LAYER_CHAIN_INDEX,
      tokenContractAddress: args.token,
      approveAmount: args.amount.toString(),
    });
  }

  /// Build an executable route.
  ///
  /// `userWalletAddress` is the CALLER, which for Bespeak is the execution adapter, and
  /// `swapReceiverAddress` is the user's own wallet. Splitting them is what lets the
  /// purchased asset land directly with the user instead of being warehoused and forwarded.
  async swap(args: {
    fromToken: Address;
    toToken: Address;
    amount: bigint;
    slippageBps: number;
    caller: Address;
    receiver: Address;
  }): Promise<SwapResult> {
    return this.get<SwapResult>("/api/v6/dex/aggregator/swap", {
      chainIndex: X_LAYER_CHAIN_INDEX,
      amount: args.amount.toString(),
      fromTokenAddress: args.fromToken,
      toTokenAddress: args.toToken,
      slippagePercent: (args.slippageBps / 10_000).toString(),
      userWalletAddress: args.caller,
      swapReceiverAddress: args.receiver,
    });
  }
}

/// Validated, normalized view of a route, ready to hand to the contract.
export interface ValidatedRoute {
  router: Address;
  approveTarget: Address;
  calldata: Hex;
  expectedOut: bigint;
  minReceive: bigint;
  priceImpactPercent: number;
  quotedAt: number;
}

/// Convert an API response into something the adapter may be asked to execute.
///
/// This is the first trust boundary: the API's own claims are turned into typed values and
/// checked for internal consistency, but nothing here decides that a route is SAFE. The
/// on-chain router allowlist and the balance-delta postconditions do that, and they run
/// regardless of what this function concluded.
///
/// The approve target is a SEPARATE address from the router and must be supplied by the
/// caller from `approveTransaction().dexContractAddress` or
/// `supportedChain().dexTokenApproveAddress`. Deriving it from `tx.to` would approve the
/// wrong contract and is exactly the conflation the two independent allowlists exist to
/// catch.
export function validateRoute(
  res: SwapResult,
  approveTarget: Address,
  expected: {receiver: Address; maxAmountIn: bigint; minAmountOut: bigint},
): ValidatedRoute {
  const tx = res.tx;
  if (!tx?.to || !tx?.data) {
    throw new Error("OKX swap response carried no executable transaction");
  }
  // A route that moves native value is not an ERC20 stablecoin swap, and executing it would
  // mean the adapter spends OKB it was never given.
  if (tx.value && tx.value !== "0") {
    throw new Error(`OKX route requires native value ${tx.value}; Bespeak only routes ERC20 input`);
  }

  const quotedIn = BigInt(res.routerResult?.fromTokenAmount ?? "0");
  if (quotedIn > expected.maxAmountIn) {
    throw new Error(`OKX route quotes input ${quotedIn} above the order's ${expected.maxAmountIn}`);
  }

  const minReceive = BigInt(tx.minReceiveAmount ?? "0");
  // If the route's own floor is below the user's, the user's floor governs; the contract
  // enforces it again, so this only avoids submitting an attempt that would certainly revert.
  const effectiveMin = minReceive > expected.minAmountOut ? minReceive : expected.minAmountOut;

  return {
    router: getAddress(tx.to),
    approveTarget: getAddress(approveTarget),
    calldata: tx.data as Hex,
    expectedOut: BigInt(res.routerResult?.toTokenAmount ?? "0"),
    minReceive: effectiveMin,
    priceImpactPercent: Number(res.routerResult?.priceImpactPercentage ?? "0"),
    quotedAt: Math.floor(Date.now() / 1000),
  };
}
