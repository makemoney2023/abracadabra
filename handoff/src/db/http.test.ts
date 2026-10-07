import { afterEach, describe, expect, it } from "vitest";
import { d1Sql } from "./sql";
import { httpD1 } from "./http";
import { openHandoffDb } from "./open";

const calls: { url: string; body: unknown }[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function fetchImpl(origin: string): typeof fetch {
  return (async (input, init) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url === `${origin}/query` && body.op === "first") {
      return jsonResponse({ result: { id: "file-1" } });
    }
    if (url === `${origin}/query` && body.op === "all") {
      return jsonResponse({ results: [{ id: "file-1" }] });
    }
    if (url === `${origin}/query` && (body.op === "run" || body.op === "exec")) {
      return jsonResponse({ ok: true });
    }
    if (url === `${origin}/batch`) {
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: "no" }, 500);
  }) as typeof fetch;
}

afterEach(() => {
  calls.length = 0;
  delete process.env.HANDOFF_D1_ORIGIN;
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("httpD1", () => {
  it("sends a returning update as one query and reads the row", async () => {
    const sql = d1Sql(httpD1("http://handoff.d1", fetchImpl("http://handoff.d1")));
    const row = await sql.get<{ id: string }>("UPDATE files SET status = 'scanning' RETURNING id", [10]);
    expect(row).toEqual({ id: "file-1" });
    expect(calls).toEqual([
      {
        url: "http://handoff.d1/query",
        body: {
          op: "first",
          sql: "UPDATE files SET status = 'scanning' RETURNING id",
          params: [10],
        },
      },
    ]);
  });

  it("batches a transaction and throws when the database refuses the call", async () => {
    const sql = d1Sql(httpD1("http://handoff.d1", fetchImpl("http://handoff.d1")));
    await sql.exec("BEGIN");
    await sql.run("UPDATE files SET status = 'clean' WHERE id = ?", ["file-1"]);
    await sql.exec("COMMIT");
    expect(calls[0]?.url).toBe("http://handoff.d1/batch");
    expect(calls[0]?.body).toEqual({
      statements: [{ sql: "UPDATE files SET status = 'clean' WHERE id = ?", params: ["file-1"] }],
    });

    const failing = d1Sql(
      httpD1("http://handoff.d1", (async () => jsonResponse({ error: "busy" }, 503)) as typeof fetch),
    );
    await expect(failing.all("SELECT id FROM files")).rejects.toThrow(/busy/);
  });
});

describe("openHandoffDb remote origin", () => {
  it("uses the remote database when an origin is set and no Worker binding exists", async () => {
    process.env.HANDOFF_D1_ORIGIN = "http://handoff.d1";
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    const globalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl("http://handoff.d1");
    try {
      const sql = await openHandoffDb();
      await expect(sql.all("SELECT id FROM files")).resolves.toEqual([{ id: "file-1" }]);
      expect(calls[0]?.url).toBe("http://handoff.d1/query");
    } finally {
      globalThis.fetch = globalFetch;
    }
  });
});
