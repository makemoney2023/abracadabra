import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { runAgentWork } from "@/db/agent-work";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { LIMITS } from "@/lib/policy/limits";

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
    `INSERT INTO workspaces (
      id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
      quota_bytes, retention_days, request_digest, status, opened_at, archived_at, purge_after, purged_at, organization_id
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
      ?, ?, 0, 'active', ?, NULL, NULL, NULL, 'org-1'
    )`,
    [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
  );
});

async function deliverable(): Promise<string> {
  const created = (await runAgentWork(
    sql,
    { keyId: "key-1", organizationId: "org-1" },
    "create_deliverable",
    { requestId: "make", title: "Audit", kind: "document" },
    NOW,
  )) as { deliverableId: string };
  return created.deliverableId;
}

describe("swarm pack on a task", () => {
  it("keeps the pack id when a skill step is updated", async () => {
    await sql.run(
      `INSERT INTO tasks (
         id, organization_id, title, status, stage, skills_json, created_at, updated_at
       ) VALUES (
         'task-pack', 'org-1', 'Calendar', 'todo', 'describe', ?, ?, ?
       )`,
      [
        JSON.stringify({
          templateId: "pack-community-marketingskills",
          steps: [{ path: ".cursor/skills/community/marketingskills/ad-creative/SKILL.md", mode: "complete", status: "todo" }],
          current: 0,
        }),
        NOW,
        NOW,
      ],
    );
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "update_task",
      {
        requestId: "step",
        taskId: "task-pack",
        status: "doing",
        skills: [{ path: ".cursor/skills/community/marketingskills/ad-creative/SKILL.md", mode: "complete", status: "done" }],
      },
      NOW,
    );
    const row = await sql.get<{ skills_json: string }>("SELECT skills_json FROM tasks WHERE id = 'task-pack'");
    expect(JSON.parse(row?.skills_json ?? "{}")).toMatchObject({
      templateId: "pack-community-marketingskills",
      current: 1,
    });
  });

  it("marks the swarm run finished when the follow-up records it", async () => {
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "record_swarm_run",
      { requestId: "run-1", packName: "Marketing", status: "running", executionId: "exec-1", trigger: "due" },
      NOW,
    );
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "record_swarm_run",
      { requestId: "run-2", packName: "Marketing", status: "completed", executionId: "exec-1", trigger: "due" },
      NOW + 1,
    );
    const row = await sql.get<{ status: string; finished_at: number | null }>(
      "SELECT status, finished_at FROM swarm_runs WHERE execution_id = 'exec-1'",
    );
    expect(row).toEqual({ status: "completed", finished_at: NOW + 1 });
  });
});

describe("agent deliverable items", () => {
  it("stores a pdf path as a file the preview can open", async () => {
    const deliverableId = await deliverable();
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "add_deliverable_item",
      { requestId: "item-pdf", deliverableId, path: "audit.pdf", objectKey: "space/batch/file" },
      NOW,
    );
    const row = await sql.get<{ format: string; media_json: string }>(
      "SELECT format, media_json FROM deliverable_items",
    );
    expect(row?.format).toBe("file");
    expect(JSON.parse(row?.media_json ?? "[]")).toEqual([
      { r2_key: "space/batch/file", role: "main", content_type: "application/pdf", size: 0 },
    ]);
  });

  it("stores a png path as a static image and markdown as a page", async () => {
    const deliverableId = await deliverable();
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "add_deliverable_item",
      { requestId: "item-png", deliverableId, path: "hero.png", objectKey: "space/batch/png" },
      NOW,
    );
    await runAgentWork(
      sql,
      { keyId: "key-1", organizationId: "org-1" },
      "add_deliverable_item",
      { requestId: "item-md", deliverableId, path: "copy.md", bodyMarkdown: "The headline." },
      NOW,
    );
    const rows = await sql.all<{ format: string; title: string }>(
      "SELECT format, title FROM deliverable_items ORDER BY sort",
    );
    expect(rows).toEqual([
      { format: "static", title: "hero.png" },
      { format: "page", title: "copy.md" },
    ]);
  });
});
