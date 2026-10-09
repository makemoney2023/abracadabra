import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { assignOpenTaskPacks } from "./task-packs";

const NOW = 1_700_000_000_000;

const packs = [
  { id: "pack-community-marketingskills", name: "Marketing", description: "Social media ads and content calendars." },
  { id: "pack-schema-readiness", name: "Schema readiness", description: "Schema scan." },
];

const template = {
  nodes: [
    {
      id: "n1",
      instructions: "Follow .cursor/skills/community/marketingskills/ad-creative/SKILL.md",
    },
  ],
  edges: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Abra', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
     VALUES ('proj-1', 'org-1', 'Ads', 'planned', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, stage, created_at, updated_at)
     VALUES ('task-1', 'proj-1', 'org-1', 'Create content calendar', 'todo', 'describe', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO activities (id, organization_id, project_id, kind, actor_kind, body, data_json, created_at)
     VALUES ('brief-1', 'org-1', 'proj-1', 'agent.task_brief', 'agent', 'Include static and video posts.', ?, ?)`,
    [JSON.stringify({ taskId: "task-1" }), NOW],
  );
  return sql;
}

describe("assignOpenTaskPacks", () => {
  it("stores the pack skill steps and does not replace them on a later save", async () => {
    const sql = await database();
    const first = await assignOpenTaskPacks({
      sql,
      projectId: "proj-1",
      now: NOW,
      packs,
      ask: async () => "pack-nope",
      template: async () => template,
    });
    expect(first).toEqual(["Create content calendar"]);
    const row = await sql.get<{ skills_json: string }>("SELECT skills_json FROM tasks WHERE id = 'task-1'");
    const skills = JSON.parse(row?.skills_json ?? "{}") as { templateId?: string; steps?: { path: string }[] };
    expect(skills.templateId).toBe("pack-community-marketingskills");
    expect(skills.steps?.[0]?.path).toContain("marketingskills/ad-creative/SKILL.md");
    const second = await assignOpenTaskPacks({
      sql,
      projectId: "proj-1",
      now: NOW + 1,
      packs,
      ask: async () => "pack-schema-readiness",
      template: async () => {
        throw new Error("should not load");
      },
    });
    expect(second).toEqual([]);
    const kept = await sql.get<{ skills_json: string }>("SELECT skills_json FROM tasks WHERE id = 'task-1'");
    expect(kept?.skills_json).toBe(row?.skills_json);
  });

  it("stores nothing when no pack overlaps", async () => {
    const sql = await database();
    await sql.run("UPDATE tasks SET title = 'Hello' WHERE id = 'task-1'");
    await sql.run("UPDATE activities SET body = 'Nothing to do.' WHERE id = 'brief-1'");
    const matched = await assignOpenTaskPacks({
      sql,
      projectId: "proj-1",
      now: NOW,
      packs,
      ask: async () => "none",
      template: async () => template,
    });
    expect(matched).toEqual([]);
    const row = await sql.get<{ skills_json: string | null }>("SELECT skills_json FROM tasks WHERE id = 'task-1'");
    expect(row?.skills_json).toBeNull();
  });
});
