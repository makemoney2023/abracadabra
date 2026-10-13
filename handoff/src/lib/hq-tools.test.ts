import { generateKeyPairSync } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { organizationForSlackChannel, recordThreadMessage, workRequestById } from "@/db/conversations";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { runHqTool, type HqToolResult } from "./hq-tools";

const NOW = 1_700_000_000_000;

const staff: Caller = {
  userId: "staff-1",
  staff: { superAdmin: false },
  operatorOf: [],
  memberships: [],
};

const outsider: Caller = {
  userId: "client-1",
  staff: null,
  operatorOf: [],
  memberships: [],
};

async function database(): Promise<Sql> {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const sql = sqliteSql(db);
  await migrate(sql);
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
     VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES (
       'ws-1', 'strongfoam', 'Strongfoam', 'Strongfoam', NULL, 'Studio', 'standard',
       1000, 30, 0, 'active', ?
     )`,
    [NOW],
  );
  return sql;
}

describe("runHqTool", () => {
  it("refuses someone who is not staff and an unknown tool", async () => {
    const sql = await database();
    expect(await runHqTool(sql, outsider, { tool: "search_clients", input: {} }, NOW)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await runHqTool(sql, staff, { tool: "nope", input: {}, idempotencyKey: "k" }, NOW)).toEqual({
      ok: false,
      error: "unknown",
    });
  });

  it("finds a client and stamps the staff write", async () => {
    const sql = await database();
    const created = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "create-1" },
      NOW,
    );
    expect(valueOf(created)).toBeDefined();
    const again = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Other" }, idempotencyKey: "create-1" },
      NOW,
    );
    expect(again).toEqual(created);
    const found = await runHqTool(sql, staff, { tool: "search_clients", input: { query: "north" } }, NOW);
    expect(valueOf(found)).toHaveLength(1);
    const stamped = await sql.get<{ via: string }>(
      "SELECT json_extract(data_json, '$.via') AS via FROM activities WHERE actor_id = 'staff-1' AND created_at = ?",
      [NOW],
    );
    expect(stamped?.via).toBe("hq_chat");
    const missing = await runHqTool(sql, staff, { tool: "client_summary", input: { organizationId: "missing" } }, NOW);
    expect(missing).toEqual({ ok: false, error: "missing" });
  });

  it("opens a space and queues a schema scan when a client is added with a website", async () => {
    const sql = await database();
    await sql.exec(`
      CREATE TABLE readiness_scans (
        id TEXT PRIMARY KEY,
        public_token TEXT NOT NULL UNIQUE,
        domain TEXT NOT NULL,
        origin TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL,
        organization_id TEXT,
        error_message TEXT,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
    `);
    const sent: { type: string; scanId: string }[] = [];
    const created = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Northwind", website: "https://northwind.example" }, idempotencyKey: "create-site" },
      NOW,
      {
        intake: {
          queue: {
            send: async (body) => {
              sent.push(body);
            },
          },
          env: { AGENT_URL: "https://agent.example", AGENT_WAKE_SECRET: "wake-secret" },
          fetchImpl: async () => new Response("ok"),
        },
      },
    );
    expect(created).toMatchObject({ ok: true });
    expect(sent).toHaveLength(1);
    const space = await sql.get<{ organization_id: string; slug: string }>(
      "SELECT organization_id, slug FROM workspaces WHERE slug = 'northwind-example'",
    );
    const organizationId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
    expect(space).toEqual({ organization_id: organizationId, slug: "northwind-example" });
  });

  it("previews a client-facing write and stores nothing until it is approved", async () => {
    const sql = await database();
    const created = await runHqTool(
      sql,
      staff,
      { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "org" },
      NOW,
    );
    const organizationId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
    await sql.run("UPDATE workspaces SET organization_id = ? WHERE id = 'ws-1'", [organizationId]);
    const preview = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-1",
      },
      NOW,
    );
    expect(preview).toEqual({ needsApproval: true, preview: "Approve add_work for Northwind." });
    const briefs = await sql.get<{ count: number }>("SELECT COUNT(*) AS count FROM deliverables");
    expect(briefs?.count).toBe(0);
    await sql.run("UPDATE organizations SET brief_approval = 'staff' WHERE id = ?", [organizationId]);
    const wakes: string[] = [];
    const approved = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-1",
        approved: true,
      },
      NOW + 1,
      { wake: async (_id, reason) => { wakes.push(reason); } },
    );
    expect(approved).toMatchObject({ ok: true });
    expect(wakes).toEqual(["brief_changed"]);
    const saved = await sql.get<{ body: string }>("SELECT copy_text AS body FROM deliverable_items");
    expect(saved?.body).toContain("page — A landing page");
    const brief = await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE kind = 'brief'");
    expect(brief?.status).toBe("approved");
  });

  it("leaves an addendum for the client to approve when the client owns brief approval", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const wakes: string[] = [];
    const result = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: { organizationId, kind: "page", outcome: "A landing page", goal: "so buyers can enquire", due: "Friday" },
        idempotencyKey: "work-2",
        approved: true,
      },
      NOW,
      { wake: async (_id, reason) => { wakes.push(reason); } },
    );
    expect(result).toMatchObject({ ok: true, value: { waitingFor: "client" } });
    expect(wakes).toEqual([]);
    const brief = await sql.get<{ status: string; published_version: number | null }>(
      "SELECT status, published_version FROM deliverables WHERE kind = 'brief'",
    );
    expect(brief).toEqual({ status: "in_review", published_version: 1 });
  });

  it("stores the brief on the project and in its requirements", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const project = await runHqTool(
      sql,
      staff,
      { tool: "create_project", input: { organizationId, name: "Social media" }, idempotencyKey: "proj-brief" },
      NOW,
    );
    const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
    const result = await runHqTool(
      sql,
      staff,
      {
        tool: "add_work",
        input: {
          organizationId,
          projectId,
          kind: "social_pack",
          outcome: "Buyer psychology research, then a content calendar",
          goal: "so the posts speak to loss aversion",
          due: "Friday",
        },
        idempotencyKey: "work-project",
        approved: true,
      },
      NOW + 1,
      { wake: async () => {} },
    );
    expect(result).toMatchObject({ ok: true, value: { waitingFor: "client" } });
    const brief = await sql.get<{ project_id: string | null }>(
      "SELECT project_id FROM deliverables WHERE kind = 'brief'",
    );
    expect(brief?.project_id).toBe(projectId);
    const description = await sql.get<{ description: string }>("SELECT description FROM projects WHERE id = ?", [projectId]);
    expect(description?.description).toContain("Buyer psychology research, then a content calendar");
  });

  it("stores create_project description on the project and does not replace one that is already there", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const created = await runHqTool(
      sql,
      staff,
      {
        tool: "create_project",
        input: {
          organizationId,
          name: "social media",
          description: "For Renew Implants, research the audience, competitors, and social media content strategy.",
        },
        idempotencyKey: "proj-desc",
      },
      NOW,
    );
    const projectId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
    const description = await sql.get<{ description: string }>("SELECT description FROM projects WHERE id = ?", [projectId]);
    expect(description?.description).toContain("research the audience, competitors");
    const brief = await sql.get<{ project_id: string; copy_text: string }>(
      `SELECT d.project_id, i.copy_text
       FROM deliverables d
       JOIN deliverable_items i ON i.deliverable_id = d.id AND i.version = d.version
       WHERE d.kind = 'brief' AND d.project_id = ?`,
      [projectId],
    );
    expect(brief?.project_id).toBe(projectId);
    expect(brief?.copy_text).toContain("research the audience, competitors");
    await runHqTool(
      sql,
      staff,
      {
        tool: "create_project",
        input: { organizationId, name: "social media", description: "A different brief." },
        idempotencyKey: "proj-desc-2",
      },
      NOW + 1,
    );
    const kept = await sql.get<{ description: string }>("SELECT description FROM projects WHERE id = ?", [projectId]);
    expect(kept?.description).toContain("research the audience, competitors");
    expect(kept?.description).not.toContain("A different brief.");
  });

  it("turns an approved client request into a brief piece and records who decided", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    await sql.run("UPDATE organizations SET brief_approval = 'staff' WHERE id = ?", [organizationId]);
    const requestId = await recordThreadMessage(
      sql,
      {
        organizationId,
        channel: "email",
        threadId: "<m-1>",
        sender: "ada@client.example",
        body: "Please add a pricing page so that buyers can compare, by Friday.",
        state: "proposed",
        goal: "buyers can compare",
        dueText: "Friday",
      },
      NOW,
    );
    const wakes: string[] = [];
    const options = { wake: async (_id: string, reason: string) => { wakes.push(reason); } };
    const unnamed = await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "approved" }, idempotencyKey: "d-0", approved: true },
      NOW,
      options,
    );
    expect(unnamed).toEqual({ ok: false, error: "invalid" });
    const approved = await runHqTool(
      sql,
      staff,
      {
        tool: "decide_work_request",
        input: { id: requestId, decision: "approved", kind: "page", outcome: "A pricing page" },
        idempotencyKey: "d-1",
        approved: true,
      },
      NOW + 1,
      options,
    );
    expect(approved).toMatchObject({ ok: true });
    expect(wakes).toEqual(["brief_changed"]);
    const row = await workRequestById(sql, requestId);
    expect(row).toMatchObject({ state: "approved", decided_by: "staff-1", piece_title: "page: A pricing page", brief_version: 1 });
    const saved = await sql.get<{ body: string }>("SELECT copy_text AS body FROM deliverable_items");
    expect(saved?.body).toContain("page — A pricing page");
    const invoice = await sql.get<{ status: string; description: string; total: number }>(
      `SELECT i.status, item.description, i.total_cents AS total
       FROM invoices i JOIN invoice_items item ON item.invoice_id = i.id`,
    );
    expect(invoice).toEqual({ status: "draft", description: "page: A pricing page", total: 0 });
    const logged = await sql.get<{ via: string }>(
      "SELECT json_extract(data_json, '$.via') AS via FROM activities WHERE kind = 'staff.work_request'",
    );
    expect(logged?.via).toBe("hq_chat");
  });

  it("needs a reason to decline and logs a pause as the staff member", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const requestId = await recordThreadMessage(
      sql,
      { organizationId, channel: "slack", threadId: "1.2", sender: "U1", body: "Add a blog.", state: "proposed" },
      NOW,
    );
    const bare = await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "declined" }, idempotencyKey: "x-1", approved: true },
      NOW,
    );
    expect(bare).toEqual({ ok: false, error: "invalid" });
    await runHqTool(
      sql,
      staff,
      { tool: "decide_work_request", input: { id: requestId, decision: "declined", body: "Not this quarter." }, idempotencyKey: "x-2", approved: true },
      NOW,
    );
    expect(await workRequestById(sql, requestId)).toMatchObject({ state: "declined", decline_reason: "Not this quarter." });
    await runHqTool(sql, staff, { tool: "pause_client", input: { organizationId }, idempotencyKey: "p-1", approved: true }, NOW + 5);
    const paused = await sql.get<{ actor: string; via: string }>(
      `SELECT actor_id AS actor, json_extract(data_json, '$.via') AS via FROM activities
       WHERE kind = 'staff.agent_paused'`,
    );
    expect(paused).toEqual({ actor: "staff-1", via: "hq_chat" });
  });

  it("links a Slack channel to a client only after approval", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const request = { tool: "link_slack_channel", input: { organizationId, channelId: "C0123ABCD" }, idempotencyKey: "s-1" };
    expect(await runHqTool(sql, staff, request, NOW)).toMatchObject({ needsApproval: true });
    expect(await organizationForSlackChannel(sql, "C0123ABCD")).toBeNull();
    expect(await runHqTool(sql, staff, { ...request, approved: true }, NOW)).toMatchObject({ ok: true });
    expect(await organizationForSlackChannel(sql, "C0123ABCD")).toBe(organizationId);
    const bad = await runHqTool(sql, staff, { ...request, input: { organizationId, channelId: "general" }, idempotencyKey: "s-2", approved: true }, NOW);
    expect(bad).toEqual({ ok: false, error: "invalid" });
  });

  it("lists the open deal and files tasks plus a brief sentence", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    await sql.run(
      `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
       VALUES ('deal-1', ?, 'Site rebuild', 'proposal', 'manual', ?, ?)`,
      [organizationId, NOW, NOW],
    );
    const deals = await runHqTool(sql, staff, { tool: "list_deals", input: { organizationId } }, NOW);
    expect(valueOf(deals)).toEqual([{ id: "deal-1", title: "Site rebuild", stage: "proposal" }]);
    const summary = await runHqTool(sql, staff, { tool: "client_summary", input: { organizationId } }, NOW);
    expect(valueOf(summary)).toMatchObject({ id: organizationId, deals: [{ id: "deal-1" }] });
    const filed = await runHqTool(
      sql,
      staff,
      {
        tool: "file_actions",
        input: { organizationId, title: "Turn this lead into a client\nOpen the project", body: "They are ready to start." },
        idempotencyKey: "file-1",
      },
      NOW + 1,
    );
    expect(valueOf(filed)).toMatchObject({ briefUpdated: true });
    const filedBrief = await sql.get<{ copy_text: string }>(
      "SELECT copy_text FROM deliverable_items WHERE title = 'brief.md'",
    );
    expect(filedBrief?.copy_text).toContain("They are ready to start.");
    const tasks = await sql.all<{ title: string }>("SELECT title FROM tasks WHERE organization_id = ? ORDER BY title", [organizationId]);
    expect(tasks.map((row) => row.title)).toEqual(["Open the project", "Turn this lead into a client"]);
  });

  it("sets the next step, drafts a client status, and assigns a dated task", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    await sql.run(
      `INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at)
       VALUES ('deal-1', ?, 'Site rebuild', 'proposal', 'manual', ?, ?)`,
      [organizationId, NOW, NOW],
    );
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at)
       VALUES ('sam', 'sam@example.com', 0, ?, NULL)`,
      [NOW],
    );
    const step = await runHqTool(
      sql,
      staff,
      { tool: "set_deal_step", input: { dealId: "deal-1", body: "Call them", due: "Thursday" }, idempotencyKey: "step-1" },
      Date.UTC(2026, 9, 7),
    );
    expect(valueOf(step)).toMatchObject({ nextStep: "Call them", nextStepAt: Date.UTC(2026, 9, 8) });
    const project = await runHqTool(
      sql,
      staff,
      { tool: "create_project", input: { organizationId, name: "Site" }, idempotencyKey: "proj-1" },
      NOW,
    );
    const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
    const draft = await runHqTool(
      sql,
      staff,
      { tool: "draft_client_status", input: { projectId, body: "They are a client now." }, idempotencyKey: "status-1" },
      NOW,
    );
    expect(valueOf(draft)).toMatchObject({ state: "draft", audience: "client" });
    await runHqTool(
      sql,
      staff,
      {
        tool: "file_actions",
        input: {
          organizationId,
          title: "Send the contract | sam | 2026-10-09 | .cursor/skills/copywriting/SKILL.md",
          rules: "No video",
        },
        idempotencyKey: "file-2",
      },
      NOW + 2,
    );
    const task = await sql.get<{ assignee_user_id: string; due_at: number; skills_json: string; project_id: string }>(
      "SELECT assignee_user_id, due_at, skills_json, project_id FROM tasks WHERE title = 'Send the contract'",
    );
    expect(task?.project_id).toBe(projectId);
    expect(task?.assignee_user_id).toBe("sam");
    expect(task?.due_at).toBe(Date.UTC(2026, 9, 9));
    expect(JSON.parse(task?.skills_json ?? "{}")).toMatchObject({
      steps: [{ path: ".cursor/skills/copywriting/SKILL.md", status: "todo" }],
    });
  });

  it("creates a workflow for a client and waits to run it", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const project = await runHqTool(
      sql,
      staff,
      { tool: "create_project", input: { organizationId, name: "Launch" }, idempotencyKey: "proj" },
      NOW,
    );
    const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
    const group = await runHqTool(
      sql,
      staff,
      { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm", projectId }, idempotencyKey: "group" },
      NOW,
    );
    const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
    const workflow = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: { organizationId, groupId, name: "Schema readiness", templateId: "pack-schema-readiness" },
        idempotencyKey: "wf",
      },
      NOW,
    );
    const workflowId = String((valueOf(workflow) as { id?: string } | undefined)?.id ?? "");
    const listed = await runHqTool(sql, staff, { tool: "list_workflows", input: { organizationId, projectId } }, NOW);
    expect(valueOf(listed)).toEqual([
      expect.objectContaining({ id: workflowId, name: "Schema readiness", groupProjectId: projectId }),
    ]);
    const held = await runHqTool(
      sql,
      staff,
      { tool: "run_workflow", input: { id: workflowId, body: "Check the site." }, idempotencyKey: "run" },
      NOW,
    );
    expect(held).toEqual({ ok: false, error: "invalid" });
    const started = await runHqTool(
      sql,
      staff,
      { tool: "run_workflow", input: { id: workflowId, body: "Check the site." }, idempotencyKey: "run-go", approved: true },
      NOW,
      {
        swarm: {
          origin: "https://swarm.example",
          wait: async () => {},
          fetchImpl: async (url) => {
            const href = String(url);
            if (href.includes("/api/template")) {
              return Response.json({
                id: "pack-schema-readiness",
                name: "Schema readiness",
                nodes: [{ id: "schema-r", type: "researcher", name: "Schema", instructions: "Score.", position: { x: 0, y: 0 } }],
                edges: [],
              });
            }
            if (href.endsWith("/api/save")) return Response.json({ success: true });
            if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-chat" });
            return Response.json({ status: "completed", results: { "schema-r": { status: "done", output: "Score 40." } } });
          },
        },
      },
    );
    expect(started).toMatchObject({ ok: true, value: { executionId: "run-chat" } });
    const recorded = await sql.get<{ execution_id: string; trigger: string }>(
      "SELECT execution_id, trigger FROM swarm_runs",
    );
    expect(recorded).toEqual({ execution_id: "run-chat", trigger: "chat" });
  });

  it("writes the template skills onto a task when the workflow is saved", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const group = await runHqTool(
      sql,
      staff,
      { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm" }, idempotencyKey: "group-skills" },
      NOW,
    );
    const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
    const saved = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: { organizationId, groupId, name: "Schema readiness", templateId: "pack-schema-readiness" },
        idempotencyKey: "wf-skills",
      },
      NOW,
      {
        swarm: {
          origin: "https://swarm.test",
          fetchImpl: async (input) => {
            expect(String(input)).toBe("https://swarm.test/api/template?id=pack-schema-readiness");
            return new Response(
              JSON.stringify({
                id: "pack-schema-readiness",
                nodes: [
                  { id: "n1", instructions: "Follow .cursor/skills/schema/SKILL.md. Read the scan." },
                  { id: "n2", instructions: "Follow .cursor/skills/notes/SKILL.md. File the note." },
                ],
                edges: [{ id: "e1", source: "n1", target: "n2" }],
              }),
            );
          },
        },
      },
    );
    const taskId = String((valueOf(saved) as { taskId?: string } | undefined)?.taskId ?? "");
    const task = await sql.get<{ skills_json: string; title: string }>(
      "SELECT skills_json, title FROM tasks WHERE id = ?",
      [taskId],
    );
    expect(task?.title).toBe("Schema readiness");
    expect(JSON.parse(task?.skills_json ?? "{}")).toEqual({
      steps: [
        { path: ".cursor/skills/schema/SKILL.md", mode: "complete", status: "todo" },
        { path: ".cursor/skills/notes/SKILL.md", mode: "complete", status: "todo" },
      ],
      edges: [{ id: "e1", source: "n1", target: "n2" }],
      current: 0,
    });
  });

  it("stores a workflow schedule from the chat tool", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const group = await runHqTool(
      sql,
      staff,
      { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm" }, idempotencyKey: "group-due" },
      NOW,
    );
    const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
    const saved = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: {
          organizationId,
          groupId,
          name: "Weekly schema",
          templateId: "pack-schema-readiness",
          dueAt: String(NOW + 3_600_000),
          everyMs: 86_400_000,
        },
        idempotencyKey: "wf-due",
      },
      NOW,
    );
    const workflowId = String((valueOf(saved) as { id?: string } | undefined)?.id ?? "");
    const row = await sql.get<{ next_run_at: number; every_ms: number }>(
      "SELECT next_run_at, every_ms FROM client_workflows WHERE id = ?",
      [workflowId],
    );
    expect(row).toEqual({ next_run_at: NOW + 3_600_000, every_ms: 86_400_000 });
    const rejected = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: { organizationId, groupId, name: "Too soon", templateId: "pack-schema-readiness", dueAt: NOW, everyMs: 60_000 },
        idempotencyKey: "wf-soon",
      },
      NOW,
    );
    expect(rejected).toMatchObject({ ok: false, error: "invalid" });
  });

  it("stores a catalog server from the chat tool and refuses any other address", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const group = await runHqTool(
      sql,
      staff,
      { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm" }, idempotencyKey: "group-mcp" },
      NOW,
    );
    const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
    const saved = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: {
          organizationId,
          groupId,
          name: "Clock",
          templateId: "pack-schema-readiness",
          mcpServerIds: ["swarm-demo"],
        },
        idempotencyKey: "wf-mcp",
      },
      NOW,
    );
    const workflowId = String((valueOf(saved) as { id?: string } | undefined)?.id ?? "");
    const row = await sql.get<{ mcp_server_ids: string }>("SELECT mcp_server_ids FROM client_workflows WHERE id = ?", [workflowId]);
    expect(row?.mcp_server_ids).toBe(JSON.stringify(["swarm-demo"]));
    const rejected = await runHqTool(
      sql,
      staff,
      {
        tool: "create_workflow",
        input: { organizationId, groupId, name: "Elsewhere", templateId: "pack-schema-readiness", mcpServerIds: ["https://evil.example/mcp"] },
        idempotencyKey: "wf-evil",
      },
      NOW,
    );
    expect(rejected).toMatchObject({ ok: false, error: "invalid" });
  });

  it("lists the packs the live swarm can run", async () => {
    const sql = await database();
    const listed = await runHqTool(
      sql,
      staff,
      { tool: "list_swarm_packs", input: {} },
      NOW,
      {
        swarm: {
          origin: "https://swarm.example",
          fetchImpl: async () =>
            new Response(
              JSON.stringify([
                { id: "skill-community-marketingskills-copywriting", name: "copywriting", description: "7 posts" },
                { id: "skill-community-advertising-skills-headline-matrix", name: "headline-matrix", description: "Headlines" },
                { id: "pipeline-demo", name: "Pipeline", description: "Not a pack" },
              ]),
            ),
        },
      },
    );
    expect(valueOf(listed)).toEqual([
      { id: "skill-community-marketingskills-copywriting", name: "copywriting", description: "7 posts" },
    ]);
    const found = await runHqTool(
      sql,
      staff,
      { tool: "list_swarm_packs", input: { query: "headline" } },
      NOW,
      {
        swarm: {
          origin: "https://swarm.example",
          fetchImpl: async () =>
            new Response(
              JSON.stringify([
                { id: "skill-community-marketingskills-copywriting", name: "copywriting", description: "7 posts" },
                { id: "skill-community-advertising-skills-headline-matrix", name: "headline-matrix", description: "Headlines" },
              ]),
            ),
        },
      },
    );
    expect(valueOf(found)).toEqual([
      { id: "skill-community-advertising-skills-headline-matrix", name: "headline-matrix", description: "Headlines" },
    ]);
  });

  it("schedules the pack and wakes the client when a skilled task moves to run", async () => {
    const sql = await database();
    const organizationId = await client(sql);
    const skills = JSON.stringify({
      steps: [{ path: ".cursor/skills/community/marketingskills/ad-creative/SKILL.md", mode: "complete", status: "todo" }],
      current: 0,
    });
    await sql.run(
      `INSERT INTO tasks (id, organization_id, title, status, stage, skills_json, created_at, updated_at)
       VALUES ('task-ads', ?, 'Ad concepts', 'todo', 'describe', ?, ?, ?)`,
      [organizationId, skills, NOW, NOW],
    );
    const wakes: string[] = [];
    const moved = await runHqTool(
      sql,
      staff,
      { tool: "set_task_stage", input: { taskId: "task-ads", stage: "run" }, idempotencyKey: "stage-run", approved: true },
      NOW,
      { wake: async (id, reason) => { wakes.push(`${id}:${reason}`); } },
    );
    expect(moved).toMatchObject({ ok: true });
    const workflow = await sql.get<{ template_id: string; next_run_at: number; task_id: string }>(
      "SELECT template_id, next_run_at, task_id FROM client_workflows WHERE task_id = 'task-ads'",
    );
    expect(workflow).toMatchObject({
      template_id: "skill-community-marketingskills-ad-creative",
      next_run_at: NOW,
      task_id: "task-ads",
    });
    expect(wakes).toEqual([`${organizationId}:due`]);
    const again = await runHqTool(
      sql,
      staff,
      { tool: "set_task_stage", input: { taskId: "task-ads", stage: "run" }, idempotencyKey: "stage-run-2", approved: true },
      NOW + 1,
      { wake: async () => {} },
    );
    expect(again).toMatchObject({ ok: true });
    const rows = await sql.all<{ id: string }>("SELECT id FROM client_workflows WHERE task_id = 'task-ads'");
    expect(rows).toHaveLength(1);
  });
});

