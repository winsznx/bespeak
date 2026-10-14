import {encodeFunctionData, erc20Abi, getAddress, type Address, type Hex} from "viem";
import {BespeakOrderManagerAbi, BespeakVaultAbi, BespeakVaultFactoryAbi} from "@bespeak/sdk";
import manifest from "@bespeak/assets/manifest" with {type: "json"};
import {TOOLS, type ToolName} from "./tools.js";

/// Bespeak as a tool an agent can call.
///
/// The product already does something an autonomous agent cannot do for itself: hold an
/// instruction until a condition about the off-chain world is true, execute it on X Layer,
/// and then refuse to call it a success until a second, independent read agrees. An agent
/// with a wallet can poll a price; it cannot easily leave a funded, bounded instruction
/// somewhere that will act without it.
///
/// Signing never happens here, and that is the whole design. Every state-changing tool
/// returns unsigned calldata for the caller's own signer. This server holds no key, takes
/// no custody and cannot move anyone's funds, which is what makes it safe to expose
/// publicly and without authentication. The read tools are open for the same reason the
/// dataset is: they describe a public chain.

const PROTOCOL_VERSION = "2025-06-18";

export interface Env {
  /// Where the public read APIs live. The MCP server deliberately consumes Bespeak's own
  /// public HTTP surface rather than reaching past it, so anything an agent can see here is
  /// something a human can see too, at a URL they can check.
  BESPEAK_APP_URL: string;
  BESPEAK_ORDER_MANAGER: string;
  BESPEAK_VAULT_FACTORY: string;
  XLAYER_RPC_URL: string;
}

interface RegistryAsset {
  assetId: string;
  symbol: string;
  underlyingSymbol: string;
  name: string;
  underlying: string;
  wrapper: string | null;
  wrapperDecimals: number | null;
  route: {
    quoteSymbol: string;
    quoteToken: string;
    quoteDecimals: number;
    targetToken: string;
    pool: string;
    feeTier: number;
    quoteDepth: number;
  } | null;
}

const REGISTRY = manifest as unknown as {assets: RegistryAsset[]; sourceRevision: string};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

const TRIGGERS = {immediate: 0, next_regular_session: 1, when_available: 2} as const;
const SIDES = {buy: 0, sell: 1} as const;

function assetBySymbol(symbol: string): RegistryAsset | undefined {
  const s = symbol.toLowerCase();
  return REGISTRY.assets.find(
    (a) => a.symbol.toLowerCase() === s || a.underlyingSymbol.toLowerCase() === s,
  );
}

async function rpc<T>(env: Env, method: string, params: unknown[]): Promise<T> {
  const res = await fetch(env.XLAYER_RPC_URL, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  });
  const body = (await res.json()) as {result?: T; error?: {message: string}};
  if (body.error) throw new Error(body.error.message);
  return body.result as T;
}

