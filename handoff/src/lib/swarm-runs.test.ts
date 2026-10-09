import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import {
  assignSwarmRun,
  backfillSwarmRuns,
  listProjectSwarmRuns,
  listUnassignedSwarmRuns,
  saveSwarmRun,
} from "./swarm-runs";

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

  it("saveSwarmRun updates when the execution row appears before insert", async () => {
    const sql = await database();
    let planted = false;
    const racing: Sql = {
      exec: (statement) => sql.exec(statement),
      all: (statement, params) => sql.all(statement, params),
      get: (statement, params) => sql.get(statement, params),
      async run(statement, params) {
        if (!planted && statement.includes("INSERT INTO swarm_runs")) {
          planted = true;
          await sql.run(
            `INSERT INTO swarm_runs (
              id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id,
              template_id, name, status, trigger, started_at, finished_at
            ) VALUES ('run-race', 'org-1', NULL, NULL, NULL, 'ex-race', NULL, 'Earlier', 'running', 'chat', ?, NULL)`,
            [NOW],
          );
        }
        await sql.run(statement, params);
      },
    };
    const saved = await saveSwarmRun(racing, {
      organizationId: "org-1",
      executionId: "ex-race",
      name: "Later",
      status: "completed",
      trigger: "chat",
      now: NOW + 10,
    });
    expect(saved.id).toBe("run-race");
    const rows = await sql.all<{ n: number; status: string; finished_at: number; started_at: number }>(
      "SELECT count(*) AS n, status, finished_at, started_at FROM swarm_runs",
    );
    expect(rows).toEqual([{ n: 1, status: "completed", finished_at: NOW + 10, started_at: NOW }]);
  });

  it("updates the existing execution when insert raises a unique error", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO swarm_runs (
        id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id,
        template_id, name, status, trigger, started_at, finished_at
      ) VALUES ('run-unique', 'org-1', NULL, NULL, NULL, 'ex-unique', NULL, 'Earlier', 'running', 'chat', ?, NULL)`,
      [NOW],
    );
    let missed = false;
    const racing: Sql = {
      exec: (statement) => sql.exec(statement),
      all: (statement, params) => sql.all(statement, params),
      async get(statement, params) {
        if (!missed && statement.includes("FROM swarm_runs WHERE execution_id")) {
          missed = true;
          return undefined;
        }
        return sql.get(statement, params);
      },
      async run(statement, params) {
        if (statement.includes("INSERT INTO swarm_runs")) {
          throw new Error("UNIQUE constraint failed: swarm_runs.execution_id");
        }
        await sql.run(statement, params);
      },
    };
    const saved = await saveSwarmRun(racing, {
      organizationId: "org-1",
      executionId: "ex-unique",
      name: "Later",
      status: "completed",
      trigger: "chat",
      now: NOW + 10,
    });
    expect(saved.id).toBe("run-unique");
    const row = await sql.get<{ status: string; finished_at: number; started_at: number }>(
      "SELECT status, finished_at, started_at FROM swarm_runs WHERE id = 'run-unique'",
    );
    expect(row).toEqual({ status: "completed", finished_at: NOW + 10, started_at: NOW });
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

describe("backfillSwarmRuns", () => {
  it("copies a timeline execution once", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-1', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Done', ?, ?)`,
      [JSON.stringify({ executionId: "ex-old", packName: "Schema readiness", status: "completed", trigger: "chat" }), NOW],
    );
    expect(await backfillSwarmRuns(sql, NOW + 1)).toBe(1);
    expect(await backfillSwarmRuns(sql, NOW + 2)).toBe(0);
    const row = await sql.get<{ execution_id: string; project_id: string; started_at: number }>(
      "SELECT execution_id, project_id, started_at FROM swarm_runs",
    );
    expect(row).toEqual({ execution_id: "ex-old", project_id: "proj-1", started_at: NOW });
  });

  it("copies a workflow last execution once when no activity matches", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO workflow_groups (id, organization_id, name, created_at)
       VALUES ('grp-1', 'org-1', 'Ops', ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO client_workflows (
        id, group_id, organization_id, name, template_id, last_execution_id, last_status, created_at, updated_at
      ) VALUES ('wf-1', 'grp-1', 'org-1', 'Weekly scan', 'pack-schema', 'ex-wf', 'running', ?, ?)`,
      [NOW, NOW],
    );
    expect(await backfillSwarmRuns(sql, NOW + 1)).toBe(1);
    expect(await backfillSwarmRuns(sql, NOW + 2)).toBe(0);
    const row = await sql.get<{ execution_id: string }>("SELECT execution_id FROM swarm_runs");
    expect(row).toEqual({ execution_id: "ex-wf" });
  });

  it("applies the later activity status for one execution", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-run', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Start', ?, ?)`,
      [JSON.stringify({ executionId: "ex-two", packName: "Schema readiness", status: "running", trigger: "chat" }), NOW],
    );
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-done', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Done', ?, ?)`,
      [
        JSON.stringify({ executionId: "ex-two", packName: "Schema readiness", status: "completed", trigger: "chat" }),
        NOW + 10,
      ],
    );
    expect(await backfillSwarmRuns(sql, NOW + 11)).toBe(1);
    const row = await sql.get<{ status: string; finished_at: number }>(
      "SELECT status, finished_at FROM swarm_runs WHERE execution_id = 'ex-two'",
    );
    expect(row).toEqual({ status: "completed", finished_at: NOW + 10 });
    expect(await backfillSwarmRuns(sql, NOW + 12)).toBe(0);
    const again = await sql.get<{ status: string; finished_at: number }>(
      "SELECT status, finished_at FROM swarm_runs WHERE execution_id = 'ex-two'",
    );
    expect(again).toEqual({ status: "completed", finished_at: NOW + 10 });
  });

  it("uses timeline time when the later line was stored first", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-done', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Done', ?, ?)`,
      [
        JSON.stringify({ executionId: "ex-order", packName: "Schema readiness", status: "completed", trigger: "chat" }),
        NOW + 10,
      ],
    );
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-run', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Start', ?, ?)`,
      [JSON.stringify({ executionId: "ex-order", packName: "Schema readiness", status: "running", trigger: "chat" }), NOW],
    );
    expect(await backfillSwarmRuns(sql, NOW + 11)).toBe(1);
    const row = await sql.get<{ status: string; finished_at: number }>(
      "SELECT status, finished_at FROM swarm_runs WHERE execution_id = 'ex-order'",
    );
    expect(row).toEqual({ status: "completed", finished_at: NOW + 10 });
  });

  it("does not let a workflow last status overwrite a later activity", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO activities (
        id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at
      ) VALUES ('act-done', 'org-1', 'agent.swarm_run', 'agent', 'swarm', 'Done', ?, ?)`,
      [JSON.stringify({ executionId: "ex-shared", packName: "Schema readiness", status: "completed", trigger: "chat" }), NOW],
    );
    await sql.run(
      `INSERT INTO workflow_groups (id, organization_id, name, created_at) VALUES ('grp-2', 'org-1', 'Ops', ?)`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO client_workflows (
        id, group_id, organization_id, name, template_id, last_execution_id, last_status, created_at, updated_at
      ) VALUES ('wf-2', 'grp-2', 'org-1', 'Weekly scan', 'pack-schema', 'ex-shared', 'running', ?, ?)`,
      [NOW, NOW + 50],
    );
    expect(await backfillSwarmRuns(sql, NOW + 51)).toBe(1);
    const row = await sql.get<{ status: string; finished_at: number }>(
      "SELECT status, finished_at FROM swarm_runs WHERE execution_id = 'ex-shared'",
    );
    expect(row).toEqual({ status: "completed", finished_at: NOW });
  });
});
