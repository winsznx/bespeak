# Architecture

Bespeak turns a pre-authorized intent into a bounded future execution on X Layer, then
proves the result independently. This document explains how, and — more usefully — why each
boundary sits where it does.

---

## The shape

```
 user wallet
     │  deposit · createOrder · cancel · withdraw
     ▼
 BespeakVault                        one per user, created by BespeakVaultFactory
     │                               holds stablecoins; owns the reservation ledger
     │  reserve · release · spendFromReservation   (order manager only)
     ▼
 BespeakOrderManager                 the authoritative lifecycle
     │        ├── AssetRegistry      which token this really is, with provenance
     │        ├── RouterRegistry     who may be called and who may be approved
     │        └── IConditionSource   what the market is doing, and at what tier
     ▼
 OkxExecutionAdapter                 the only place capital meets an external contract
     │  bounded approve → router call → measure balance deltas → refund remainder
     ▼
 approved OKX DEX router ──► X Layer liquidity ──► user's receiver address

 ─────────────── separately, through a different RPC ───────────────
 verifier ──► re-read order state, balances, event, block ──► receipt outcome
```

Off-chain there are exactly two long-running concerns — a keeper that proposes executions
and a verifier that judges them — plus a Next.js app. There is no indexer database in the
authority path, by design (see *No hidden authority* below).

---

## Four separations that do the real work

### 1. The vault does not know what an order is

`BespeakVault` has no concept of orders, market sessions, routers or users other than its
own owner. It knows one thing: capital committed to reservation `id` may be spent up to
what remains on that reservation, and not one wei further.

That turns INV-01 — *a vault may never spend more than the amount reserved to the executing
order* — from a rule the order manager must remember into a structural property of the
contract that holds the money. If the order manager were compromised tomorrow, it still
could not overspend a reservation.

The accounting identity `available + reserved == balance` is derived from the live token
balance rather than a running total, so a direct ERC-20 transfer into the vault is counted
correctly and can never be double-spent against an existing reservation. It is fuzz-tested.

### 2. The adapter does not decide eligibility, and does not believe the API

`OkxExecutionAdapter` is handed calldata produced by an external service. It never reads
that service's claims about what the route will do.

It allowlists **who** may be called (router) and **who** may be approved (approval target)
as two independent sets — because the OKX API returns them separately, and either one alone
would be enough to redirect the input. It approves exactly the attempt amount, clears the
allowance unconditionally afterwards, and then measures what actually happened from token
balance deltas:

- `spent` = the adapter's input balance before minus after
- `received` = the **receiver's** output balance after minus before

A route that under-delivers, over-consumes, or pays someone other than the authorized
receiver fails a postcondition and takes the whole transaction down with it. A route that
ignores the receiver parameter and pays the adapter instead is handled too: the adapter
forwards and *then* measures, so the user ends in the same state either way and the
measurement stays honest about which path was taken.

The adapter cannot decide an order is eligible. That belongs to the order manager.

### 3. One eligibility function, shared by simulation and execution

`checkExecution()` is a view. `execute()` is a transaction. Both call the same internal
`_evaluate()`.

This matters more than it looks. It means a refusal can be *inspected* — a reviewer can ask
the contract "why is this order not executing?" and get `MARKET_CLOSED` or `QUOTE_STALE`
back — without anyone manufacturing a failed transaction to produce evidence. And it means
simulation and reality cannot drift: there is no second copy of the rules to fall out of
sync.

The keeper never forms its own opinion about eligibility. It gathers a condition and a
route, then asks the contract. So it cannot execute something the contract would refuse,
nor hold something the contract would allow.

### 4. The component that broadcasts does not declare success

The keeper submits through `XLAYER_RPC_URL`. The verifier reads through
`XLAYER_VERIFY_RPC_URL`. If they are equal the verifier refuses to run — enforced in code,
not by convention, because an independence property left to a config file decays silently.

Verification re-reads the block by number to confirm it still carries the same hash
(catching a reorg), parses the contract's own `OrderExecuted` event out of the receipt
rather than trusting the keeper's account of it, and compares the receiver's and vault's
real balance changes against the values captured *before* submission.

That pre-capture is why the keeper's order of operations is: assess → **capture balances** →
submit → verify. Without the pre-state there is nothing to compare against, and a fill could
only ever be claimed.

Outcomes: `VERIFIED_FILLED` when everything holds, `CONTRADICTED` when observed state
disagrees with the receipt, `ROLLED_BACK` on reorg, `PARTIALLY_VERIFIED` below the
confirmation policy, and `OUTCOME_UNKNOWN` / `VERIFICATION_TIMEOUT` when it simply cannot
establish the answer. Nothing upgrades silently.

---

