# Bespeak

**Condition-aware standing orders for tokenized stocks on X Layer.**

Choose an official xStock, say when Bespeak may buy it, set your limits, and leave.
Bespeak reserves your stablecoins in a vault only you can withdraw from, waits for the
condition you chose, executes within your limits on X Layer, sends the asset straight to
your wallet, and then independently re-checks the chain to confirm it actually arrived
before calling the order complete.

Built for OKX Dev Day 2026 — Build a Market track, Remote Build, X Layer mainnet (chain 196).

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
| Buy now | `IMMEDIATE` | nothing — executes on the next pass |
| Next regular session | `NEXT_REGULAR_SESSION` | the underlying US equity's regular cash session |
| When available on X Layer | `WHEN_AVAILABLE` | the asset becoming executable on X Layer |
| Repeat | recurring occurrences | the chosen condition, once per occurrence |

These are four surfaces over one primitive. They share the vault, the order record, the
asset registry, the eligibility check, the quote engine, the execution adapter, the
postconditions and the receipt. Only the trigger differs — which is exactly why **Buy now**
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

## The canonical run, on mainnet

Three conditioned orders on X Layer, 25 September 2026. Every transaction below was read
back through RPCs that did not broadcast it (`xlayerrpc.okx.com`, `xlayer.drpc.org`); the
block, status and gas agree across both.

| What | Route | Transaction | Result |
|---|---|---|---|
| $1 NVDAx, next regular session | Uniswap v3 pool | [`0xea4b7183…fb2016`](https://www.oklink.com/xlayer/tx/0xea4b71834b9b5fc30e022281049d9ce82ea3adddcbdcc3ac521fd15064fb2016) | `VERIFIED_FILLED` |
| $1 NVDAx, immediate | Uniswap v3 pool | [`0x8c07cfb0…5b32427`](https://www.oklink.com/xlayer/tx/0x8c07cfb0776be79a6908c94a76c0c67c766b518d5b6572772b64fec0d5b32427) | `VERIFIED_FILLED`, 11/11 checks |
| $0.04 NVDAx, immediate | OKX DEX aggregator | [`0x72be50dc…c8f92e07`](https://www.oklink.com/xlayer/tx/0x72be50dc257b24c0fdc06c421f94c20f1cd0d4fa2d2da86147d8ddbdc8f92e07) | `VERIFIED_FILLED`, 11/11 checks |

Both route sources executed for real. The adapter is router-agnostic, so the aggregator and
the pool are interchangeable behind the same proof: the delivered amount is measured from
balance deltas, not taken from the router's return value.

### The refusal matters more than the fills

Between the second and third order the US regular session ended. A conditioned order placed
after that did not execute:

```
0xb932e492 NVDAx  WAITING  MARKET_CLOSED — issuer period="extended"
```

Real capital reserved, condition unmet, nothing spent, funds released on cancellation. That
log is in `evidence/market-closed-refusal.log`. An engine that only ever fills has not shown
the part that protects the user.

### What a receipt records

Every execution writes a receipt to `evidence/executions/`, carrying the order, the
condition and its source tier, the venue that priced it, the amounts the chain reported,
both RPC endpoints, and each verification check with its expected and observed value. The
amounts come from the contract's own `OrderExecuted` event, and stay null when no such
event was observed — an unconfirmed execution can never render as a zero-value fill.

## What is actually true here

Deadline projects are full of claims that outrun their evidence. These are the ones
Bespeak makes, and what each rests on.

| Claim | Evidence | Limitation |
|---|---|---|
| xStocks are real and live on X Layer 196 | `symbol()`, `decimals()` and wrapper `asset()` called on chain for every supported asset; 12/12 verified | Only the 12 onboarded assets are checked, not the 1026-asset catalogue |
| Asset identity comes from the issuer, not a ticker | Registry entries carry source URI, payload hash and fetch time; promotion to `SUPPORTED` requires a non-zero on-chain deployment | The issuer API exposes only the current (v2) wrapper; there is no field enumerating legacy wrappers |
| Capital cannot be overspent or double-spent | Reservation accounting lives in the vault, not the order manager; fuzz-tested `available + reserved == balance` | — |
| An order executes at most once | `FILLED` is written before any external call; `executionCount` is asserted by the verifier | — |
| Market session is verified | **No.** It is *operator-attested* — see below | Tier 1 was not reproducible in this build; see below |
| A fill is verified, not claimed | Independent RPC readback of receiver and vault balance deltas, separate from the broadcast path | A run that cannot be confirmed is reported as `OUTCOME_UNKNOWN`, not as success |

### The market-session source is Tier 3, and we say so everywhere

The PRD's preferred design used Chainlink Data Streams. We checked, rather than assumed:

- OKX **officially announced** Chainlink Data Streams on X Layer on 17 June 2026, including
  24/5 US equity streams for TSLA, NVDA and AAPL.
- The Data Streams **VerifierProxy 2.0.0 is genuinely live on X Layer** at
  `0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` — confirmed by direct `cast call`, not by
  reading a docs page.
- The equity report schema (**v11 "RWA Advanced"**, not the v4 that older docs describe)
  really does carry a `marketStatus` field with the session values we need.

**What we could not do** is reproduce usable equity-stream delivery and on-chain
verification for Bespeak using the feed catalog, credentials and public integration path
available to us in this build. That is a statement about our own reproduction attempt, not
about whether the streams exist — the announcement says they do, and we have no evidence
contradicting it.

Because a condition source Bespeak cannot itself exercise cannot be a condition source
Bespeak depends on, Tier 1 stays unused and Bespeak ships Tier 3 `ATTESTED_SESSION`,
sourced from the **xStocks issuer's own published trading state** for the exact token being
bought — which also reports halts a calendar cannot know. The keeper signs that observation
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

**The broadcaster does not declare success.** The verifier reads through a different RPC —
enforced in code, not convention — re-reads the block to catch a reorg, and compares the
receiver's and vault's real balance changes against what was captured before submission.

---

## Invariants, and where they are proven

`contracts/test/` — 45 tests, all passing.

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
forge test --root contracts          # 45 tests
pnpm --filter @bespeak/assets sync    # pull + on-chain-verify the asset registry
pnpm --filter @bespeak/conditions probe  # read the live market session
pnpm --filter @bespeak/web dev        # the app on :3000
```

The two probes above hit live public endpoints and need no credentials — they are the
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

Not a trading bot — it never forms an investment opinion. Not a price-improvement product —
Bespeak never claims waiting gets you a better price. Not a pooled fund — there is no shared
custody anywhere in the design. Not advice.

Bespeak carries out the instruction you authorized, inside the limits you set, and reports
what actually happened.