it("returns the client's projects and reuses one with the same name", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const first = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Social Media Ads" }, idempotencyKey: "proj-a" },
    NOW,
  );
  const projectId = String((valueOf(first) as { id?: string } | undefined)?.id ?? "");
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at)
     VALUES ('task-1', ?, ?, 'Create content calendar', 'todo', ?, ?)`,
    [projectId, organizationId, NOW, NOW],
  );
  const projects = await runHqTool(sql, staff, { tool: "list_projects", input: { organizationId } }, NOW);
  expect(valueOf(projects)).toEqual([{ id: projectId, name: "Social Media Ads", status: "planned" }]);
  const tasks = await runHqTool(sql, staff, { tool: "list_tasks", input: { organizationId } }, NOW);
  expect(valueOf(tasks)).toEqual([
    { id: "task-1", title: "Create content calendar", status: "todo", stage: "describe", project_id: projectId },
  ]);
  const summary = await runHqTool(sql, staff, { tool: "client_summary", input: { organizationId } }, NOW);
  expect(valueOf(summary)).toMatchObject({ projects: [{ id: projectId, name: "Social Media Ads" }] });
  const again = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "social media ads" }, idempotencyKey: "proj-b" },
    NOW + 1,
  );
  expect((valueOf(again) as { id?: string } | undefined)?.id).toBe(projectId);
  const count = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE organization_id = ?", [organizationId]);
  expect(count?.n).toBe(1);
});

it("lists two loose repos and refuses a space from another client", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  await sql.run(
    `INSERT INTO repos (
       id, github_repo_id, installation_id, full_name, organization_id, project_id,
       default_branch, is_private, owned_by, linked_by, created_at, archived_at
     ) VALUES
       ('repo-a', 11, NULL, 'north/a', ?, NULL, 'main', 0, 'agency', 'staff-1', ?, NULL),
       ('repo-b', 12, NULL, 'north/b', ?, NULL, 'main', 0, 'agency', 'staff-1', ?, NULL)`,
    [organizationId, NOW, organizationId, NOW],
  );
  const created = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Launch" }, idempotencyKey: "proj-loose" },
    NOW,
  );
  const value = valueOf(created) as { id?: string; looseRepos?: { id: string }[]; spaces?: { id: string }[] };
  expect(value.looseRepos?.map((repo) => repo.id).sort()).toEqual(["repo-a", "repo-b"]);
  expect((await sql.get<{ project_id: string | null }>("SELECT project_id FROM repos WHERE id = 'repo-a'"))?.project_id).toBeNull();
  expect((await sql.get<{ project_id: string | null }>("SELECT project_id FROM repos WHERE id = 'repo-b'"))?.project_id).toBeNull();
  const other = await runHqTool(
    sql,
    staff,
    { tool: "create_client", input: { name: "Pine" }, idempotencyKey: "pine" },
    NOW,
  );
  const pineId = String((valueOf(other) as { id?: string } | undefined)?.id ?? "");
  const pine = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId: pineId, name: "Pine site" }, idempotencyKey: "pine-proj" },
    NOW + 1,
  );
  const pineProject = String((valueOf(pine) as { id?: string } | undefined)?.id ?? "");
  const refused = await runHqTool(
    sql,
    staff,
    {
      tool: "assign_space_project",
      input: { organizationId, workspaceId: "ws-1", projectId: pineProject },
      idempotencyKey: "assign-space",
    },
    NOW + 2,
  );
  expect(refused).toEqual({ ok: false, error: "invalid" });
});

it("moves a workflow task to run instead of starting a second swarm", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const project = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Launch" }, idempotencyKey: "proj-run" },
    NOW,
  );
  const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
  const group = await runHqTool(
    sql,
    staff,
    { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm", projectId }, idempotencyKey: "group-run" },
    NOW,
  );
  const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
  const wakes: string[] = [];
  const workflow = await runHqTool(
    sql,
    staff,
    {
      tool: "create_workflow",
      input: { organizationId, groupId, name: "Ads", templateId: "pack-community-marketingskills", projectId },
      idempotencyKey: "wf-run",
    },
    NOW,
    {
      swarm: {
        origin: "https://swarm.example",
        fetchImpl: async () =>
          Response.json({
            nodes: [{ instructions: "Follow .cursor/skills/community/marketingskills/ad-creative/SKILL.md" }],
            edges: [],
          }),
      },
    },
  );
  const workflowId = String((valueOf(workflow) as { id?: string } | undefined)?.id ?? "");
  const taskId = String((valueOf(workflow) as { taskId?: string } | undefined)?.taskId ?? "");
  expect(taskId).not.toBe("");
  const started = await runHqTool(
    sql,
    staff,
    { tool: "run_workflow", input: { id: workflowId, body: "Go." }, idempotencyKey: "run-task", approved: true },
    NOW + 1,
    { wake: async (id, reason) => { wakes.push(`${id}:${reason}`); } },
  );
  expect(started).toMatchObject({ ok: true, value: { taskId, stage: "run" } });
  const task = await sql.get<{ stage: string }>("SELECT stage FROM tasks WHERE id = ?", [taskId]);
  expect(task?.stage).toBe("run");
  expect(wakes).toEqual([`${organizationId}:due`]);
  const runs = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM swarm_runs");
  expect(runs?.n).toBe(0);
});

it("starts the swarm when a workflow task is approved to run", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const project = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Launch" }, idempotencyKey: "proj-go" },
    NOW,
  );
  const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
  const group = await runHqTool(
    sql,
    staff,
    { tool: "create_workflow_group", input: { organizationId, name: "Launch swarm", projectId }, idempotencyKey: "group-go" },
    NOW,
  );
  const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
  const template = Response.json({
    id: "pack-community-marketingskills",
    name: "Ads",
    nodes: [
      {
        id: "ads",
        type: "writer",
        name: "Ads",
        instructions: "Follow .cursor/skills/community/marketingskills/ad-creative/SKILL.md",
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
  });
  const workflow = await runHqTool(
    sql,
    staff,
    {
      tool: "create_workflow",
      input: { organizationId, groupId, name: "Ads", templateId: "pack-community-marketingskills", projectId },
      idempotencyKey: "wf-go",
    },
    NOW,
    { swarm: { origin: "https://swarm.example", fetchImpl: async () => template.clone() } },
  );
  const workflowId = String((valueOf(workflow) as { id?: string } | undefined)?.id ?? "");
  const taskId = String((valueOf(workflow) as { taskId?: string } | undefined)?.taskId ?? "");
  await runHqTool(
    sql,
    staff,
    { tool: "instruct_task", input: { taskId, body: "Use the spring offer." }, idempotencyKey: "tell", approved: true },
    NOW + 1,
  );
  let brief = "";
  const wakes: string[] = [];
  const started = await runHqTool(
    sql,
    staff,
    { tool: "run_workflow", input: { id: workflowId, body: "Run it now." }, idempotencyKey: "run-go", approved: true },
    NOW + 2,
    {
      wake: async (id, reason) => {
        wakes.push(`${id}:${reason}`);
      },
      swarm: {
        origin: "https://swarm.example",
        wait: async () => {},
        fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
          const href = String(url);
          if (href.endsWith("/api/execute")) brief = String(init?.body ?? "");
          if (href.includes("/api/template")) return template.clone();
          if (href.endsWith("/api/save")) return Response.json({ success: true });
          if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-ads" });
          return Response.json({ status: "completed", results: { ads: { status: "done", output: "Three posts." } } });
        }) as typeof fetch,
      },
    },
  );
  expect(started).toMatchObject({
    ok: true,
    value: { taskId, stage: "run", executionId: "run-ads", status: "completed" },
  });
  const sent = JSON.parse(brief) as { input?: string };
  expect(sent.input).toContain("Use the spring offer.");
  expect(sent.input).toContain("Run it now.");
  const runs = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM swarm_runs");
  expect(runs?.n).toBe(1);
  const due = await sql.get<{ next_run_at: number | null }>("SELECT next_run_at FROM client_workflows WHERE id = ?", [
    workflowId,
  ]);
  expect(due?.next_run_at).toBeNull();
  expect(wakes).toEqual([]);
});

it("asks before deleting a task or a project, then removes that work", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const project = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Site" }, idempotencyKey: "proj-del" },
    NOW,
  );
  const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
  const task = await runHqTool(
    sql,
    staff,
    { tool: "create_task", input: { organizationId, title: "Sketch the home page" }, idempotencyKey: "task-del" },
    NOW,
  );
  const taskId = String((valueOf(task) as { id?: string } | undefined)?.id ?? "");
  await sql.run("UPDATE tasks SET project_id = ? WHERE id = ?", [projectId, taskId]);
  const heldTask = await runHqTool(
    sql,
    staff,
    { tool: "delete_task", input: { taskId }, idempotencyKey: "del-task" },
    NOW + 1,
  );
  expect(heldTask).toEqual({ needsApproval: true, preview: "Approve delete_task for Sketch the home page." });
  expect(await sql.get("SELECT id FROM tasks WHERE id = ?", [taskId])).toBeTruthy();
  const removedTask = await runHqTool(
    sql,
    staff,
    { tool: "delete_task", input: { taskId }, idempotencyKey: "del-task", approved: true },
    NOW + 1,
  );
  expect(removedTask).toMatchObject({
    ok: true,
    value: { id: taskId, title: "Sketch the home page", organizationId, projectId },
  });
  expect(await sql.get("SELECT id FROM tasks WHERE id = ?", [taskId])).toBeUndefined();
  const stamped = await sql.get<{ via: string }>(
    "SELECT json_extract(data_json, '$.via') AS via FROM activities WHERE kind = 'task_deleted'",
  );
  expect(stamped?.via).toBe("hq_chat");
  expect(
    await runHqTool(sql, staff, { tool: "delete_task", input: { taskId: "missing" }, idempotencyKey: "del-missing", approved: true }, NOW + 2),
  ).toEqual({ ok: false, error: "missing" });
  expect(
    await runHqTool(sql, staff, { tool: "delete_task", input: { taskId: " " }, idempotencyKey: "del-blank" }, NOW + 3),
  ).toEqual({ ok: false, error: "invalid" });

  const heldProject = await runHqTool(
    sql,
    staff,
    { tool: "delete_project", input: { projectId }, idempotencyKey: "del-proj" },
    NOW + 4,
  );
  expect(heldProject).toEqual({ needsApproval: true, preview: "Approve delete_project for Site." });
  const removedProject = await runHqTool(
    sql,
    staff,
    { tool: "delete_project", input: { projectId }, idempotencyKey: "del-proj", approved: true },
    NOW + 4,
  );
  expect(removedProject).toMatchObject({
    ok: true,
    value: { id: projectId, name: "Site", organizationId, tasksRemoved: 0 },
  });
  expect(await sql.get("SELECT id FROM projects WHERE id = ?", [projectId])).toBeUndefined();
  const space = await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE id = 'ws-1'");
  expect(space?.id).toBe("ws-1");
});

it("lists swarm files in the client space and reads the text", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  await sql.run(
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES ('batch-1', 'ws-1', NULL, 'agent', 'From the swarm', NULL, ?, ?, NULL, NULL)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type,
      size_bytes, object_key, tag, status, scan_attempts, created_at, uploaded_at, next_scan_at
    ) VALUES (
      'file-calendar', 'batch-1', 'ws-1', 'agent/swarm/run-1/result.md', 'md', 'text/markdown',
      24, 'ws-1/batch-1/file-calendar', 'copy', 'uploaded', 0, ?, ?, ?
    )`,
    [NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-other', 'Other', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (
      id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days,
      request_digest, status, opened_at, organization_id
    ) VALUES (
      'ws-other', 'other', 'Other', 'Other', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-other'
    )`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO batches (
      id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at
    ) VALUES ('batch-other', 'ws-other', NULL, 'agent', 'From the swarm', NULL, ?, ?, NULL, NULL)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (
      id, batch_id, workspace_id, relative_path, extension, declared_content_type,
      size_bytes, object_key, tag, status, scan_attempts, created_at, uploaded_at, next_scan_at
    ) VALUES (
      'file-other', 'batch-other', 'ws-other', 'agent/swarm/run-9/secret.md', 'md', 'text/markdown',
      6, 'other-key', 'copy', 'uploaded', 0, ?, ?, ?
    )`,
    [NOW, NOW, NOW],
  );
  const objects = new Map<string, Uint8Array>([
    ["ws-1/batch-1/file-calendar", new TextEncoder().encode("# Calendar\nPost on Monday.")],
    ["other-key", new TextEncoder().encode("secret")],
  ]);
  const store = {
    async stat() {
      return null;
    },
    async read(key: string) {
      return objects.get(key) ?? null;
    },
    async remove() {},
    async put() {},
    async beginUpload() {
      return "upload-1";
    },
    async readUpload() {
      return null;
    },
    async writePart() {},
    async finishUpload() {},
  };
  const listed = await runHqTool(
    sql,
    staff,
    { tool: "list_space_files", input: { organizationId, path: "agent/swarm/" } },
    NOW,
    { swarm: { origin: "https://swarm.example", store } },
  );
  expect(valueOf(listed)).toEqual([
    {
      id: "file-calendar",
      workspaceId: "ws-1",
      path: "agent/swarm/run-1/result.md",
      tag: "copy",
      status: "uploaded",
      sizeBytes: 24,
    },
  ]);
  const read = await runHqTool(
    sql,
    staff,
    { tool: "read_space_file", input: { organizationId, id: "file-calendar" } },
    NOW,
    { swarm: { origin: "https://swarm.example", store } },
  );
  expect(valueOf(read)).toEqual({
    id: "file-calendar",
    path: "agent/swarm/run-1/result.md",
    body: "# Calendar\nPost on Monday.",
    truncated: false,
  });
  const hidden = await runHqTool(
    sql,
    staff,
    { tool: "read_space_file", input: { organizationId, id: "file-other" } },
    NOW,
    { swarm: { origin: "https://swarm.example", store } },
  );
  expect(hidden).toEqual({ ok: false, error: "missing" });
});

