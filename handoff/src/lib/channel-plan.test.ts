import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { getBrief } from "@/lib/agent-context";
import { actionFromLine, applyChannelPlan, dueMillis, mergeBrief, normalizeChannelPlan } from "./channel-plan";

const NOW = 1_700_000_000_000;

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at)
     VALUES ('org-1', 'Northwind', 'lead', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

describe("normalizeChannelPlan", () => {
  it("keeps task titles and a brief sentence, and drops blanks", () => {
    expect(
      normalizeChannelPlan({
        actions: [{ title: "  Write the pricing page  " }, { title: "" }, { title: "Book the kickoff" }, "nope"],
        brief: "  Add a pricing page.  ",
      }),
    ).toEqual({
      actions: [
        { title: "Write the pricing page", assignee: null, due: null, skill: null },
        { title: "Book the kickoff", assignee: null, due: null, skill: null },
      ],
      brief: "Add a pricing page.",
      rules: null,
    });
  });

  it("returns an empty plan when nothing was named", () => {
    expect(normalizeChannelPlan({})).toEqual({ actions: [], brief: null, rules: null });
  });

  it("reads a task line and the next Friday", () => {
    expect(actionFromLine("Send the contract | Sam | 2026-10-09 | .cursor/skills/copywriting/SKILL.md")).toEqual({
      title: "Send the contract",
      assignee: "Sam",
      due: "2026-10-09",
      skill: ".cursor/skills/copywriting/SKILL.md",
    });
    const wednesday = Date.UTC(2026, 9, 7);
    expect(dueMillis("Friday", wednesday)).toBe(Date.UTC(2026, 9, 9));
    expect(dueMillis("2026-10-09", wednesday)).toBe(Date.UTC(2026, 9, 9));
  });

  it("keeps a standing rule once", () => {
    const first = mergeBrief("They sell foam.", null, "No video");
    expect(first).toContain("## Rules\n- No video");
    expect(mergeBrief(first, null, "No video\nUse the brand colors")).toContain("- Use the brand colors");
    expect(mergeBrief(first, null, "No video").match(/No video/g)).toHaveLength(1);
  });
});

describe("applyChannelPlan", () => {
  it("puts each action on the client board and appends the brief", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO workspaces (
         id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
         request_digest, status, opened_at, organization_id
       ) VALUES (
         'ws-1', 'northwind', 'Northwind', 'Northwind', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1'
       )`,
      [NOW],
    );
    await sql.run(
      `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, actor_kind, actor_id, created_at, updated_at
       ) VALUES ('brief-1', 'org-1', 'ws-1', 'Northwind brief', 'brief', 'approved', 1, 'agent', 'client-desk', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, title, copy_text, media_json, status, sort
       ) VALUES ('item-1', 'brief-1', 1, 'page', 'brief.md', 'They sell foam.', '[]', 'pending', 0)`,
    );
    const saved = await applyChannelPlan(
      sql,
      {
        organizationId: "org-1",
        actions: [{ title: "Write the pricing page" }, { title: "Book the kickoff" }],
        brief: "Add a pricing page so buyers can compare plans.",
      },
      NOW + 1,
    );
    expect(saved.taskIds).toHaveLength(2);
    const tasks = await sql.all<{ title: string; created_by_kind: string }>(
      "SELECT title, created_by_kind FROM tasks WHERE organization_id = 'org-1' ORDER BY title",
    );
    expect(tasks).toEqual([
      { title: "Book the kickoff", created_by_kind: "agent" },
      { title: "Write the pricing page", created_by_kind: "agent" },
    ]);
    const brief = await getBrief(sql, "org-1", "brief");
    expect(brief?.body).toContain("They sell foam.");
    expect(brief?.body).toContain("Add a pricing page so buyers can compare plans.");
    expect(brief?.status).toBe("draft");
  });

  it("still files the task when the lead has no brief yet", async () => {
    const sql = await database();
    const saved = await applyChannelPlan(
      sql,
      { organizationId: "org-1", actions: [{ title: "Turn this lead into a client" }], brief: "They are ready to start." },
      NOW,
    );
    expect(saved.taskIds).toHaveLength(1);
    expect(saved.briefUpdated).toBe(false);
    const note = await sql.get<{ body: string }>(
      "SELECT body FROM activities WHERE organization_id = 'org-1' AND kind = 'agent.brief_change'",
    );
    expect(note?.body).toBe("They are ready to start.");
  });
});
