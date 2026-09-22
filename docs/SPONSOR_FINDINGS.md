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

## F-06 — The executable pair for an xStock on X Layer is not guessable from the metadata
Discovered in this build by tracing real transfer counterparties, then scanning a
Uniswap-V3-compatible factory at 0x4B2ab38DBF28D31D467aA8993f6c2585981D6804 across 192
(quote, token, fee) combinations for the 12 launch assets.

Two facts that no documentation we found states, and that an integrator would otherwise
learn by shipping a broken pair:

1. **All liquidity is against the ERC-4626 wrapper, never the underlying rebasing token.**
   Every underlying pool discovered holds exactly zero. An integration that routes to the
   base xStock address — the one the issuer API lists first as `deployments[].address` —
   finds no liquidity at all.

2. **The quote stablecoin differs per asset, and the issuer metadata does not say which.**
   The xStocks API lists both USDC and USDG for every X Layer deployment, which reads as
   "either works". On chain:
     USDG: SPYx $1,091,099 · NVDAx $406,692 · AAPLx $279,899 · METAx $198,033
           AMDx $174,591 · MSFTx $162,832 · MSTRx $118,977 · AMZNx $38,116
     USDC: QQQx $522,505 · GOOGLx $374,961 · TSLAx $288,494 · COINx $106,021
   NVDAx has no USDC pool with liquidity at any fee tier; TSLAx has no meaningful USDG one.
   All liquidity sits at the 0.05% fee tier.

Impact: a builder following the issuer metadata alone has a roughly even chance of
offering an unexecutable pair for any given asset, and will route to the wrong token
entirely unless they know to prefer the wrapper. Worth surfacing in the xStocks developer
docs, or as a per-deployment "executable pair" field in the API.

Bespeak's response: the registry sync now discovers the pair on chain per asset and the UI
defaults to it, warning if a user selects the other stablecoin. Discovery never bypasses
the trust boundary — execution still goes through the adapter, the router allowlist and the
balance-delta postconditions.
