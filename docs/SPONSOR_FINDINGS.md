# Integration findings

Things we hit while integrating xStocks, OKX DEX and Chainlink on X Layer that a next
builder would otherwise rediscover the hard way. Everything here was observed in this
build, not recalled from documentation.

Reported in the spirit of being useful to the ecosystem rather than scoring points: where
we could not tell whether a gap was theirs or ours, we say so.

## F-01 — Discrepancy between the X Layer Data Streams announcement and docs-repo tracking data
PRESERVED AS AN OPEN DISCREPANCY. This is a report, not a conclusion.

Established:
- OKX officially announced Chainlink Data Streams on X Layer on 17 June 2026, including
  24/5 US equity streams for TSLA, NVDA and AAPL.
- The Data Streams VerifierProxy 2.0.0 is genuinely live on chain 196 at
  0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7 (verified by direct cast call in this build:
  14,021 bytes of code, typeAndVersion() = "VerifierProxy 2.0.0").
- Report schema v11 "RWA Advanced" carries marketStatus (uint32) with the session values a
  market-session trigger needs.

The discrepancy:
- Chainlink's docs-repo feed-tracking file (`.github/scripts/data/baseline.json` in
  smartcontractkit/documentation) lists equity stream entries for Arbitrum, Base, BNB Chain,
  Ethereum, Optimism, Polygon and Robinhood Chain, and lists 28 X Layer entries that are
  crypto / tokenized-treasury-NAV / proof-of-reserve with no equity entries.
- That file drives the documentation site's feed listings. It is NOT an authoritative
  provisioning registry, so its contents do not establish what is or is not entitled on a
  given network.

What we actually experienced:
- We could not reproduce usable equity-stream delivery plus on-chain verification for
  Bespeak from the public integration path within this build, and did not purchase a
  subscription (app.chain.link, card required, no free tier).

Why this is worth reporting upstream:
A builder following the OKX announcement and then looking up the equity feeds in the
Chainlink documentation will not find X Layer entries there, and may wrongly conclude the
streams are unavailable. Whether the gap is in the docs tracking data, in the published
feed catalog, or in our own integration attempt is exactly what we could not determine,
and that ambiguity is itself the useful finding for both parties.

Bespeak's position: Tier 1 is unused because we could not exercise it end to end, not
because we concluded it is unavailable. No Bespeak artifact claims the streams are absent.

## F-02 — Chainlink docs source has a duplicated testnet verifier address
In `StreamsNetworksData.ts`, the X Layer Testnet `verifierProxy`
(0x72790f9eB82db492a7DDb6d2af22A270Dcc3Db64) is byte-identical to the "Stable Testnet"
entry directly above it. Mainnet is unique and correct. Looks like a copy/paste artifact in
the docs source. Low severity, clean upstream issue candidate once the core build is healthy.

## F-03 — PRD's assumed Data Streams schema is stale
Schema v4 (which carries `marketStatus uint8`) is deprecated. The equity feeds use schema
**v11 "RWA Advanced"**, whose `marketStatus` is `uint32` with a 6-value mapping
(0 Unknown, 1 Pre, 2 Regular, 3 Post, 4 Overnight, 5 Closed) rather than v4's 3 values.
Any integration written from older documentation will decode the wrong struct.

## F-04 — xStocks API: real field names differ from commonly assumed ones
- Domain is `xstocks.fi`, not `xstocks.com`.
- Pending corporate action field is `newMultiplier`, not `pendingMultiplier`.
  Full shape: `{currentMultiplier, newMultiplier, activationDateTime, reason}`.
- `/api/v2/public/corporate-actions` returns 404. The working path is the per-asset
  `/api/v2/public/assets/{SYMBOL}/multiplier?network={NETWORK}`.
- `/api/v2/openapi.json` returns 404.
- The assets endpoint is paginated (`?page=N`, 100/page, `page.hasNextPage`); an integrator
  who reads only page 0 sees 100 of 1026 assets and will wrongly conclude that NVDA/TSLA/
  AAPL/SPY are not in the catalogue. They are — on pages 1+.

## F-05 — OKX DEX API has no unauthenticated tier, and the doc'd header set is incomplete
Every `/api/v6/dex/aggregator/*` path returns
`{"msg":"Request header OK-ACCESS-KEY can not be empty.","code":"50103"}` unauthenticated.
The public docs list four headers; the official `okx/okx-dex-sdk` sends five — the
undocumented-in-that-page `OK-ACCESS-PROJECT` is mandatory. Following the docs page alone
produces requests that fail.
Also: many older documentation URLs (`/build/dev-docs/...`, `/build/dev-docs-v5/...`) are
dead; the live tree is `/onchainos/dev-docs/...`.
