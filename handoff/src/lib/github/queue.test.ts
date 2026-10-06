import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { handleGithubBatch, type GithubQueueMessage } from "./queue";

const NOW = 1_700_000_000_000;

function message(body: unknown): GithubQueueMessage & { acked: boolean; retried: boolean } {
  const row: GithubQueueMessage & { acked: boolean; retried: boolean } = {
    body,
    acked: false,
    retried: false,
    ack() {
      row.acked = true;
    },
    retry() {
      row.retried = true;
    },
  };
  return row;
}

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  return sql;
}

describe("handleGithubBatch", () => {
  it("drops a bad payload", async () => {
    const sql = await database();
    const bad = message({ source: "nope" });
    await handleGithubBatch([bad], sql, NOW);
    expect(bad.acked).toBe(true);
    expect(bad.retried).toBe(false);
    expect(await sql.all("SELECT external_id FROM intake_receipts")).toEqual([]);
  });

  it("acks an unknown event and keeps the delivery id", async () => {
    const sql = await database();
    const ping = message({ source: "github", deliveryId: "del-ping", event: "ping", payload: { zen: "ok" } });
    await handleGithubBatch([ping], sql, NOW);
    expect(ping.acked).toBe(true);
    expect(ping.retried).toBe(false);
    const receipts = await sql.all<{ source: string; external_id: string }>(
      "SELECT source, external_id FROM intake_receipts",
    );
    expect(receipts).toEqual([{ source: "github", external_id: "del-ping" }]);
    expect(await sql.all("SELECT id FROM activities")).toEqual([]);
  });

  it("retries when the database will not open a transaction", async () => {
    const sql = await database();
    const wrapped: Sql = {
      ...sql,
      async exec(statement) {
        if (statement === "BEGIN") throw new Error("db down");
        return sql.exec(statement);
      },
    };
    const row = message({ source: "github", deliveryId: "del-retry", event: "ping", payload: {} });
    await handleGithubBatch([row], wrapped, NOW);
    expect(row.acked).toBe(false);
    expect(row.retried).toBe(true);
    expect(await sql.all("SELECT external_id FROM intake_receipts")).toEqual([]);
  });
});