## The condition ladder

`IConditionSource` has three implementations' worth of room and ships one:

| Tier | Source | Status |
|---|---|---|
| 1 `VERIFIED_DATA_STREAMS` | Chainlink Data Streams, schema v11 `marketStatus` | interface ready, not exercised — see README |
| 2 `SECONDARY_VERIFIED_ORACLE` | another verifiable oracle on 196 | none identified |
| 3 `ATTESTED_SESSION` | xStocks issuer's published trading state, EIP-712 signed by the keeper | **deployed** |

Tier 3 is honest about what it is. The keeper signs an EIP-712 attestation over
`(assetId, marketStatus, observedAt, sourceId, payloadHash)`; the contract recovers the
signer, checks it against an authorized set, and enforces freshness. That does not make the
market state trustless. It makes the *assertion* non-repudiable: anyone holding the receipt
can later prove which key claimed which session at which timestamp, and check it against the
issuer payload hash. A keeper that merely sends `execute()` leaves no such artifact.

**No silent downgrade.** Every order stores `minSourceTier`. Tiers are numbered so that
higher is weaker, and an observation weaker than the order authorized returns
`CONDITION_TIER_NOT_AUTHORIZED` — the order keeps waiting rather than quietly settling.

Validity and session are deliberately separate concerns. The source reports
`valid = is this fresh enough to believe`; the order manager decides whether the session it
names permits execution. That keeps `CONDITION_REPORT_STALE` and `MARKET_UNKNOWN`
distinguishable, so a user sees which one actually held their order.

---

## Asset identity

A ticker string decides nothing. `AssetRegistry` entries carry the issuer's canonical id,
the X Layer deployment, the current wrapper, and the provenance that justifies them —
source URI, payload hash, fetch timestamp — and every mutation emits all of it, so the
registry's history is auditable from logs alone.

Promotion to `SUPPORTED` requires a non-zero on-chain deployment, which is what makes
`WHEN_AVAILABLE` resolve through exactly the same check as everything else: an asset with no
proven deployment cannot be promoted, therefore cannot execute, therefore the order waits.

The sync tool goes further than the API: for each asset it calls `symbol()`, `decimals()`
and, for wrappers, `asset()` on chain, and only an asset whose wrapper round-trips to the
published underlying is promoted. One that fails is written as `DISCOVERED` — visible and
inspectable, but unexecutable.

`revision` bumps on every change, and orders pin the revision they were created under, so a
later edit cannot rewrite the asset identity inside a historical receipt.

---

## Recurrence, lazily

A ten-week plan must not lock ten weeks of capital on day one.

`createRecurring` funds occurrence 1 only. Occurrence N+1 is created when occurrence N
reaches a terminal state, each with its own order id, its own reservation and its own
receipt. Completed occurrences are never mutated.

When the vault cannot fund the next one, the series emits `RecurringOccurrenceHeld` with
`INSUFFICIENT_RESERVED_BALANCE` and stays **active** — the user tops up and it resumes. A
series that silently cancelled itself because a balance dipped would be the worst possible
behaviour for a standing instruction.

`createNextOccurrence` is permissionless: it can only ever create the occurrence the
schedule already authorized, so letting anyone trigger it removes a liveness dependency on
the keeper without widening authority.

---

## No hidden authority

The database problem in a system like this is that an off-chain row starts as an index and
quietly becomes the truth. Bespeak has no such row.

The web app reads orders and vault balances from the contracts on every poll. The keeper
reads from the contracts. The verifier reads from the contracts, through a different node.
Receipts are content-addressed JSON files rather than rows, because evidence a running
service can silently rewrite is weaker evidence — a file can be committed, hashed, and
re-checked by someone who does not trust the server that produced it.

`INV-19` — *a database or keeper state cannot make an inactive on-chain order executable* —
is satisfied by there being nowhere for such state to live.

---

## What admin can and cannot do

Admin may pause an asset, pause the system, repoint infrastructure, and manage the keeper
and attestor sets. Every privileged action emits an event.

Admin may **not** withdraw user funds, redirect a receiver, alter an order's amount or
limits, or execute an expired order. There is no function that does any of those things —
this is not a policy, it is an absence, and `test_adminCannotTouchUserOrder` asserts it.

There is no proxy and no upgradeability. A bad deployment is replaced by deploying again
and repointing, which is visible on chain, rather than by mutating code behind users.

---

## Time

Scheduling and next-opportunity timestamps render in the user's local timezone with the
zone named, because a time shown in the wrong zone is a time the user cannot act on.
Receipts, evidence and logs are UTC. Contract timestamps are Unix seconds.

A timezone rendering bug can therefore never alter trigger eligibility: presentation time
and execution time never touch.
