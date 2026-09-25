/// Bindings this worker is given in wrangler.jsonc.
///
/// OpenNext declares CloudflareEnv globally; this merges the receipt store into it so the
/// read and ingest paths are type-checked rather than reaching into an untyped env object.
declare global {
  interface CloudflareEnv {
    /// Receipts posted by the keeper after a fill. The keeper writes to its own disk, which
    /// this worker cannot see, so this is how a receipt reaches production.
    RECEIPTS?: KVNamespace;
  }
}

export {};
