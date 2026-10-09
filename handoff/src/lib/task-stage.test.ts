import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { moveTaskStage } from "./task-stage";

const NOW = 1_700_000_000_000;

let sql: Sql;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Northwind', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (
      id, organization_id, name, status, created_at, updated_at
    ) VALUES ('proj-1', 'org-1', 'Launch', 'active', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO tasks (
      id, project_id, organization_id, title, status, stage, position, created_at, updated_at
    ) VALUES ('task-a', 'proj-1', 'org-1', 'First', 'todo', 'describe', 0, ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO tasks (
      id, project_id, organization_id, title, status, stage, position, created_at, updated_at
    ) VALUES ('task-b', 'proj-1', 'org-1', 'Second', 'todo', 'describe', 1, ?, ?)`,
    [NOW + 1, NOW],
  );
});

const actor = { kind: "staff" as const, id: "staff-1" };

describe("moveTaskStage", () => {
  it("does not change stage when build has no brief", async () => {
    const moved = await moveTaskStage(sql, { taskId: "task-a", to: "build", now: NOW, actor });
    expect(moved).toEqual({ ok: false, error: "brief_not_approved" });
    const row = await sql.get<{ stage: string; status: string }>("SELECT stage, status FROM tasks WHERE id = 'task-a'");
    expect(row).toEqual({ stage: "describe", status: "blocked" });
  });

  it("marks a card done and leaves its stage", async () => {
    const moved = await moveTaskStage(sql, { taskId: "task-a", to: "done", now: NOW, actor });
    expect(moved).toMatchObject({ ok: true, column: "done", stage: "describe", status: "done" });
    const row = await sql.get<{ stage: string; status: string; done_at: number }>(
      "SELECT stage, status, done_at FROM tasks WHERE id = 'task-a'",
    );
    expect(row).toEqual({ stage: "describe", status: "done", done_at: NOW });
  });

  it("rewrites position only inside the column", async () => {
    await sql.run(
      `INSERT INTO tasks (
        id, project_id, organization_id, title, status, stage, position, created_at, updated_at
      ) VALUES ('task-e', 'proj-1', 'org-1', 'Engineer', 'todo', 'engineer', 0, ?, ?)`,
      [NOW, NOW],
    );
    const moved = await moveTaskStage(sql, { taskId: "task-b", direction: "up", now: NOW, actor });
    expect(moved).toMatchObject({ ok: true, column: "describe" });
    const describe = await sql.all<{ id: string; position: number }>(
      "SELECT id, position FROM tasks WHERE stage = 'describe' ORDER BY position",
    );
    expect(describe).toEqual([
      { id: "task-b", position: 0 },
      { id: "task-a", position: 1 },
    ]);
    const engineer = await sql.get<{ position: number }>("SELECT position FROM tasks WHERE id = 'task-e'");
    expect(engineer).toEqual({ position: 0 });
  });

  it("schedules a pack when the card moves to run", async () => {
    const skills = JSON.stringify({
      steps: [{ path: ".cursor/skills/community/marketingskills/ad-creative/SKILL.md", mode: "complete", status: "todo" }],
    });
    await sql.run("UPDATE tasks SET skills_json = ? WHERE id = 'task-a'", [skills]);
    const wakes: string[] = [];
    const moved = await moveTaskStage(sql, {
      taskId: "task-a",
      to: "run",
      now: NOW,
      actor,
      wake: async (organizationId, reason) => {
        wakes.push(`${organizationId}:${reason}`);
      },
    });
    expect(moved).toMatchObject({ ok: true, column: "run", workflowId: expect.any(String) });
    const workflow = await sql.get<{ task_id: string; next_run_at: number }>(
      "SELECT task_id, next_run_at FROM client_workflows WHERE task_id = 'task-a'",
    );
    expect(workflow).toEqual({ task_id: "task-a", next_run_at: NOW });
    expect(wakes).toEqual(["org-1:due"]);
  });
});
