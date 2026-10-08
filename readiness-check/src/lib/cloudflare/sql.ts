/** The slice of D1 the check uses. Tests can stand in a sqlite wrapper. */
export type BoundSql = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>;
      first<T = Record<string, unknown>>(): Promise<T | null>;
      all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
  };
};

export type JobQueue = {
  send(body: unknown): Promise<unknown>;
};

export type CheckBindings = {
  DB?: BoundSql;
  SCAN_JOBS?: JobQueue;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  WORKER_SELF_REFERENCE?: { fetch(input: string, init?: RequestInit): Promise<Response> };
};
