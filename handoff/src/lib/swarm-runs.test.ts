import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { assignSwarmRun, listProjectSwarmRuns, listUnassignedSwarmRuns, saveSwarmRun } from "./swarm-runs";

const NOW = 1_700_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const outsider: Caller = { userId: "client-1", staff: null, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
     VALUES ('proj-1', 'org-1', 'Site', 'active', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("saveSwarmRun", () => {
  it("stores a run on the only open project and updates that same execution", async () => {
    const sql = await database();
    const first = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-1",
      name: "Schema readiness",
      status: "running",
      trigger: "lead_created",
      now: NOW,
    });
    expect(first.projectId).toBe("proj-1");
    await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-1",
      name: "Schema readiness",
      status: "completed",
      trigger: "lead_created",
      now: NOW + 5,
    });
    const rows = await sql.all<{ n: number; status: string; finished_at: number }>(
      "SELECT count(*) AS n, status, finished_at FROM swarm_runs",
    );
    expect(rows).toEqual([{ n: 1, status: "completed", finished_at: NOW + 5 }]);
  });

  it("leaves the project empty when the client has two open projects and none was named", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-2', 'org-1', 'Ads', 'planned', ?, ?)`,
      [NOW, NOW],
    );
    const saved = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "ex-2",
      name: "Pack",
      status: "running",
      trigger: "scan_ready",
      now: NOW,
    });
    expect(saved.projectId).toBeNull();
    expect(await listUnassignedSwarmRuns(sql, staff, "org-1")).toHaveLength(1);
    expect(await listUnassignedSwarmRuns(sql, outsider, "org-1")).toEqual([]);
  });

  it("refuses to attach a run to another client's project", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-9', 'org-2', 'Theirs', 'active', ?, ?)`,
      [NOW, NOW],
    );
    const saved = await saveSwarmRun(sql, {
      organizationId: "org-1",
      executionId: "",
      name: "Pack",
      status: "not_started",
      trigger: "chat",
      now: NOW,
    });
    expect(await assignSwarmRun(sql, staff, { runId: saved.id, projectId: "proj-9" }, NOW)).toEqual({
      ok: false,
      error: "missing",
    });
    expect(await assignSwarmRun(sql, staff, { runId: saved.id, projectId: "proj-1" }, NOW)).toEqual({ ok: true });
    expect(await listProjectSwarmRuns(sql, staff, "proj-1")).toHaveLength(1);
  });
});
