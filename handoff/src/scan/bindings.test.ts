import { describe, expect, it } from "vitest";
import type { D1Bound, D1Like } from "@/db/sql";
import type { FilesBucket } from "@/lib/store/objects";
import { handleDatabaseRequest, handleObjectRequest } from "./bindings";

const KEY = "11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333";

function database(): D1Like & { batches: unknown[][] } {
  const batches: unknown[][] = [];
  return {
    batches,
    prepare(statement) {
      return {
        bind(...params: unknown[]): D1Bound {
          return {
            statement,
            params,
            async all<T>() {
              return { results: [{ id: params[0] } as T] };
            },
            async first<T>() {
              return { id: "claimed" } as T;
            },
            async run() {
              return { ok: true };
            },
          };
        },
      };
    },
    async exec() {
      return { ok: true };
    },
    async batch(statements) {
      batches.push(statements.map((entry) => entry.params));
      return [];
    },
  };
}

function bucket(): FilesBucket & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    deleted,
    async head(key) {
      return key === KEY ? { size: 4 } : null;
    },
    async get(key) {
      if (key !== KEY) return null;
      return { arrayBuffer: async () => new Uint8Array([9, 8, 7, 6]).buffer };
    },
    async put() {},
    async delete(keys) {
      deleted.push(...(Array.isArray(keys) ? keys : [keys]));
    },
    async list() {
      return { objects: [], truncated: false };
    },
    createMultipartUpload() {
      throw new Error("unused");
    },
    resumeMultipartUpload() {
      throw new Error("unused");
    },
  };
}

describe("scan container bindings", () => {
  it("runs a query on D1 and returns the first row", async () => {
    const response = await handleDatabaseRequest(
      new Request("http://handoff.d1/query", {
        method: "POST",
        body: JSON.stringify({
          op: "first",
          sql: "UPDATE files SET status = 'scanning' RETURNING id",
          params: [1],
        }),
      }),
      database(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: { id: "claimed" } });
  });

  it("runs a transaction batch and refuses a query that is not JSON", async () => {
    const db = database();
    const response = await handleDatabaseRequest(
      new Request("http://handoff.d1/batch", {
        method: "POST",
        body: JSON.stringify({
          statements: [{ sql: "UPDATE files SET status = 'clean' WHERE id = ?", params: ["a"] }],
        }),
      }),
      db,
    );
    expect(response.status).toBe(200);
    expect(db.batches).toEqual([[["a"]]]);
    const refused = await handleDatabaseRequest(
      new Request("http://handoff.d1/query", { method: "POST", body: "{" }),
      db,
    );
    expect(refused.status).toBe(400);
  });

  it("streams an object and deletes it, and refuses a key that is not three ids", async () => {
    const files = bucket();
    const read = await handleObjectRequest(new Request(`http://handoff.r2/${KEY}`), files);
    expect(read.status).toBe(200);
    expect(new Uint8Array(await read.arrayBuffer())).toEqual(new Uint8Array([9, 8, 7, 6]));
    const head = await handleObjectRequest(new Request(`http://handoff.r2/${KEY}`, { method: "HEAD" }), files);
    expect(head.headers.get("content-length")).toBe("4");
    const removed = await handleObjectRequest(new Request(`http://handoff.r2/${KEY}`, { method: "DELETE" }), files);
    expect(removed.status).toBe(204);
    expect(files.deleted).toEqual([KEY]);
    const blocked = await handleObjectRequest(new Request("http://handoff.r2/../secret"), files);
    expect(blocked.status).toBe(404);
  });
});
