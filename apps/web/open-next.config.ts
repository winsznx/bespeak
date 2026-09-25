import {defineCloudflareConfig} from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import {withRegionalCache} from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";

/// OpenNext configuration for the Cloudflare Workers target.
///
/// This file previously declared no incremental cache, on the reasoning that Bespeak's
/// pages are either short-revalidate market data or wallet-scoped and dynamic, so an ISR
/// layer would add infrastructure without changing what a user sees. Measurement disproved
/// that. Without a cache that outlives an isolate, every cold request re-rendered from
/// scratch and re-fetched the eleven-page issuer catalogue: the dashboard sat on its
/// loading skeletons for ten seconds and the landing page took six to send a byte. Isolates
/// are recycled constantly, so "cold" is not a rare case.
///
/// KV is the store because these entries are small, read far more than written, and must be
/// visible to every isolate in every region. The regional wrapper keeps a copy nearer the
/// request so a repeat read does not cross the network at all; stale-while-revalidate means
/// a page that has just expired is served immediately and refreshed behind the reader
/// rather than making them wait for it.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(kvIncrementalCache, {
    mode: "long-lived",
    shouldLazilyUpdateOnCacheHit: true,
  }),
});
