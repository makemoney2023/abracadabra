export type BoundStatement = {
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

/** The slice of D1 the check uses. Tests can stand in a sqlite wrapper. */
export type BoundSql = {
  prepare(query: string): {
    bind(...values: unknown[]): BoundStatement;
  };
  /** D1 runs a batch as one transaction: every statement applies, or none do. */
  batch?(statements: BoundStatement[]): Promise<unknown[]>;
};

/** Rows changed by a D1 run() (D1 reports `meta.changes`). */
export function changedRows(result: unknown): number {
  const meta = (result as { meta?: { changes?: unknown } } | null)?.meta;
  return typeof meta?.changes === "number" ? meta.changes : 0;
}

export type QueueMessage = { body: unknown; delaySeconds?: number };

export type JobQueue = {
  send(body: unknown, options?: { delaySeconds?: number }): Promise<unknown>;
  sendBatch?(messages: QueueMessage[]): Promise<unknown>;
};

export type CheckBindings = {
  DB?: BoundSql;
  SCAN_JOBS?: JobQueue;
  LEAD_INTAKE?: JobQueue;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  /** "1" lets the internal trigger start 200 and 1000 page deep scans. Off by default. */
  DEEP_SCAN_ENABLED?: string;
  /** Optional tier page limits, e.g. "free=40,deep-200=200,deep-1000=1000". */
  SCAN_TIER_LIMITS?: string;
  WORKER_SELF_REFERENCE?: { fetch(input: string, init?: RequestInit): Promise<Response> };
};