it("saves a finished swarm PDF and starts the next swarms with that output", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const project = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Social" }, idempotencyKey: "proj-next" },
    NOW,
  );
  const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
  const group = await runHqTool(
    sql,
    staff,
    { tool: "create_workflow_group", input: { organizationId, name: "First", projectId }, idempotencyKey: "group-next" },
    NOW,
  );
  const groupId = String((valueOf(group) as { id?: string } | undefined)?.id ?? "");
  const source = await runHqTool(
    sql,
    staff,
    {
      tool: "create_workflow",
      input: { organizationId, groupId, name: "Research", templateId: "pack-research", projectId },
      idempotencyKey: "wf-source",
    },
    NOW,
  );
  const sourceId = String((valueOf(source) as { id?: string } | undefined)?.id ?? "");
  await sql.run(
    "UPDATE client_workflows SET last_status = 'completed', last_output = ?, last_execution_id = ? WHERE id = ?",
    ["The calendar is ready.", "exec-done", sourceId],
  );
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const objects = new Map<string, Uint8Array>();
  const calls: { url: string; body?: string }[] = [];
  const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: init?.body ? String(init.body) : undefined });
    if (href.includes("/api/report")) return new Response(pdf);
    if (href.includes("/api/template")) {
      return Response.json({
        id: "pack-copy",
        nodes: [{ id: "n1", instructions: "Follow .cursor/skills/community/marketingskills/copy/SKILL.md Write the calendar.", position: { x: 0, y: 0 } }],
        edges: [],
      });
    }
    if (href.endsWith("/api/save")) return Response.json({ success: true });
    if (href.endsWith("/api/execute")) return Response.json({ executionId: "exec-next" });
    return Response.json({ status: "running", results: {} });
  };
  const store = {
    async stat() {
      return null;
    },
    async read(key: string) {
      return objects.get(key) ?? null;
    },
    async remove() {},
    async put(key: string, bytes: Uint8Array) {
      objects.set(key, bytes);
    },
    async beginUpload() {
      return "upload-1";
    },
    async readUpload() {
      return null;
    },
    async writePart() {},
    async finishUpload() {},
  };
  const swarm = { origin: "https://swarm.example", fetchImpl: fetchImpl as typeof fetch, wait: async () => {}, store };
  const report = await runHqTool(
    sql,
    staff,
    { tool: "save_swarm_report", input: { id: sourceId }, idempotencyKey: "pdf-1" },
    NOW + 1,
    { swarm },
  );
  expect(valueOf(report)).toEqual({ path: "agent/swarm/exec-done/report.pdf", executionId: "exec-done" });
  const held = await runHqTool(
    sql,
    staff,
    {
      tool: "queue_followup_swarms",
      input: { organizationId, id: sourceId, projectId, title: "Copy calendar | pack-copy\nVisual prompts | pack-visual", name: "Next" },
      idempotencyKey: "next-1",
    },
    NOW + 2,
    { swarm },
  );
  expect(held).toMatchObject({ needsApproval: true });
  const queued = await runHqTool(
    sql,
    staff,
    {
      tool: "queue_followup_swarms",
      input: {
        organizationId,
        id: sourceId,
        projectId,
        title: "Copy calendar | pack-copy\nVisual prompts | pack-visual",
        name: "Next",
        body: "Fewer carousels.",
      },
      idempotencyKey: "next-1",
      approved: true,
    },
    NOW + 2,
    { swarm },
  );
  const value = valueOf(queued) as { workflowIds?: string[]; taskIds?: string[]; status?: string; executionId?: string };
  expect(value.workflowIds).toHaveLength(2);
  expect(value.taskIds?.length).toBeGreaterThan(0);
  expect(value.executionId).toBe("");
  expect(value.status).toBe("queued");
  expect(calls.find((call) => call.url.endsWith("/api/execute"))).toBeUndefined();
  const heldReport = await runHqTool(
    sql,
    staff,
    { tool: "publish_swarm_report", input: { id: sourceId }, idempotencyKey: "pub-1" },
    NOW + 4,
  );
  expect(heldReport).toMatchObject({ needsApproval: true });
  const published = await runHqTool(
    sql,
    staff,
    { tool: "publish_swarm_report", input: { id: sourceId }, idempotencyKey: "pub-1", approved: true },
    NOW + 4,
    { swarm },
  );
  const reportDoc = valueOf(published) as { id?: string; status?: string; path?: string };
  expect(reportDoc.status).toBe("in_review");
  expect(reportDoc.path).toBe("agent/swarm/exec-done/report.pdf");
  const read = await runHqTool(sql, staff, { tool: "read_deliverable", input: { id: reportDoc.id, organizationId } }, NOW + 5);
  expect(valueOf(read)).toMatchObject({ id: reportDoc.id, status: "in_review", kind: "document" });
  expect(String((valueOf(read) as { body?: string }).body)).toContain("The calendar is ready.");
  const wrongOrg = await runHqTool(
    sql,
    staff,
    { tool: "read_deliverable", input: { id: reportDoc.id, organizationId: "org-other" } },
    NOW + 5,
  );
  expect(wrongOrg).toEqual({ ok: false, error: "missing" });
  const unfinished = await runHqTool(
    sql,
    staff,
    {
      tool: "queue_followup_swarms",
      input: { organizationId, id: value.workflowIds?.[0], title: "More | pack-copy" },
      idempotencyKey: "next-2",
      approved: true,
    },
    NOW + 3,
    { swarm },
  );
  expect(unfinished).toEqual({ ok: false, error: "invalid" });
});

