import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "./migrate";
import { openHandoffDb } from "./open";
import { healthReport, signedOutCaller } from "./records";
import type { D1Like } from "./sql";

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
  delete process.env.HANDOFF_SQLITE_PATH;
});

describe("openHandoffDb", () => {
  it("reads the Worker D1 binding before opening a local file", async () => {
    const seen: string[] = [];
    const db: D1Like = {
      prepare(statement) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                seen.push(statement);
                return { results: params.length === 0 ? [] : [] };
              },
              async first() {
                seen.push(statement);
                return null;
              },
              async run() {
                seen.push(statement);
              },
            };
          },
        };
      },
      async exec(statement) {
        seen.push(statement);
      },
    };
    (globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT] = { env: { DB: db } };
    const sql = await openHandoffDb();
    await sql.get("SELECT 1");
    expect(seen).toEqual(["SELECT 1"]);
  });

  it("migrates a local sqlite database for a signed-out health check", async () => {
    process.env.HANDOFF_SQLITE_PATH = ":memory:";
    const sql = await openHandoffDb();
    await migrate(sql);
    await expect(healthReport(sql, signedOutCaller)).resolves.toEqual({
      database: "d1",
      ok: true,
      visible: 0,
    });
    await migrate(sql);
    const tables = await sql.all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'workspaces'",
    );
    expect(tables).toEqual([{ name: "workspaces" }]);
  });
});