async function appJson<T>(env: Env, path: string): Promise<T> {
  const res = await fetch(`${env.BESPEAK_APP_URL}${path}`, {
    headers: {accept: "application/json"},
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

// ---------------------------------------------------------------- the tools

async function runTool(name: ToolName, args: Record<string, unknown>, env: Env): Promise<unknown> {
  switch (name) {
    case "list_assets":
      return {
        registryRevision: REGISTRY.sourceRevision,
        chainId: 196,
        count: REGISTRY.assets.length,
        assets: REGISTRY.assets.map((a) => ({
          symbol: a.symbol,
          underlying: a.underlyingSymbol,
          name: a.name,
          assetId: a.assetId,
          token: a.route?.targetToken ?? a.wrapper ?? a.underlying,
          decimals: a.wrapperDecimals,
          payWith: a.route?.quoteSymbol ?? null,
          payToken: a.route?.quoteToken ?? null,
          poolDepthUsd: a.route?.quoteDepth ?? null,
        })),
        note:
          "These twelve are the official xStocks whose X Layer deployment Bespeak verified " +
          "on chain. An asset absent from this list cannot be ordered.",
      };

    case "market_state": {
      const markets = await appJson<{rows?: unknown[]} | unknown[]>(env, "/api/markets");
      const symbol = args.symbol as string | undefined;
      const rows = (Array.isArray(markets) ? markets : (markets.rows ?? [])) as Array<
        Record<string, unknown>
      >;
      const filtered = symbol
        ? rows.filter(
            (r) =>
              String(r.symbol ?? "").toLowerCase() === symbol.toLowerCase() ||
              String(r.underlyingSymbol ?? "").toLowerCase() === symbol.toLowerCase(),
          )
        : rows;
      return {
        markets: filtered,
        source: "xstocks.fi issuer trading state, operator attested",
        caution:
          "Session state is operator-attested (Tier 3), not oracle-verified. It proves which " +
          "key asserted this state and when, not that the state was correct.",
      };
    }

    case "spread": {
      const symbol = args.symbol as string | undefined;
      if (symbol) {
        const a = assetBySymbol(symbol);
        if (!a) throw new Error(`unknown asset ${symbol}`);
        return appJson(env, `/api/basis/${a.symbol}?limit=${Number(args.limit ?? 50)}`);
      }
      return appJson(env, "/api/basis");
    }

    case "order_status": {
      const orderId = String(args.order_id ?? "");
      if (!/^0x[0-9a-fA-F]{64}$/.test(orderId)) throw new Error("order_id must be a 32 byte hex id");
      const data = encodeFunctionData({
        abi: BespeakOrderManagerAbi,
        functionName: "getOrder",
        args: [orderId as Hex],
      });
      const raw = await rpc<Hex>(env, "eth_call", [
        {to: env.BESPEAK_ORDER_MANAGER, data},
        "latest",
      ]);
      return {
        orderId,
        raw,
        manager: env.BESPEAK_ORDER_MANAGER,
        note:
          "Returned as raw ABI-encoded output so the caller decodes it against the same ABI " +
          "the contract was compiled from rather than trusting this server's decoding.",
      };
    }

    case "receipt": {
      const q = args.order_id
        ? `order=${encodeURIComponent(String(args.order_id))}`
        : `receipt=${encodeURIComponent(String(args.receipt_id ?? ""))}`;
      const res = await fetch(`${env.BESPEAK_APP_URL}/api/receipts?${q}`);
      if (res.status === 404) {
        return {
          found: false,
          note:
            "No receipt. That means this order has not executed, not that it failed. An " +
            "order with no receipt has moved no capital.",
        };
      }
      if (!res.ok) throw new Error(`receipt lookup returned ${res.status}`);
      return await res.json();
    }

    case "build_order": {
      const symbol = String(args.symbol ?? "");
      const asset = assetBySymbol(symbol);
      if (!asset) throw new Error(`unknown asset ${symbol}`);
      if (!asset.route) throw new Error(`${symbol} has no executable route`);

      const sideKey = String(args.side ?? "buy").toLowerCase() as keyof typeof SIDES;
      if (!(sideKey in SIDES)) throw new Error(`side must be one of ${Object.keys(SIDES).join(", ")}`);
      const side = SIDES[sideKey];

      const triggerKey = String(args.condition ?? "next_regular_session")
        .toLowerCase()
        .replace(/-/g, "_") as keyof typeof TRIGGERS;
      if (!(triggerKey in TRIGGERS)) {
        throw new Error(`condition must be one of ${Object.keys(TRIGGERS).join(", ")}`);
      }
      const trigger = TRIGGERS[triggerKey];

      const owner = getAddress(String(args.owner ?? "")) as Address;
      const receiver = args.receiver ? (getAddress(String(args.receiver)) as Address) : owner;

      const sell = side === SIDES.sell;
      const assetToken = getAddress(asset.route.targetToken) as Address;
      const stable = getAddress(asset.route.quoteToken) as Address;
      const inputToken = sell ? assetToken : stable;
      const inputDecimals = sell ? (asset.wrapperDecimals ?? 18) : asset.route.quoteDecimals;

      const amountRaw = BigInt(String(args.amount_raw ?? "0"));
      if (amountRaw <= 0n) {
        throw new Error("amount_raw must be a positive integer in the input token's base units");
      }

      const vault = await rpc<Hex>(env, "eth_call", [
        {
          to: env.BESPEAK_VAULT_FACTORY,
          data: encodeFunctionData({
            abi: BespeakVaultFactoryAbi,
            functionName: "vaultOf",
            args: [owner],
          }),
        },
        "latest",
      ]);
      const vaultAddress = getAddress(`0x${vault.slice(-40)}`) as Address;
      const hasVault = vaultAddress !== ZERO;

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = BigInt(
        Number(args.expires_in_seconds ?? (trigger === 0 ? 3600 : 7 * 86_400)) + now,
      );

      const createOrder = encodeFunctionData({
        abi: BespeakOrderManagerAbi,
        functionName: "createOrder",
        args: [
          {
            inputToken,
            outputToken: sell ? stable : ZERO,
            side,
            assetId: asset.assetId as Hex,
            receiver,
            triggerType: trigger,
            amountIn: amountRaw,
            minAmountOut: BigInt(String(args.min_amount_out_raw ?? "0")),
            maxSlippageBps: Number(args.max_slippage_bps ?? 75),
            maxReferenceDeviationBps: 100,
            validAfter: 0n,
            expiresAt,
            minSourceTier: 3,
          },
        ],
      });

      const steps = [
        ...(hasVault
          ? []
          : [
              {
                step: 1,
                what: "Create your vault. One per owner, and the owner is the only address that can withdraw from it.",
                to: getAddress(env.BESPEAK_VAULT_FACTORY),
                data: encodeFunctionData({
                  abi: BespeakVaultFactoryAbi,
                  functionName: "ensureVault",
                  args: [owner],
                }),
              },
            ]),
        {
          step: hasVault ? 1 : 2,
          what: `Approve the vault to pull ${amountRaw} of ${inputToken}.`,
          to: inputToken,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [hasVault ? vaultAddress : ZERO, amountRaw],
          }),
          caution: hasVault
            ? undefined
            : "The spender here is a placeholder. Run step 1 first, read your vault address back, then rebuild this call.",
        },
        {
          step: hasVault ? 2 : 3,
          what: "Deposit into your vault.",
          to: hasVault ? vaultAddress : ZERO,
          data: encodeFunctionData({
            abi: BespeakVaultAbi,
            functionName: "deposit",
            args: [inputToken, amountRaw],
          }),
        },
        {
          step: hasVault ? 3 : 4,
          what: "Create the order. This reserves the capital and nothing else happens until the condition holds.",
          to: getAddress(env.BESPEAK_ORDER_MANAGER),
          data: createOrder,
        },
      ];

      return {
        chainId: 196,
        side: sideKey,
        condition: triggerKey,
        asset: {symbol: asset.symbol, underlying: asset.underlyingSymbol, assetId: asset.assetId},
        inputToken,
        inputDecimals,
        outputToken: sell ? stable : assetToken,
        vault: hasVault ? vaultAddress : null,
        transactions: steps,
        signing:
          "Bespeak holds no key and cannot sign for you. Send these from your own signer, " +
          "in order, waiting for each to confirm.",
        afterwards:
          "The keeper assesses the order every minute. It executes only when the contract " +
          "itself agrees the condition holds, then verifies the result through a different " +
          "RPC than it broadcast on. Poll `receipt` with this order id.",
        limits:
          "minSourceTier is ATTESTED_SESSION, the weakest tier this system accepts. A " +
          "conditioned order will refuse rather than execute on an unknown market state.",
      };
    }
  }
}

// ---------------------------------------------------------------- JSON-RPC / MCP

interface RpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

function result(id: RpcRequest["id"], value: unknown) {
  return {jsonrpc: "2.0" as const, id, result: value};
}

function failure(id: RpcRequest["id"], code: number, message: string) {
  return {jsonrpc: "2.0" as const, id, error: {code, message}};
}

async function handleRpc(req: RpcRequest, env: Env): Promise<object | null> {
  switch (req.method) {
    case "initialize":
      return result(req.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {tools: {}},
        serverInfo: {name: "bespeak", version: "1.1.0"},
        instructions:
          "Bespeak places condition-aware standing orders for official xStocks on X Layer " +
          "(chain 196). Read tools are free and public. `build_order` returns unsigned " +
          "calldata for your own signer; this server never holds a key and cannot move funds.",
      });

    // Notifications carry no id and must not be answered.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return result(req.id, {});

    case "tools/list":
      return result(req.id, {tools: TOOLS});

    case "tools/call": {
      const name = String(req.params?.name ?? "") as ToolName;
      if (!TOOLS.some((t) => t.name === name)) {
        return failure(req.id, -32602, `unknown tool ${name}`);
      }
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      try {
        const value = await runTool(name, args, env);
        return result(req.id, {
          content: [{type: "text", text: JSON.stringify(value, null, 2)}],
        });
      } catch (e) {
        // Reported as a tool error rather than a protocol error, so the calling model sees
        // the reason and can correct its arguments instead of treating it as a dead server.
        return result(req.id, {
          isError: true,
          content: [{type: "text", text: e instanceof Error ? e.message : String(e)}],
        });
      }
    }

    default:
      return failure(req.id, -32601, `method not found: ${req.method}`);
  }
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type, mcp-protocol-version, mcp-session-id",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, {headers: CORS});

    // A human landing on the URL should learn what it is, not get a protocol error.
    if (request.method === "GET" && url.pathname !== "/mcp") {
      return Response.json(
        {
          name: "Bespeak MCP",
          description:
            "Condition-aware standing orders for official xStocks on X Layer, as tools.",
          endpoint: new URL("/mcp", url.origin).toString(),
          transport: "streamable HTTP, JSON-RPC 2.0 over POST",
          protocolVersion: PROTOCOL_VERSION,
          tools: TOOLS.map((t) => ({name: t.name, description: t.description})),
          signing: "This server holds no key. State-changing tools return unsigned calldata.",
          app: env.BESPEAK_APP_URL,
        },
        {headers: CORS},
      );
    }

    if (request.method !== "POST") {
      return Response.json({error: "POST JSON-RPC to /mcp"}, {status: 405, headers: CORS});
    }

    let body: RpcRequest | RpcRequest[];
    try {
      body = (await request.json()) as RpcRequest | RpcRequest[];
    } catch {
      return Response.json(failure(null, -32700, "parse error"), {status: 400, headers: CORS});
    }

    const batch = Array.isArray(body) ? body : [body];
    const responses = (await Promise.all(batch.map((m) => handleRpc(m, env)))).filter(
      (r): r is object => r !== null,
    );

    // A batch of pure notifications has nothing to answer with, and 202 is the correct
    // way to say so.
    if (responses.length === 0) return new Response(null, {status: 202, headers: CORS});

    return Response.json(Array.isArray(body) ? responses : responses[0], {
      headers: {...CORS, "content-type": "application/json"},
    });
  },
};