it("lists, reads, and searches only the repo attached to this client", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const other = await runHqTool(sql, staff, { tool: "create_client", input: { name: "Pine" }, idempotencyKey: "pine-repo" }, NOW);
  const otherId = String((valueOf(other) as { id?: string } | undefined)?.id ?? "");
  await sql.run(
    `INSERT INTO github_installations (id, account_login, account_type, created_at)
     VALUES (77, 'north', 'Organization', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO repos (
       id, github_repo_id, installation_id, full_name, organization_id, project_id,
       default_branch, is_private, owned_by, linked_by, created_at, archived_at
     ) VALUES
       ('repo-site', 21, 77, 'north/site', ?, NULL, 'main', 1, 'agency', 'staff-1', ?, NULL),
       ('repo-other', 22, 77, 'pine/site', ?, NULL, 'main', 1, 'agency', 'staff-1', ?, NULL)`,
    [organizationId, NOW, otherId, NOW],
  );
  const calls: string[] = [];
  const github = {
    secrets: githubSecrets(),
    fetchImpl: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/access_tokens")) return Response.json({ token: "install-token" });
      const header = new Headers(init?.headers).get("authorization");
      expect(header).toBe("Bearer install-token");
      if (url.endsWith("/contents/src?ref=main")) {
        return Response.json([{ name: "app.ts", path: "src/app.ts", type: "file", size: 4 }]);
      }
      if (url.endsWith("/contents/src/app.ts?ref=main")) {
        return Response.json({
          type: "file",
          path: "src/app.ts",
          size: 4,
          encoding: "base64",
          content: Buffer.from("site").toString("base64"),
        });
      }
      if (url.includes("/search/code?")) {
        return Response.json({
          items: [
            { path: "src/app.ts", repository: { full_name: "north/site" }, text_matches: [{ fragment: "site" }] },
            { path: "secret.ts", repository: { full_name: "pine/site" }, text_matches: [{ fragment: "hidden" }] },
          ],
        });
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch,
  };
  const listed = await runHqTool(
    sql,
    staff,
    { tool: "list_repos", input: { organizationId } },
    NOW,
    { github },
  );
  expect(valueOf(listed)).toEqual([{ id: "repo-site", fullName: "north/site", projectId: null, defaultBranch: "main" }]);
  const files = await runHqTool(
    sql,
    staff,
    { tool: "list_repo_files", input: { organizationId, path: "src" } },
    NOW,
    { github },
  );
  expect(valueOf(files)).toMatchObject({
    repoId: "repo-site",
    fullName: "north/site",
    entries: [{ name: "app.ts", path: "src/app.ts", type: "file", size: 4 }],
  });
  const file = await runHqTool(
    sql,
    staff,
    { tool: "read_repo_file", input: { organizationId, path: "src/app.ts" } },
    NOW,
    { github },
  );
  expect(valueOf(file)).toMatchObject({ path: "src/app.ts", body: "site" });
  const found = await runHqTool(
    sql,
    staff,
    { tool: "search_repo", input: { organizationId, query: "site" } },
    NOW,
    { github },
  );
  expect(valueOf(found)).toEqual({
    repoId: "repo-site",
    fullName: "north/site",
    hits: [{ path: "src/app.ts", fragment: "site" }],
  });
  const foreign = await runHqTool(
    sql,
    staff,
    { tool: "read_repo_file", input: { organizationId, repoId: "repo-other", path: "src/app.ts" } },
    NOW,
    { github },
  );
  expect(foreign).toEqual({ ok: false, error: "missing" });
  expect(calls.some((url) => url.includes("pine/site"))).toBe(false);
});

