/// The tool surface, as MCP describes it.
///
/// Descriptions are written for a model deciding whether to call something, so each one
/// says what the tool is for and, where it matters, what it will not do. The limits are in
/// the description rather than only in the response because a model that learns a limit
/// after acting has already acted.

export const TOOLS = [
  {
    name: "list_assets",
    description:
      "List the official xStocks Bespeak can trade on X Layer, with their token addresses, " +
      "the stablecoin each one is executable against, and pool depth. Start here: an asset " +
      "absent from this list cannot be ordered.",
    inputSchema: {type: "object", properties: {}, additionalProperties: false},
  },
  {
    name: "market_state",
    description:
      "Current trading-session state for the underlying US equities, as published by the " +
      "xStocks issuer. Tells you whether a next_regular_session order would execute now or " +
      "wait. The state is operator-attested, not oracle-verified.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {
          type: "string",
          description: "Optional. NVDA or NVDAx. Omit for every asset.",
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: "spread",
    description:
      "Measured cost of trading an xStock on X Layer: the round-trip cost in basis points " +
      "at a fixed size, sampled continuously and tagged with the underlying's session " +
      "state. Use it to decide whether to trade now or wait for the regular session. These " +
      "are executable quotes, not fills, and not basis against the listed equity.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: {type: "string", description: "Optional. Omit for the cross-asset summary."},
        limit: {type: "number", description: "Max samples when a symbol is given. Default 50."},
      },
      additionalProperties: false,
    },
  },
  {
    name: "build_order",
    description:
      "Build the unsigned transactions that place a condition-aware standing order. Returns " +
      "an ordered list of calls for YOUR signer: Bespeak holds no key and cannot sign or " +
      "move funds. Once created, the order waits until its condition holds, then executes " +
      "on X Layer and delivers straight to the receiver's wallet. Use for both buying an " +
      "xStock with a stablecoin and selling one back to a stablecoin.",
    inputSchema: {
      type: "object",
      properties: {
        owner: {type: "string", description: "The address that will sign and own the order."},
        symbol: {type: "string", description: "NVDA or NVDAx."},
        side: {
          type: "string",
          enum: ["buy", "sell"],
          description: "buy spends a stablecoin, sell spends the xStock. Default buy.",
        },
        amount_raw: {
          type: "string",
          description:
            "Amount of the INPUT token in base units, as a decimal string. For a buy that " +
            "is the stablecoin (6 decimals); for a sell it is the xStock (18 decimals).",
        },
        condition: {
          type: "string",
          enum: ["immediate", "next_regular_session", "when_available"],
          description:
            "next_regular_session waits for the underlying US equity's regular session. " +
            "Default next_regular_session.",
        },
        receiver: {type: "string", description: "Optional. Defaults to owner."},
        min_amount_out_raw: {
          type: "string",
          description: "Optional floor in the output token's base units. Enforced on chain.",
        },
        max_slippage_bps: {type: "number", description: "Optional. Default 75."},
        expires_in_seconds: {type: "number", description: "Optional."},
      },
      required: ["owner", "symbol", "amount_raw"],
      additionalProperties: false,
    },
  },
  {
    name: "order_status",
    description:
      "Read an order's authoritative state from the contract. Returns raw ABI-encoded " +
      "output so you decode it yourself rather than trusting this server's reading of it.",
    inputSchema: {
      type: "object",
      properties: {order_id: {type: "string", description: "32 byte order id."}},
      required: ["order_id"],
      additionalProperties: false,
    },
  },
  {
    name: "receipt",
    description:
      "Fetch the execution receipt for an order. The receipt records what the chain says " +
      "moved, read back through a different RPC than the one the transaction was broadcast " +
      "on, plus every check that was run and every limitation of the claim. No receipt " +
      "means the order has not executed, which is not the same as having failed.",
    inputSchema: {
      type: "object",
      properties: {
        order_id: {type: "string"},
        receipt_id: {type: "string"},
      },
      additionalProperties: false,
    },
  },
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];
