# Security

Bespeak spends user capital while the user is offline. That makes the threat model the
product, not a section at the end of it.

The governing rule for everything below: **architecture complexity can be cut for a
deadline; core money safety cannot.**

---

## What each component is trusted for

| Component | Trusted for | Explicitly NOT trusted for |
|---|---|---|
| `BespeakVault` | holding capital and enforcing the reservation ceiling | deciding whether an order may execute |
| `BespeakOrderManager` | authoritative order lifecycle and eligibility | holding funds; it never takes custody |
| `AssetRegistry` | asset identity at a recorded revision | anything about order state or capital |
| `RouterRegistry` | which addresses may be called or approved | what a route will do |
| `IConditionSource` | reporting a market observation **at its disclosed tier** | guaranteeing a favourable execution |
| Keeper | liveness and transaction submission | amount, receiver, asset, limits, or terminal state |
| OKX DEX API | constructing a route | declaring the user's outcome |
| xStocks API | canonical asset metadata at a recorded revision | Bespeak order state |
| Independent verifier | reconstructing final chain state | changing that state |
| Web app / API | presentation | authoritative funds or order state |

---

## Threats and mitigations

### Spending another user's capital
Vaults are per-owner contracts created by `CREATE2` from the owner address. A vault's
storage is only reachable through the one owner it was created for. Reservations are keyed
by order id inside that vault. There is no shared pool to reach into.
*Proven:* `test_vaultsAreIsolated`.

### Spending more than the order authorized
The vault debits a reservation **before** transferring, and refuses any amount above what
remains on that id. The order manager additionally refuses `amountIn > order.amountIn`.
Either check alone is sufficient; both are present because the vault must be safe even if
the order manager is wrong.
*Proven:* `testFuzz_accountingIdentityHolds`, `test_keeperCannotIncreaseInputAboveOrder`.

### Double execution
`status = FILLED` is written before any external call, so a reentrant second invocation
finds a non-ACTIVE order. `nonReentrant` guards sit on both `execute` and the adapter.
`executionCount` is asserted by the independent verifier as a third, off-chain check.
*Proven:* `test_P5_duplicateExecutionImpossible`, `test_reentrantRouterCannotDoubleFill`.

### Malicious or mistaken route calldata
The adapter is handed calldata from an external service and treats it as hostile input. It
checks the router and the approval target against **two independent allowlists**, because
the OKX API returns them separately and either alone would be enough to redirect the input.
It approves exactly the attempt amount and clears the allowance unconditionally afterwards.
Then it measures reality: `spent` from its own balance delta, `received` from the
**receiver's** balance delta.

A route that redirects the output fails the receiver measurement. One that under-delivers
fails `minAmountOut`. One that over-consumes fails `OverSpent`. All of them revert the
entire transaction.
*Proven:* `test_P14_*`, `test_INV17_routeCannotRedirectOutput`, `test_P4_underDeliveringRouteReverts`.

### A token contract masquerading as an official asset
Ticker strings decide nothing. The registry stores the issuer's canonical id and the exact
deployment address, and the sync tool independently calls `symbol()` and, for wrappers,
`asset()` on chain — an asset whose wrapper does not round-trip to the published underlying
is never promoted to `SUPPORTED`. Promotion also requires a non-zero deployment address.
*Proven:* `test_P18_assetWithoutDeploymentCannotBeSupported`, `test_fork_assetProvenanceHoldsOnChain`.

### A stale or fabricated market observation
Attestations are EIP-712 signatures over the exact claim. A signature from an unauthorized
key **reverts** — a forgery is an attack, not a market reading. A stale attestation returns
`valid = false`, which surfaces as an inspectable `CONDITION_REPORT_STALE` rather than an
opaque revert. An observation timestamped meaningfully in the future reverts.

Freshness is decided independently of the reported session, so a stale `REGULAR` is never
eligibility.
*Proven:* `test_forgedAttestationReverts`, `test_P3_staleObservationDoesNotExecute`.

### A silently weakened condition source
Tiers are numbered so higher is weaker. Every order stores `minSourceTier`, and an
observation weaker than authorized returns `CONDITION_TIER_NOT_AUTHORIZED` — the order
waits rather than settling.
*Proven:* `test_P13_forbiddenTierDowngradeKeepsWaiting`.

### Execution during a corporate action
xStocks multiplier activations are published ahead of time. The registry holds an
activation timestamp and a protection window (default ±15 minutes) and refuses execution
inside it, then resumes automatically with no user action.
*Proven:* `test_P6_corporateActionWindowHoldsThenResumes`.

### A partial fill misreported as a complete one
Actual spend is a balance delta, never an API claim. Unused input returns to the vault and
the remaining reservation is released, so the user's available balance reflects what was
actually spent rather than what was authorized.
*Proven:* `test_P7_partialInputRefundsUnusedCapital`, `testFuzz_partialConsumptionAccounting`.

### A keeper that disappears, or runs out of gas mid-flight
The keeper cannot hold funds and cannot change intent. It stops attempting value-moving
transactions below a configured OKB threshold — halting early leaves the user's cancel and
withdraw paths completely intact, whereas running out mid-execution would not.

Users are never dependent on the operator to recover capital: `cancelOrder` is owner-only
and `expireOrder` is **permissionless**, so a past-deadline order can be released by anyone
if the operator vanishes entirely.

### An off-chain database quietly becoming the truth
There is no database in the authority path. The app, the keeper and the verifier all read
from the contracts. Receipts are content-addressed files, not rows, so evidence cannot be
silently rewritten by a running service.

### A compromised admin key
Admin may pause an asset, pause the system, repoint infrastructure, and manage keeper and
attestor sets. Every privileged action emits an event.

Admin **cannot** withdraw user funds, redirect a receiver, change an order's amount or
limits, or execute an expired order. No function exists that does any of these — this is an
absence, not a policy.
*Proven:* `test_adminCannotTouchUserOrder`.

There is no proxy and no upgradeability, so there is no path by which code changes beneath
a user who already has capital committed.

### A reorg after an apparently successful fill
Verification re-reads the block by number and compares its hash. A block that is no longer
canonical yields `ROLLED_BACK`. Below the configured confirmation count the outcome is
`PARTIALLY_VERIFIED`, never `VERIFIED_FILLED`.

---

## Known limitations

These are real and are stated rather than mitigated.

1. **The market session is operator-attested (Tier 3).** The signature proves which key
   asserted which session and when; it does not prove the assertion was correct. A
   compromised attestor key could assert a session that is not occurring. It could not
   change the amount, receiver, asset or limits, and could not execute a cancelled or
   expired order — the blast radius is "executes inside your envelope at the wrong time",
   not "steals funds". Mitigated operationally by a short freshness window (60s) and a
   revocable attestor set.

2. **No formal verification or external audit.** 52 tests including fuzzed accounting
   invariants and a mainnet-fork suite. That is not an audit.

3. **The keeper is currently a single operator.** The architecture supports multiple
   executors and the execution envelope is constrained enough that permissionless execution
   is a reasonable future step, but it is not implemented.

4. **Admin is a single EOA.** A multisig is the obvious next step and is not in place.

5. **Liquidity and route quality are not guaranteed.** Bespeak enforces the user's floor
   and refuses to execute outside it; it cannot manufacture a good price.

---

## Reporting

Security issues: open an issue on the repository. There is no bounty programme.