it("asks which repo when the client has more than one and does not call GitHub", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  await sql.run(
    `INSERT INTO github_installations (id, account_login, account_type, created_at)
     VALUES (78, 'north', 'Organization', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO repos (
       id, github_repo_id, installation_id, full_name, organization_id, project_id,
       default_branch, is_private, owned_by, linked_by, created_at, archived_at
     ) VALUES
       ('repo-a', 31, 78, 'north/a', ?, NULL, 'main', 1, 'agency', 'staff-1', ?, NULL),
       ('repo-b', 32, 78, 'north/b', ?, NULL, 'main', 1, 'agency', 'staff-1', ?, NULL)`,
    [organizationId, NOW, organizationId, NOW],
  );
  let called = false;
  const github = {
    secrets: githubSecrets(),
    fetchImpl: (async () => {
      called = true;
      return new Response("no", { status: 500 });
    }) as typeof fetch,
  };
  const files = await runHqTool(
    sql,
    staff,
    { tool: "list_repo_files", input: { organizationId } },
    NOW,
    { github },
  );
  expect(valueOf(files)).toEqual({
    repos: [
      { id: "repo-a", fullName: "north/a", projectId: null, defaultBranch: "main" },
      { id: "repo-b", fullName: "north/b", projectId: null, defaultBranch: "main" },
    ],
  });
  expect(called).toBe(false);
});

