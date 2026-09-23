import {defineCloudflareConfig} from "@opennextjs/cloudflare";

/// OpenNext configuration for the Cloudflare Workers target.
///
/// Deliberately minimal: no incremental cache, no tag cache, no queue. Bespeak's pages are
/// either short-revalidate market data or wallet-scoped and dynamic, so an ISR cache layer
/// would add infrastructure without changing what a user sees. This can be revisited if a
/// genuinely cacheable surface appears.
export default defineCloudflareConfig();
