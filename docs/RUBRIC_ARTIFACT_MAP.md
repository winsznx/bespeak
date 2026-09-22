# Rubric → artifact map

OKX publishes seven holistic judging dimensions without weights, so this binds each one to
an exact artifact rather than inventing a score.

Every row names something a reviewer can open, run, or read. `see repo` is not an entry.
Rows marked **PENDING** are not yet true and say so.

Commit: see `submission-facts.json` → `commit`.

---

## 1. Innovation

**Claim.** A conditioned standing-order primitive for tokenized equities: capital committed
now, execution authorized later when a verifiable market condition becomes true, across
immediate, session, availability and recurring surfaces — through one engine.

| Artifact | Where |
|---|---|
| The four paths sharing one primitive | `contracts/src/BespeakOrderManager.sol` — one `_evaluate()`, `TriggerType` is the only branch |
| Why this is not a DCA bot | `README.md` § The problem; `docs/ARCHITECTURE.md` § The condition ladder |
| Condition-source ladder with tier enforcement | `contracts/src/interfaces/IConditionSource.sol`, `AttestedSessionVerifier.sol` |
| Proof a downgrade cannot happen silently | `ExecutionTest:test_P13_forbiddenTierDowngradeKeepsWaiting` |

**Limitation.** The primitive is novel in composition, not in any single component.

---

## 2. Product completeness

**Claim.** A fresh user can connect, fund, create, wait, understand the wait, cancel,
recover funds, and read a receipt — without developer narration.

| Artifact | Where |
|---|---|
| Nine product routes | `apps/web/src/app/` — home, markets, asset, orders, vault, demand, activity, receipt, proof |
| Order composer covering all four paths | `apps/web/src/components/OrderComposer.tsx` |
| Repeat series as a first-class object | `apps/web/src/components/RecurringList.tsx` |
| Real hold reasons, not a generic spinner | `apps/web/src/components/OrdersClient.tsx` → `HoldReason` |
| Disconnected / wrong-network / not-deployed / empty states | `ConnectButton.tsx`, every page's guard clauses |
| Production build | `pnpm --filter @bespeak/web build` — 12 routes |

**PENDING.** Live deployed URL. External clean-browser acceptance pass.

---

## 3. User value

**Claim.** The user stops babysitting the market. They define the condition once, leave, and
return to a verified purchase or a plain explanation.

| Artifact | Where |
|---|---|
| The burden/return contract, stated in product copy | `apps/web/src/app/page.tsx` § What you get for reserving capital |
| Lazy recurrence — a 10-week plan does not lock 10 weeks of capital | `RecurringTest:test_P11_lazyReservationDoesNotLockTheWholePlan` |
| Underfunded series holds instead of silently cancelling | `RecurringTest:test_P11_underfundedNextOccurrenceHoldsInsteadOfCancelling` |
| Funds are always recoverable; expiry is permissionless | `BespeakOrderManager.expireOrder`, `ExecutionTest:test_P8_...` |
| Plain-language reason codes | `packages/shared/src/types.ts` → `REASON_COPY` |

**PENDING.** Outsider comprehension test. **Limitation.** No price-improvement claim is made
anywhere, by design.

---

## 4. Technical execution

**Claim.** Non-pooled vaults, a bounded adapter that disbelieves the routing API, one shared
eligibility function, and a verifier that the broadcaster does not control.

| Artifact | Where |
|---|---|
| 52 tests | `forge test --root contracts` |
| Proof campaign, 27 cases | `node campaign/run.mjs` → `evidence/campaign.json` |
| Fuzzed vault accounting identity | `VaultTest:testFuzz_accountingIdentityHolds` |
| Fuzzed partial-consumption accounting | `AdapterTest:testFuzz_partialConsumptionAccounting` |
| Reentrancy cannot double-fill | `AdapterTest:test_reentrantRouterCannotDoubleFill` |
| Independent verifier, enforced distinct RPC | `services/worker/src/verifier.ts`, `config.ts:assertIndependentReadPath` |
| Invariant → test table | `README.md` |
| Threat model with per-threat proof | `docs/SECURITY.md` |

**Limitation.** No external audit. **PENDING.** P15 (OUTCOME_UNKNOWN) and P16 (tamper) are
implemented but need a mainnet receipt to exercise.

---

## 5. Meaningful X Layer / OKX integration

**Claim.** Vault state, orders, reservations and settlement live on X Layer. Assets are
official xStocks verified on chain 196. Routing is OKX DEX.

| Artifact | Where |
|---|---|
| 12/12 assets verified on chain 196 | `pnpm --filter @bespeak/assets sync`; `packages/assets/manifest.json` |
| Provenance against real chain, not the API that asserted it | `ForkXLayerTest:test_fork_assetProvenanceHoldsOnChain` |
| Real X Layer USDC through the real vault | `ForkXLayerTest:test_fork_realUsdcVaultAccounting` |
| OKX DEX v6 client, five-header signing | `packages/okx/src/client.ts` |
| Router/approve-target allowlist from the live API, never hardcoded | `services/worker/src/cli-routers.ts` |
| Chainlink VerifierProxy confirmed live on 196 | `internal → docs/GATES`; `cast call` output in `submission-facts.json` |

**PENDING.** Mainnet contract addresses. The canonical run with a live OKX route.
**Limitation.** OKX routing is implemented and unit-tested against fixtures; it has not been
exercised against the live API.

---

## 6. Growth potential

**Claim.** Recurrence creates repeat flow; committed demand is a real dataset; the same
primitive embeds where recurring intent already lives.

| Artifact | Where |
|---|---|
| Recurrence producing independent occurrences | `RecurringTest:test_P11_twoIndependentOccurrencesComplete` |
| Demand surface counting only live reservations | `apps/web/src/app/demand/page.tsx`, `/api/demand` |
| Read API for integrators and agents | `apps/web/src/app/api/` — 7 routes |
| Distribution thesis, stated as a thesis | `README.md`; PRD §74 |

**Limitation.** Zero users. The Demand page and `/api/demand` both carry a line saying they
are not an adoption metric. No partnership is claimed or implied.

---

## 7. OKX ecosystem contribution

**Claim.** Real integration findings, a reusable conditioned-execution pattern, and an
honest discrepancy report.

| Artifact | Where |
|---|---|
| Integration findings from this build | `docs/SPONSOR_FINDINGS.md` (published subset) |
| xStocks API pagination trap — page 0 hides NVDA/TSLA/AAPL | ibid. F-04 |
| OKX DEX docs list four auth headers; the SDK sends five | ibid. F-05 |
| Data Streams announcement vs docs-tracking discrepancy, reported as open | ibid. F-01 |
| Reusable pattern: bounded adapter + closed-loop verification | `docs/ARCHITECTURE.md` |

**Limitation.** No upstream PR has been filed yet.

---

## Coverage

| | |
|---|---|
| Official categories claimed | 7 |
| Categories with at least one exact bound artifact | 7 |
| **Binding coverage** | **100%** |
| Categories with a PENDING item | 4 — all pending items depend on the mainnet run |

No category's claim rests solely on a pending artifact; each has at least one that is true
and checkable today.
