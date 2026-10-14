---
name: bespeak
description: Place and track condition-aware standing orders for official tokenized equities (xStocks) on X Layer mainnet. Use when an agent needs to buy or sell a tokenized stock on a condition rather than immediately, for example "buy NVDA when the US market opens", "exit TSLA to stable at the next regular session", or to read what an xStock actually costs to trade on X Layer. Bespeak never holds a key: it returns unsigned calldata for the caller's own signer.
---

# Bespeak

Bespeak holds a funded, bounded instruction and acts on it when a condition about the
off-chain world becomes true. That is the thing it does that you cannot easily do yourself:
you can poll a price, but you cannot leave an instruction somewhere that will execute while
you are not running.

It trades only the twelve official xStocks whose X Layer deployment has been verified on
chain, and it refuses rather than guesses when it cannot establish market state.

## Connect

MCP endpoint, streamable HTTP, JSON-RPC 2.0, protocol `2025-06-18`:

```
https://bespeak-mcp.timjosh507.workers.dev/mcp
```

No authentication. No key is held on the server, so there is nothing for it to leak and
nothing it can spend.

## Tools

| Tool | Use it to |
|---|---|
| `list_assets` | See what can be ordered. Start here. |
| `market_state` | Check whether the underlying US equity is in its regular session. |
| `spread` | See what a round trip actually costs right now, by session state. |
| `build_order` | Get the unsigned transactions that place an order. |
| `order_status` | Read an order's authoritative state from the contract. |
| `receipt` | Get the verified outcome after execution. |

## The normal sequence

1. `list_assets` to resolve the ticker and learn which stablecoin the asset is executable
   against, and with how many decimals.
2. `spread` to decide whether now is a sensible time. Cost outside the regular session is
   routinely several times the cost inside it.
3. `build_order` with the owner address, the symbol, the side and the amount in the input
   token's base units.
4. **Sign and send each returned transaction yourself, in order, waiting for each to
   confirm.** Bespeak cannot do this for you.
5. Poll `receipt` with the order id. No receipt means the order has not executed, which is
   not the same as having failed.

## What the conditions mean

- `next_regular_session` waits for the underlying US equity's regular cash session. Extended
  hours and overnight do not qualify. This is the one to use by default.
- `immediate` executes on the next keeper pass, with no session requirement. Useful as a
  control, and as the only sensible choice when the market is already open.
- `when_available` waits for the asset to become executable on X Layer at all.

## Things to tell your user, not hide from them

- **Market session is operator-attested, not oracle-verified.** The receipt records this as
  `ATTESTED_SESSION`. It proves which key asserted the market state and when. It does not
  prove the state was correct.
- **An order reserves capital at creation.** It does not spend it. Cancelling returns the
  full reservation.
- **Filled assets go straight to the receiver's wallet.** Bespeak takes no custody and holds
  nothing after an execution.
- **`spread` is quotes, not fills,** at one size, and it is not basis against the listed
  equity. There is no equity price oracle on X Layer.
- **The contracts are not externally audited.**

## Reading a receipt

The only status that means a completed purchase is `VERIFIED_FILLED`. Everything else is
weaker and must be reported as such:

| Status | What it means |
|---|---|
| `VERIFIED_FILLED` | Executed, and independently confirmed through a different RPC. |
| `PARTIALLY_VERIFIED` | Executed, but with fewer confirmations than policy requires. |
| `OUTCOME_UNKNOWN` | On chain, but a check could not be supported. Do not call this a success. |
| `VERIFICATION_TIMEOUT` | The independent read path never observed the transaction. |
| `CONTRADICTED` | Independently observed state disagrees with the contract's own account. |
| `ROLLED_BACK` | The block carrying the execution is no longer canonical. |

The component that broadcast the transaction is never the component that declares the
outcome. If a receipt says anything other than `VERIFIED_FILLED`, say so plainly rather than
rounding it up.

## Open data

The cost series is free to read without MCP:

```
https://bespeak.timjosh507.workers.dev/api/basis        aggregates and latest sample
https://bespeak.timjosh507.workers.dev/api/basis/NVDAx  one asset's series
https://bespeak.timjosh507.workers.dev/api/basis.csv    everything, spreadsheet ready
```

## Network

X Layer mainnet, chain id 196. Gas is OKB. Order manager
`0xF803E6CA20D878e72694f6a9b2fB6D0dDF06BC43`, vault factory
`0xf4a987531b01C88E05442fe8aa228E3E6ed1A3c8`.
