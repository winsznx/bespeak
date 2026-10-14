/// Bindings this worker is given in wrangler.jsonc.
///
/// OpenNext declares CloudflareEnv globally, but not the binding types themselves, and
/// `@cloudflare/workers-types` is deliberately not installed here: its global `Request` and
/// `Response` collide with the DOM lib this app is compiled against. `skipLibCheck` hid the
/// gap, so `RECEIPTS` was typed against a name that never resolved.
///
/// Declared below is the exact surface the app calls and nothing more. If a call needs a
/// method that is not here, it belongs here first, which keeps what we depend on visible
/// rather than inherited wholesale.
declare global {
  interface KVNamespace {
    get(key: string): Promise<string | null>;
    put(key: string, value: string): Promise<void>;
  }

  interface D1Result<T> {
    results: T[];
    success: boolean;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<D1Result<never>>;
  }

  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    batch<T = Record<string, unknown>>(
      statements: D1PreparedStatement[],
    ): Promise<D1Result<T>[]>;
  }

  interface CloudflareEnv {
    /// Receipts posted by the keeper after a fill. The keeper writes to its own disk, which
    /// this worker cannot see, so this is how a receipt reaches production.
    RECEIPTS?: KVNamespace;
    /// The open spread dataset. Read-only from this worker: the keeper is the only writer,
    /// so no page can alter a published measurement.
    DATA?: D1Database;
  }
}

export {};
