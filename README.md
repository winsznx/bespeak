# Bespeak

**Condition-aware standing orders for tokenized stocks on X Layer.**

Choose an official xStock, say when Bespeak may buy it, set your limits, and leave.
Bespeak reserves your stablecoins in a vault only you can withdraw from, waits for the
condition you chose, executes within your limits on X Layer, sends the asset straight to
your wallet, and then independently re-checks the chain to confirm it actually arrived
before calling the order complete.

Built for OKX Dev Day 2026, Build a Market track, Remote Build, X Layer mainnet (chain 196).

| | |
|---|---|
| **Live app** | https://bespeak.timjosh507.workers.dev |
| **Network** | X Layer mainnet, chain 196 |
| **Canonical execution** | [`0x72be50dc…c8f92e07`](https://www.oklink.com/xlayer/tx/0x72be50dc257b24c0fdc06c421f94c20f1cd0d4fa2d2da86147d8ddbdc8f92e07), routed by the live OKX DEX API, `VERIFIED_FILLED`, 11/11 checks |
| **Its receipt** | [/proof/0x78e041e7…](https://bespeak.timjosh507.workers.dev/proof/0x78e041e7c48abb86543eec793de7608a6f79303e25f1e1293f0bd8c4c7221b8d) |
| **Order manager** | [`0xE175556a…799431d4`](https://www.oklink.com/xlayer/address/0xE175556a3322A755B14C13403051899b799431d4) |
| **Vault factory** | [`0xC47315E2…41d3766B`](https://www.oklink.com/xlayer/address/0xC47315E29b4b8AA5aF26c3603f97bb8341d3766B) |
| **Asset registry** | [`0x462A8DF4…c1eA1728`](https://www.oklink.com/xlayer/address/0x462A8DF4b4e09E8A2B346E40A14c5b47c1eA1728) |

Full address list, including the router registry, execution adapter and condition verifier,
is under [Live on X Layer mainnet](#live-on-x-layer-mainnet).

### Try it in two minutes

1. Open the app and connect a wallet on X Layer (chain 196).
2. **Markets**, 12 official xStocks, each verified on chain, with the stablecoin each one
   is actually executable against.
3. **NVDA**, the xStock trades on X Layer around the clock; the underlying US session does
   not. The asset page shows both states separately.
4. Choose *next regular session*, set an amount, reserve. Capital sits in a vault only you
   can withdraw from.
5. **Orders**, a conditioned order that is waiting says why, and when it next becomes
   eligible. It does not execute early.
6. **Receipt**, a filled order records what was spent, what arrived, which venue priced
   it, the condition source and its trust tier, and every verification check with its
   expected and observed value.

### What is live, and what is not

**Live.** Contracts on mainnet, now in two generations: v1 from 25 September and v1.1 from
14 October, which adds the sell side. 12 assets in the on-chain registry. The OKX DEX
aggregator as the routing venue, authenticated against the live v6 API. Five executions on
mainnet, buys and a sell, each confirmed through an RPC that did not broadcast it. A
conditioned order that genuinely refused to fill once the session closed. A hosted keeper on
a one-minute schedule. An [open dataset](https://bespeak.timjosh507.workers.dev/data) of what
these assets actually cost to trade on X Layer, and
[an MCP server](https://bespeak-mcp.timjosh507.workers.dev) so an agent can place an order
without Bespeak ever holding its key.

**Not claimed.** Market session is a *signed market-state attestation* from the issuer's
published trading state, recorded on every receipt as `ATTESTED_SESSION`. It is not oracle
verified and the README does not call it trustless. Chainlink Data Streams is not an
integration here, see [SPONSOR_FINDINGS](docs/SPONSOR_FINDINGS.md). The contracts are not
externally audited.

---

## The problem

Tokenized equities trade around the clock. The stocks behind them do not.

That creates an execution problem that neither a DEX swap nor a DCA bot solves. A swap
executes now, whatever state the underlying market is in. A scheduled bot executes at a
fixed timestamp, even when that timestamp lands on a market holiday. Neither can express:

> Buy me $200 of NVDA, but only once the underlying is in its regular session, never worse
> than 0.75% slippage, and cancel it if that hasn't happened in a week.

Today you either sit and watch for the opening bell, or you write and maintain your own
bot. Bespeak is that instruction as a product.

## The four paths, one engine

| What the user picks | Internally | What it waits for |
|---|---|---|
| Buy now | `IMMEDIATE` | nothing, executes on the next pass |
| Next regular session | `NEXT_REGULAR_SESSION` | the underlying US equity's regular cash session |
| When available on X Layer | `WHEN_AVAILABLE` | the asset becoming executable on X Layer |
| Repeat | recurring occurrences | the chosen condition, once per occurrence |

These are four surfaces over one primitive. They share the vault, the order record, the
asset registry, the eligibility check, the quote engine, the execution adapter, the
postconditions and the receipt. Only the trigger differs, which is exactly why **Buy now**
is a genuine control for the conditioned path rather than a separate code path that happens
to look similar.

---

## Live on X Layer mainnet

Deployed 25 September 2026 to chain 196, and read back through two RPCs that did not
broadcast the transactions. Broadcast is not deployment, so the addresses below were
confirmed by `eth_getCode` on `xlayerrpc.okx.com` and `xlayer.drpc.org`; the bytecode
hashes agree between them.

| Contract | Address |
|---|---|
| AssetRegistry | [`0x462A8DF4b4e09E8A2B346E40A14c5b47c1eA1728`](https://www.oklink.com/xlayer/address/0x462A8DF4b4e09E8A2B346E40A14c5b47c1eA1728) |
| RouterRegistry | [`0xe8909CE9f80264F253aBE8eA50606a04C4a696c0`](https://www.oklink.com/xlayer/address/0xe8909CE9f80264F253aBE8eA50606a04C4a696c0) |
| BespeakOrderManager | [`0xE175556a3322A755B14C13403051899b799431d4`](https://www.oklink.com/xlayer/address/0xE175556a3322A755B14C13403051899b799431d4) |
| BespeakVaultFactory | [`0xC47315E29b4b8AA5aF26c3603f97bb8341d3766B`](https://www.oklink.com/xlayer/address/0xC47315E29b4b8AA5aF26c3603f97bb8341d3766B) |
| OkxExecutionAdapter | [`0x8fe9dB236df3E7F810D2C2eDE908B3B01C166Ca8`](https://www.oklink.com/xlayer/address/0x8fe9dB236df3E7F810D2C2eDE908B3B01C166Ca8) |
| AttestedSessionVerifier | [`0x0A558281bC3d40f59E31aD18EE0f01A5289dB7b6`](https://www.oklink.com/xlayer/address/0x0A558281bC3d40f59E31aD18EE0f01A5289dB7b6) |

The asset registry is populated on mainnet: 12 of 12 xStocks pushed, each one's
`symbol()`, `decimals()` and wrapper `asset()` verified on chain before promotion.
Manifest revision `0xb24cd5d6…2c61368`, on-chain revision `0x5ed61a08…e5fe05dd`.

The router registry carries both venues, each allowlisted only after being checked rather
than copied from a page. The OKX router and approve-target are read from the live API,
because OKX documents that those addresses change. The Uniswap `SwapRouter02` is accepted
only if `factory()` returns the same v3 factory the pool discovery found by tracing real
xStock transfer counterparties on chain.

| Venue | Router | Approve target |
|---|---|---|
| OKX DEX aggregator | [`0x7c5bEE2a…3060AEaF`](https://www.oklink.com/xlayer/address/0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF) | [`0x8b773D83…7a64F000`](https://www.oklink.com/xlayer/address/0x8b773D83bc66Be128c60e07E17C8901f7a64F000) |
| Uniswap v3, single pool | [`0x4f0C28f5…190f9bcA`](https://www.oklink.com/xlayer/address/0x4f0C28f5926AFDA16bf2506D5D9e57Ea190f9bcA) | same |

### v1.1, 14 October 2026: the sell side

The loop only closes if a user can leave on a condition as well as arrive on one. v1.1 adds
`OrderSide` and deploys beside v1 rather than replacing it.

| Contract | Address |
|---|---|
| BespeakOrderManager v1.1 | [`0xF803E6CA20D878e72694f6a9b2fB6D0dDF06BC43`](https://www.oklink.com/xlayer/address/0xF803E6CA20D878e72694f6a9b2fB6D0dDF06BC43) |
| BespeakVaultFactory v1.1 | [`0xf4a987531b01C88E05442fe8aa228E3E6ed1A3c8`](https://www.oklink.com/xlayer/address/0xf4a987531b01C88E05442fe8aa228E3E6ed1A3c8) |
| OkxExecutionAdapter v1.1 | [`0xA6DE5fdF38619BBc51d198bE7724795B9Ca29F47`](https://www.oklink.com/xlayer/address/0xA6DE5fdF38619BBc51d198bE7724795B9Ca29F47) |

Only three contracts are new, and that is a fact about the original design rather than a
shortcut. The vault was already multi-token and the adapter already generic over input and
output, so direction turned out to live in exactly one line of the order manager:

```solidity
out.outputToken =
    o.side == OrderSide.BUY ? assetRegistry.outputToken(o.assetId) : o.outputToken;
```

The AssetRegistry, RouterRegistry and AttestedSessionVerifier are the **same contracts v1
uses**, not redeployments. That matters for evidence as much as for cost: a v1.1 order is
gated on the identical asset set, at the identical registry revision, as the fills already
on chain. A fresh registry would have made every claim carried over from v1 a claim about
different addresses wearing the same names.

Two things a sell is not allowed to choose, both closed at creation:

- **What gets sold.** `inputToken` must equal `assetRegistry.outputToken(assetId)`. Without
  this an order could name a real asset and hand the adapter an impostor token.
- **What the proceeds land in.** The output must be on the same stablecoin allowlist Bespeak
  takes payment in. A sell that could name any output token would be an arbitrary swap
  wearing an order's clothes.

First mainnet sell, 14 October:
[`0xb3615e9c…b01e3085`](https://www.oklink.com/xlayer/tx/0xb3615e9cd24c6499d6eeb9b3b55cc569ddf83a19f81b58b572e4fbeeb01e3085).
0.0008 TSLAx out, 0.291975 USDC in, `VERIFIED_FILLED` at 11/11 checks and 7 confirmations.
The receiver's USDC balance moved by exactly the amount the contract's own event reported,
read on a node that did not broadcast it.

v1 is left running and untouched. It is the deployment the 25 and 28 September fills
executed on, and it stays that way.

## What these assets actually cost to trade

Everyone in tokenized equities repeats that off-hours pricing is an estimate rather than a
market. Nobody on X Layer measures it. Bespeak already runs the two instruments the
measurement needs, a session oracle it trusts enough to gate real capital on and an
executable quote path, so the marginal cost of publishing it is two API calls per asset.

Every few minutes the keeper quotes $100 of the payment stablecoin into each xStock and
immediately quotes exactly that many tokens back out, then records what the round trip would
have cost, tagged with the underlying equity's session state.

- Page: [/data](https://bespeak.timjosh507.workers.dev/data)
- JSON: [`/api/basis`](https://bespeak.timjosh507.workers.dev/api/basis)
- CSV: [`/api/basis.csv`](https://bespeak.timjosh507.workers.dev/api/basis.csv)
- One asset: [`/api/basis/NVDAx`](https://bespeak.timjosh507.workers.dev/api/basis/NVDAx)

Public, CORS open, no key. Use it, check it, or disagree with it.

**What it is not.** It is not basis against the listed equity. There is no equity price
oracle on X Layer and the issuer publishes no price, so a number claiming to be the gap to
NASDAQ would be invented. These are executable quotes, not fills, at one size, and the size
is stored on every row rather than assumed.

## For agents

Bespeak does something an autonomous agent cannot easily do for itself: hold a funded,
bounded instruction somewhere that will act on it without the agent being awake.

MCP endpoint: `https://bespeak-mcp.timjosh507.workers.dev/mcp`, streamable HTTP, JSON-RPC
2.0, protocol `2025-06-18`. Tools: `list_assets`, `market_state`, `spread`, `build_order`,
`order_status`, `receipt`.

**Signing never happens there.** `build_order` returns an ordered list of unsigned
transactions for the caller's own signer. The server holds no key, takes no custody and
cannot move anyone's funds, which is what makes it safe to expose publicly and without
authentication.

```bash
curl -s -X POST https://bespeak-mcp.timjosh507.workers.dev/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## The canonical run, on mainnet

The claim is that an order can wait for a condition about the off-chain world and then
execute on it. One transaction proves that, and it is the one to check first.

### A conditioned order that released itself at the opening bell

28 September 2026. An order for NVDAx was created while the US market was closed, with
`NEXT_REGULAR_SESSION` as its condition. It sat. At **13:30:20 UTC**, twenty seconds after
the opening bell, the issuer's published trading state read `market`, the keeper acted on
it, and the fill was independently confirmed eight seconds later.

| Field | Value |
|---|---|
| Transaction | [`0xb8db5018…02eaf606`](https://www.oklink.com/xlayer/tx/0xb8db501816d23fbaf5ab9fd31380c25d1134abe24e0530bdb17e1c7b02eaf606) |
| Condition | `NEXT_REGULAR_SESSION`, tier `ATTESTED_SESSION` |
| Session observed | `market` at 2026-09-28T13:30:20Z |
| Submitted | 13:30:22Z |
| Verified | 13:30:28Z, through `xlayerrpc.okx.com`, which did not broadcast it |
| Outcome | `VERIFIED_FILLED`, 11 of 11 checks, 4 confirmations |
| Moved | 0.50 USDG in, 0.002171649221005318 NVDAx out |
| Route | OKX DEX aggregator, router [`0x7c5bEE2a…3060AEaF`](https://www.oklink.com/xlayer/address/0x7c5bEE2a8091C3ef39072f64F18Fac913060AEaF) |

Receipt: [`0xc50b6c43…d688ddf4`](evidence/executions/0xc50b6c432f5fe9988ecf0ed6211339052f692cfdcf06eec17be2aa2ad688ddf4.json).

### Every other mainnet execution

Listed with the outcome its own receipt records, not the outcome we would prefer.

| Date | What | Condition | Route | Transaction | Outcome |
|---|---|---|---|---|---|
| 28 Sep | 0.50 USDG to NVDAx | next regular session | OKX aggregator | [`0xb8db5018…`](https://www.oklink.com/xlayer/tx/0xb8db501816d23fbaf5ab9fd31380c25d1134abe24e0530bdb17e1c7b02eaf606) | `VERIFIED_FILLED` 11/11 |
| 14 Oct | 0.0008 TSLAx to 0.291975 USDC | immediate, **sell** | OKX aggregator | [`0xb3615e9c…`](https://www.oklink.com/xlayer/tx/0xb3615e9cd24c6499d6eeb9b3b55cc569ddf83a19f81b58b572e4fbeeb01e3085) | `VERIFIED_FILLED` 11/11 |
| 25 Sep | 0.04 USDG to NVDAx | immediate | OKX aggregator | [`0x72be50dc…`](https://www.oklink.com/xlayer/tx/0x72be50dc257b24c0fdc06c421f94c20f1cd0d4fa2d2da86147d8ddbdc8f92e07) | `VERIFIED_FILLED` 11/11 |
| 25 Sep | 1 USDG to NVDAx | immediate | Uniswap v3 pool | [`0x8c07cfb0…`](https://www.oklink.com/xlayer/tx/0x8c07cfb0776be79a6908c94a76c0c67c766b518d5b6572772b64fec0d5b32427) | `PARTIALLY_VERIFIED`, 2 of 3 confirmations |
| 25 Sep | 1 USDG to NVDAx | next regular session | Uniswap v3 pool | [`0xea4b7183…`](https://www.oklink.com/xlayer/tx/0xea4b71834b9b5fc30e022281049d9ce82ea3adddcbdcc3ac521fd15064fb2016) | `VERIFIED_FILLED`, receipt defect below |

Both venues executed for real. The adapter is router-agnostic, so the aggregator and the
pool are interchangeable behind the same proof: the delivered amount is measured from
balance deltas, not taken from the router's return value.

### Two receipts that were wrong, and are now corrected

Two receipts written by earlier versions of the keeper disagreed with the chain. Both are
fixed, and the tool that fixed them is in the repo.

`0xea4b7183` recorded zero amounts, because amounts were only taken from the contract's own
`OrderExecuted` event in a later version, and its `routeSummary` named the OKX router while
its `routerAddress` was the Uniswap `SwapRouter02`. `0x9f7f870a` recorded
`VERIFICATION_TIMEOUT`, because verification gave up while the transaction was still
propagating, although it had in fact been mined and succeeded.

Both were re-read from `xlayerrpc.okx.com`, which did not broadcast either transaction. The
amounts now come from the contract's own event, the route summary from the address the
transaction actually went to, and `0x9f7f870a` now reads `PARTIALLY_VERIFIED`.

`cli-reverify.ts` operates under four rules, because an earlier repair tool rewrote a
healthy receipt into an accusation by re-running a point-in-time balance comparison months
later against balances that had since moved:

1. It never downgrades. A receipt may only move to a stronger or equal status.
2. It refuses unless the transaction is present and successful on the independent RPC.
3. Checks only answerable at execution time are never re-run and never re-asserted.
   `0x9f7f870a` stops at `PARTIALLY_VERIFIED` for exactly this reason: its balance deltas
   were never captured, and inventing a pass for them would be the false claim this product
   exists to refuse.
4. Every change is written onto the receipt with the field, the old value, the new value and
   the reason, so the amendment is auditable rather than silent.

`0x8c07cfb0` reads `PARTIALLY_VERIFIED` at 2 of 3 confirmations. That one is not a receipt
defect: verification ran before the policy's confirmations had accrued. The cause is fixed
in `waitForReceipt`, which now waits, but the receipt records what was true at the time and
is left alone.

### The refusal matters more than the fills

Between the second and third order the US regular session ended. A conditioned order placed
after that did not execute:

```
0xb932e492 NVDAx  WAITING  MARKET_CLOSED, issuer period="extended"
```

Real capital reserved, condition unmet, nothing spent, funds released on cancellation. That
log is in `evidence/market-closed-refusal.log`. An engine that only ever fills has not shown
the part that protects the user.

### What a receipt records

Every execution writes a receipt to `evidence/executions/`, carrying the order, the
condition and its source tier, the venue that priced it, the amounts the chain reported,
both RPC endpoints, and each verification check with its expected and observed value. The
amounts come from the contract's own `OrderExecuted` event, and stay null when no such
event was observed, an unconfirmed execution can never render as a zero-value fill.

## What is actually true here

Deadline projects are full of claims that outrun their evidence. These are the ones
Bespeak makes, and what each rests on.

| Claim | Evidence | Limitation |
|---|---|---|
| xStocks are real and live on X Layer 196 | `symbol()`, `decimals()` and wrapper `asset()` called on chain for every supported asset; 12/12 verified | Only the 12 onboarded assets are checked, not the 1026-asset catalogue |
| Asset identity comes from the issuer, not a ticker | Registry entries carry source URI, payload hash and fetch time; promotion to `SUPPORTED` requires a non-zero on-chain deployment | The issuer API exposes only the current (v2) wrapper; there is no field enumerating legacy wrappers |
| Capital cannot be overspent or double-spent | Reservation accounting lives in the vault, not the order manager; fuzz-tested `available + reserved == balance` |, |
| An order executes at most once | `FILLED` is written before any external call; `executionCount` is asserted by the verifier |, |
| Market session is verified | **No.** It is *operator-attested*, see below | Tier 1 was not reproducible in this build; see below |
| A fill is verified, not claimed | Independent RPC readback of receiver and vault balance deltas, separate from the broadcast path | A run that cannot be confirmed is reported as `OUTCOME_UNKNOWN`, not as success |

### The market-session source is Tier 3, and we say so everywhere

The PRD's preferred design used Chainlink Data Streams. We checked, rather than assumed:

- OKX **officially announced** Chainlink Data Streams on X Layer on 17 June 2026, including
  24/5 US equity streams for TSLA, NVDA and AAPL.
- The Data Streams **VerifierProxy 2.0.0 is genuinely live on X Layer** at
  `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7`, confirmed by direct `cast call`, not by
  reading a docs page.
- The equity report schema (**v11 "RWA Advanced"**, not the v4 that older docs describe)
  really does carry a `marketStatus` field with the session values we need.

**What we could not do** is reproduce usable equity-stream delivery and on-chain
verification for Bespeak using the feed catalog, credentials and public integration path
available to us in this build. That is a statement about our own reproduction attempt, not
about whether the streams exist, the announcement says they do, and we have no evidence
contradicting it.

Because a condition source Bespeak cannot itself exercise cannot be a condition source
Bespeak depends on, Tier 1 stays unused and Bespeak ships Tier 3 `ATTESTED_SESSION`,
sourced from the **xStocks issuer's own published trading state** for the exact token being
bought, which also reports halts a calendar cannot know. The keeper signs that observation
as an EIP-712 attestation, and the contract verifies the signature and its freshness on
chain, so the claim is non-repudiable and auditable afterwards rather than implicitly
trusted.

**That is not trustless and Bespeak never calls it that.** Every receipt records the tier.
Every order stores the weakest tier it will accept, so an order demanding something stronger
keeps waiting instead of quietly settling for less. The Tier 1 verifier sits behind the same
interface and can be switched on without touching order logic.

---

## Architecture

```
 user wallet
     │  deposit / createOrder / cancel
     ▼
 BespeakVault (one per user, never pooled)
     │  reserve · release · spendFromReservation
     ▼
 BespeakOrderManager ──── AssetRegistry     (who this token really is)
     │                ──── RouterRegistry    (who may touch the money)
     │                ──── IConditionSource  (what the market is doing)
     ▼
 OkxExecutionAdapter ──► approved OKX router ──► X Layer liquidity ──► user's wallet
     │
     ▼
 independent verifier (different RPC) ──► receipt: VERIFIED_FILLED or an honest lesser state
```

Three separations do most of the safety work:

**The vault does not know what an order is.** It knows that capital committed to
reservation `id` can be spent up to what remains on that reservation and no further. That
makes "a vault can never spend more than the executing order reserved" a structural
property, not a rule the order manager has to remember.

**The adapter does not decide eligibility.** It allowlists who may be called, caps what may
be spent, and measures the result from balance deltas. It never reads the API's claims about
what a route will do. A route that under-delivers, over-consumes or redirects the output
fails a postcondition and takes the transaction down with it.

**The broadcaster does not declare success.** The verifier reads through a different RPC, enforced in code, not convention, re-reads the block to catch a reorg, and compares the
receiver's and vault's real balance changes against what was captured before submission.

---

## Invariants, and where they are proven

`contracts/test/`, 66 tests, all passing (61 unit and fuzz, 5 against a mainnet fork).

| | Invariant | Test |
|---|---|---|
| INV-01 | A vault never spends more than the executing order reserved | `testFuzz_accountingIdentityHolds`, `test_cannotWithdrawReservedCapital` |
| INV-02 | An occurrence executes at most once | `test_P5_duplicateExecutionImpossible` |
| INV-03 | A cancelled order never executes | `test_P12_cancelledOrderCannotFill` |
| INV-04 | An expired order never executes | `test_P8_expiryReleasesReservationAndBlocksFill` |
| INV-05 | An unsupported or paused asset never executes | `test_P18_pausedAssetCannotExecute` |
| INV-06 | An unapproved router or approval target never spends | `test_P14_unapprovedRouterCannotSpend`, `test_P14_unapprovedApproveTargetCannotSpend` |
| INV-10 | Stale or unknown market state is never read as eligibility | `test_P3_staleObservationDoesNotExecute`, `test_P3_unknownMarketHolds` |
| INV-11 | Released capital becomes available exactly once | `test_cancelReleasesExactlyOnce` |
| INV-12 | Partial input consumption releases the remainder | `test_P7_partialInputRefundsUnusedCapital` |
| INV-13 | Occurrences never share reserved capital | `test_INV13_occurrencesCannotShareCapital` |
| INV-14 | A protected corporate-action window cannot execute | `test_P6_corporateActionWindowHoldsThenResumes` |
| INV-16 | A source-tier downgrade is never silent | `test_P13_forbiddenTierDowngradeKeepsWaiting` |
| INV-17 | Route calldata cannot redirect the purchased asset | `test_INV17_routeCannotRedirectOutput` |
| INV-18 | No unbounded allowance survives an execution | `test_INV18_noLingeringAllowance` |

```bash
forge test --root contracts -vv
```

---

## Running it

```bash
pnpm install
forge test --root contracts          # 66 tests
pnpm --filter @bespeak/assets sync    # pull + on-chain-verify the asset registry
pnpm --filter @bespeak/conditions probe  # read the live market session
pnpm --filter @bespeak/web dev        # the app on :3000
```

The two probes above hit live public endpoints and need no credentials, they are the
quickest way to confirm the provenance and condition layers do what this README says.

Deployment and execution need:

```bash
cp .env.example .env    # then fill in
forge script script/Deploy.s.sol --root contracts --rpc-url $XLAYER_RPC_URL --broadcast
pnpm --filter @bespeak/worker registry:push   # promote verified assets
pnpm --filter @bespeak/worker routers:push    # allowlist the live OKX router
pnpm --filter @bespeak/worker keeper --dry-run
```

Verify any receipt yourself, without trusting this repo's server:

```bash
pnpm --filter @bespeak/worker verify <receiptId>
```

That recomputes the receipt's content hash *and* re-derives every postcondition from chain
state through the independent RPC. An edited receipt fails even when the chain data still
supports the original outcome.

---

## What this is not

Not a trading bot, it never forms an investment opinion. Not a price-improvement product, Bespeak never claims waiting gets you a better price. Not a pooled fund, there is no shared
custody anywhere in the design. Not advice.

Bespeak carries out the instruction you authorized, inside the limits you set, and reports
what actually happened.
