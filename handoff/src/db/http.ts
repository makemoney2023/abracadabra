import type { D1Bound, D1Like } from "./sql";

type QueryOp = "all" | "first" | "run" | "exec";

type Reply = {
  error?: string;
  results?: unknown[];
  result?: unknown;
};

function endpoint(origin: string): string {
  return origin.replace(/\/$/, "");
}

async function post(origin: string, path: string, body: unknown, fetchImpl: typeof fetch): Promise<Reply> {
  const response = await fetchImpl(`${endpoint(origin)}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: Reply = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Reply;
    } catch {
      parsed = { error: text };
    }
  }
  if (!response.ok) {
    throw new Error(parsed.error || `database request failed (${response.status})`);
  }
  return parsed;
}

/** D1 over the scan container's outbound handler. The container never holds the database binding. */
export function httpD1(origin: string, fetchImpl: typeof fetch = fetch): D1Like {
  return {
    prepare(statement: string) {
      return {
        bind(...params: unknown[]): D1Bound {
          return {
            statement,
            params,
            async all<T>() {
              const reply = await post(origin, "/query", { op: "all" satisfies QueryOp, sql: statement, params }, fetchImpl);
              return { results: (reply.results ?? []) as T[] };
            },
            async first<T>() {
              const reply = await post(origin, "/query", { op: "first" satisfies QueryOp, sql: statement, params }, fetchImpl);
              return (reply.result ?? null) as T | null;
            },
            async run() {
              await post(origin, "/query", { op: "run" satisfies QueryOp, sql: statement, params }, fetchImpl);
            },
          };
        },
      };
    },
    async exec(statement: string) {
      await post(origin, "/query", { op: "exec" satisfies QueryOp, sql: statement, params: [] }, fetchImpl);
    },
    async batch(statements: D1Bound[]) {
      await post(
        origin,
        "/batch",
        {
          statements: statements.map((entry) => ({
            sql: entry.statement ?? "",
            params: [...(entry.params ?? [])],
          })),
        },
        fetchImpl,
      );
    },
  };
}