it("writes each pipeline activity once, including when the same key is sent again", async () => {
  const sql = await database();
  const organizationId = await client(sql);
  const project = await runHqTool(
    sql,
    staff,
    { tool: "create_project", input: { organizationId, name: "Launch" }, idempotencyKey: "proj-pipe" },
    NOW,
  );
  const projectId = String((valueOf(project) as { id?: string } | undefined)?.id ?? "");
  const path = ".cursor/skills/plugins/parallel/parallel-web-search/SKILL.md";
  const first = await runHqTool(
    sql,
    staff,
    { tool: "start_pipeline", input: { organizationId, projectId, name: "social", paths: path }, idempotencyKey: "pipe-1" },
    NOW,
  );
  await runHqTool(
    sql,
    staff,
    { tool: "start_pipeline", input: { organizationId, projectId, name: "social", paths: path }, idempotencyKey: "pipe-1" },
    NOW,
  );
  const started = valueOf(first) as { groupId?: string; stages?: { id: string; name: string }[] };
  const stageId = started.stages?.[0]?.id ?? "";
  await sql.run("UPDATE client_workflows SET last_status = 'completed', last_output = 'The page' WHERE id = ?", [stageId]);
  const accept = {
    tool: "accept_workflow",
    input: { id: stageId },
    idempotencyKey: "accept-1",
  };
  await runHqTool(sql, staff, accept, NOW + 1);
  await runHqTool(sql, staff, accept, NOW + 1);
  const added = {
    tool: "append_pipeline_stage",
    input: { organizationId, groupId: started.groupId, paths: ".cursor/skills/community/marketingskills/seo-audit/SKILL.md" },
    idempotencyKey: "add-1",
  };
  await runHqTool(sql, staff, added, NOW + 2);
  await runHqTool(sql, staff, added, NOW + 2);
  const abandoned = {
    tool: "abandon_pipeline",
    input: { organizationId, groupId: started.groupId },
    idempotencyKey: "drop-1",
  };
  await runHqTool(sql, staff, abandoned, NOW + 3);
  await runHqTool(sql, staff, abandoned, NOW + 3);
  const rows = await sql.all<{ kind: string; data_json: string }>(
    "SELECT kind, data_json FROM activities WHERE kind LIKE 'pipeline.%' ORDER BY kind",
  );
  expect(rows.map((row) => row.kind)).toEqual([
    "pipeline.abandoned",
    "pipeline.stage_accepted",
    "pipeline.stage_added",
    "pipeline.started",
  ]);
  for (const row of rows) {
    const data = JSON.parse(row.data_json) as { groupId?: string; stage?: string };
    expect(data.groupId).toBe(started.groupId);
    expect(data.stage?.length).toBeGreaterThan(0);
  }
});

async function client(sql: Sql): Promise<string> {
  const created = await runHqTool(sql, staff, { tool: "create_client", input: { name: "Northwind" }, idempotencyKey: "org" }, NOW);
  const organizationId = String((valueOf(created) as { id?: string } | undefined)?.id ?? "");
  await sql.run("UPDATE workspaces SET organization_id = ? WHERE id = 'ws-1'", [organizationId]);
  return organizationId;
}

function valueOf(result: HqToolResult): unknown {
  return "ok" in result && result.ok ? result.value : undefined;
}

function githubSecrets() {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  return {
    appId: "1",
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    webhookSecret: "hook",
  };
}
