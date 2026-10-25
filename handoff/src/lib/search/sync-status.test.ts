import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { recentSyncRuns } from "./sync-status";

const NOW = 1_800_000_000_000;

describe("recentSyncRuns", () => {
  it("counts the last 24 hours of jobs per property, for one organization only", async () => {
    const sql = sqliteSql(new DatabaseSync(":memory:"));
    await migrate(sql);
    for (const org of ["org-a", "org-b"]) {
      await sql.run("INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES (?, ?, 'client', ?, ?)", [org, org, NOW, NOW]);
      await sql.run(
        "INSERT INTO search_properties (id, organization_id, site_url, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)",
        [`prop-${org}`, org, `sc-domain:${org}.com`, NOW, NOW],
      );
    }
    const run = (id: string, property: string, status: string, at: number) =>
      sql.run("INSERT INTO search_sync_runs (id, property_id, kind, status, created_at) VALUES (?, ?, 'daily', ?, ?)", [id, property, status, at]);
    await run("r1", "prop-org-a", "done", NOW - 1000);
    await run("r2", "prop-org-a", "failed", NOW - 1000);
    await run("r3", "prop-org-a", "queued", NOW - 1000);
    await run("r4", "prop-org-a", "done", NOW - 2 * 86_400_000);
    await run("r5", "prop-org-b", "done", NOW - 1000);
    expect(await recentSyncRuns(sql, "org-a", NOW)).toEqual({ "prop-org-a": { total: 3, queued: 1, running: 0, done: 1, failed: 1 } });
  });
});
