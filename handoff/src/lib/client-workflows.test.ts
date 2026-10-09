import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { runAgentWork } from "@/db/agent-work";
import { LIMITS } from "@/lib/policy/limits";
import { localObjectStore } from "@/lib/store/objects";
import { storeScanContext } from "./scan-context";
import {
  assignClientWorkflow,
  createClientWorkflow,
  createWorkflowGroup,
  claimDueWorkflow,
  listClientWorkflows,
  runClientWorkflow,
  workflowTaskPlan,
} from "./client-workflows";

const NOW = 1_700_000_000_000;

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
     VALUES ('proj-1', 'org-1', 'Launch', 'active', ?, ?), ('proj-2', 'org-1', 'Care', 'active', ?, ?)`,
    [NOW, NOW, NOW, NOW],
  );
  return sql;
}

const TEMPLATE = {
  id: "pack-schema-readiness",
  nodes: [
    { id: "n1", instructions: "Follow .cursor/skills/community/marketingskills/seo/SKILL.md. Check the pages." },
    { id: "n2", instructions: "Follow .cursor/skills/community/marketingskills/copy/SKILL.md Write the note." },
    { id: "n3", instructions: "Summarize the findings." },
  ],
  edges: [
    { id: "e1", source: "n1", target: "n2" },
    { id: "e2", source: "n2", target: "n3" },
  ],
};

describe("client workflows", () => {
  it("turns a swarm template into ordered skill steps and edges", () => {
    expect(workflowTaskPlan(TEMPLATE)).toEqual({
      steps: [
        { path: ".cursor/skills/community/marketingskills/seo/SKILL.md", mode: "complete", status: "todo" },
        { path: ".cursor/skills/community/marketingskills/copy/SKILL.md", mode: "complete", status: "todo" },
      ],
      edges: TEMPLATE.edges,
      current: 0,
    });
    expect(workflowTaskPlan({ nodes: [{ instructions: "No skill here." }] })).toBeNull();
    expect(workflowTaskPlan(null)).toBeNull();
  });

  it("saves the workflow steps on a task the work wake can run", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Launch swarm", projectId: "proj-1", now: NOW });
    if (!group.ok) throw new Error("group");
    const plan = workflowTaskPlan(TEMPLATE);
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Schema readiness",
      templateId: "pack-schema-readiness",
      projectId: "proj-1",
      plan,
      now: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const task = await sql.get<{ id: string; title: string; status: string; stage: string; project_id: string; skills_json: string }>(
      "SELECT id, title, status, stage, project_id, skills_json FROM tasks WHERE organization_id = 'org-1'",
    );
    expect(task?.id).toBe(created.workflow.taskId);
    expect(task?.title).toBe("Schema readiness");
    expect(task?.status).toBe("todo");
    expect(task?.stage).toBe("describe");
    expect(task?.project_id).toBe("proj-1");
    expect(JSON.parse(task?.skills_json ?? "{}")).toEqual(plan);
    await runAgentWork(
      sql,
      { keyId: "agent", organizationId: "org-1" },
      "update_task",
      {
        taskId: task?.id,
        skills: [
          { path: ".cursor/skills/community/marketingskills/seo/SKILL.md", mode: "complete", status: "done" },
          { path: ".cursor/skills/community/marketingskills/copy/SKILL.md", mode: "complete", status: "todo" },
        ],
        status: "doing",
        note: "Finished the first step.",
        requestId: "step-1",
      },
      NOW + 1,
    );
    const after = await sql.get<{ skills_json: string }>("SELECT skills_json FROM tasks WHERE id = ?", [task?.id]);
    expect(JSON.parse(after?.skills_json ?? "{}")).toEqual({
      steps: [
        { path: ".cursor/skills/community/marketingskills/seo/SKILL.md", mode: "complete", status: "done" },
        { path: ".cursor/skills/community/marketingskills/copy/SKILL.md", mode: "complete", status: "todo" },
      ],
      edges: TEMPLATE.edges,
      current: 1,
    });
  });

  it("ties a group to a client and a project, then assigns a workflow", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Launch swarm", projectId: "proj-1", now: NOW });
    expect(group.ok).toBe(true);
    if (!group.ok) return;
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Schema readiness",
      templateId: "pack-schema-readiness",
      now: NOW,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(await listClientWorkflows(sql, "org-1", "proj-1")).toHaveLength(1);
    expect(await listClientWorkflows(sql, "org-1", "proj-2")).toHaveLength(0);
    const assigned = await assignClientWorkflow(sql, { workflowId: created.workflow.id, projectId: "proj-2", now: NOW });
    expect(assigned).toEqual({ ok: true, workflowId: created.workflow.id, projectId: "proj-2" });
    expect((await listClientWorkflows(sql, "org-1", "proj-2"))[0]?.name).toBe("Schema readiness");
    expect(await assignClientWorkflow(sql, { workflowId: created.workflow.id, projectId: "missing", now: NOW })).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("refuses a group on a project from another client", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO projects (id, organization_id, name, status, created_at, updated_at)
       VALUES ('proj-other', 'org-2', 'Other', 'active', ?, ?)`,
      [NOW, NOW],
    );
    expect(await createWorkflowGroup(sql, { organizationId: "org-1", name: "Nope", projectId: "proj-other", now: NOW })).toEqual({
      ok: false,
      error: "missing",
    });
  });

  it("runs the workflow template for that client", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Launch swarm", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Schema readiness",
      templateId: "pack-schema-readiness",
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    const calls: string[] = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("/api/template?id=pack-schema-readiness")) {
        return Response.json({
          id: "pack-schema-readiness",
          name: "Schema readiness",
          nodes: [{ id: "schema-r", type: "researcher", name: "Schema", instructions: "Score.", position: { x: 0, y: 0 } }],
          edges: [],
        });
      }
      if (href.endsWith("/api/save")) return Response.json({ success: true });
      if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-9" });
      return Response.json({ status: "completed", results: { "schema-r": { status: "done", output: "Score 40." } } });
    };
    const result = await runClientWorkflow({
      sql,
      workflowId: created.workflow.id,
      brief: "Check Northwind.",
      origin: "https://swarm.example",
      now: NOW,
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => {},
    });
    expect(result).toMatchObject({ ok: true, executionId: "run-9", status: "completed", output: "Score 40." });
    expect(calls[0]).toBe("https://swarm.example/api/template?id=pack-schema-readiness");
    const row = await sql.get<{ last_execution_id: string }>("SELECT last_execution_id FROM client_workflows");
    expect(row?.last_execution_id).toBe("run-9");
  });

  it("adds the client's stored website scrape to the brief", async () => {
    const sql = await database();
    await sql.exec(`
      CREATE TABLE readiness_scans (
        id TEXT PRIMARY KEY, domain TEXT, status TEXT NOT NULL, organization_id TEXT,
        score_total INTEGER, created_at INTEGER NOT NULL, completed_at INTEGER
      );
      CREATE TABLE readiness_scan_pages (
        id TEXT PRIMARY KEY, scan_id TEXT NOT NULL, url TEXT NOT NULL, page_type TEXT NOT NULL,
        schema_types_json TEXT NOT NULL, evidence_json TEXT NOT NULL
      );
    `);
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, organization_id
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 'northwind', 'Northwind', 'Northwind', NULL, 'Northwind', 'standard',
        ?, ?, 0, 'active', ?, 'org-1'
      )`,
      [LIMITS.defaultQuotaBytes, LIMITS.defaultRetentionDays, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scans (id, status, organization_id, score_total, created_at, completed_at)
       VALUES ('scan-1', 'complete', 'org-1', 40, ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO readiness_scan_pages (id, scan_id, url, page_type, schema_types_json, evidence_json)
       VALUES ('page-1', 'scan-1', 'https://northwind.example/', 'home', '["Organization"]', ?)`,
      [JSON.stringify({ businessName: "Northwind", scrapedText: "We sell foam to shipyards." })],
    );
    const root = mkdtempSync(path.join(tmpdir(), "workflow-context-"));
    try {
      await storeScanContext({ sql, store: localObjectStore(root), organizationId: "org-1", now: NOW });
      const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Launch swarm", now: NOW });
      if (!group.ok) throw new Error("group");
      const created = await createClientWorkflow(sql, {
        organizationId: "org-1",
        groupId: group.group.id,
        name: "Schema readiness",
        templateId: "pack-schema-readiness",
        now: NOW,
      });
      if (!created.ok) throw new Error("workflow");
      let sent = "";
      const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
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
        if (href.endsWith("/api/execute")) {
          sent = String(init?.body ?? "");
          return Response.json({ executionId: "run-ctx" });
        }
        return Response.json({ status: "completed", results: { "schema-r": { status: "done", output: "Score 40." } } });
      };
      await runClientWorkflow({
        sql,
        workflowId: created.workflow.id,
        brief: "Check Northwind.",
        origin: "https://swarm.example",
        now: NOW,
        fetchImpl: fetchImpl as typeof fetch,
        wait: async () => {},
      });
      expect(sent).toContain("Check Northwind.");
      expect(sent).toContain("Existing client context from the file space:");
      expect(sent).toContain("We sell foam to shipyards.");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("stores the first run and the repeat gap", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Weekly scan",
      templateId: "pack-schema-readiness",
      dueAt: NOW + 3_600_000,
      everyMs: 86_400_000,
      now: NOW,
    });
    expect(created.ok).toBe(true);
    const row = await sql.get<{ next_run_at: number; every_ms: number; scheduled_at: number }>(
      "SELECT next_run_at, every_ms, scheduled_at FROM client_workflows",
    );
    expect(row).toEqual({ next_run_at: NOW + 3_600_000, every_ms: 86_400_000, scheduled_at: NOW });
    const tooSoon = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Too soon",
      templateId: "pack-schema-readiness",
      dueAt: NOW,
      everyMs: 60_000,
      now: NOW,
    });
    expect(tooSoon).toEqual({ ok: false, error: "invalid" });
  });

  it("stores catalog servers on a workflow and refuses any other address", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Clock",
      templateId: "pack-schema-readiness",
      mcpServerIds: ["swarm-demo"],
      now: NOW,
    });
    expect(created.ok).toBe(true);
    const row = await sql.get<{ mcp_server_ids: string }>("SELECT mcp_server_ids FROM client_workflows");
    expect(row?.mcp_server_ids).toBe(JSON.stringify(["swarm-demo"]));
    const refused = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Elsewhere",
      templateId: "pack-schema-readiness",
      mcpServerIds: ["https://evil.example/mcp"],
      now: NOW,
    });
    expect(refused).toEqual({ ok: false, error: "invalid" });
  });

  it("sends the catalog server when that workflow runs", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Clock",
      templateId: "pack-schema-readiness",
      mcpServerIds: ["swarm-demo"],
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    let saved = "";
    await runClientWorkflow({
      sql,
      workflowId: created.workflow.id,
      brief: "What time is it?",
      origin: "https://swarm.example",
      now: NOW,
      wait: async () => {},
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.includes("/api/template")) {
          return Response.json({
            id: "pack-schema-readiness",
            name: "Schema",
            nodes: [{ id: "n1", type: "researcher", name: "Reader", instructions: "Read.", position: { x: 0, y: 0 } }],
            edges: [],
          });
        }
        if (href.endsWith("/api/save")) {
          saved = String(init?.body ?? "");
          return Response.json({ success: true });
        }
        if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-mcp" });
        return Response.json({ status: "completed", results: { n1: { status: "done", output: "Noon." } } });
      }) as typeof fetch,
    });
    const body = JSON.parse(saved) as { mcpServers?: { url: string }[]; nodes?: { mcpServerIds?: string[] }[] };
    expect(body.mcpServers).toEqual([{ id: "swarm-demo", name: "Swarm demo", url: "https://swarm.example/demo-mcp/mcp" }]);
    expect(body.nodes?.[0]?.mcpServerIds).toEqual(["swarm-demo"]);
  });

  it("attaches the portal when a workflow has no stored servers and the portal URL is set", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Clock",
      templateId: "pack-schema-readiness",
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    const headers: { save?: string; execute?: string } = {};
    let saved = "";
    await runClientWorkflow({
      sql,
      workflowId: created.workflow.id,
      brief: "What time is it?",
      origin: "https://swarm.example",
      portalUrl: "https://mcp.example/mcp",
      runSecret: "test-run-secret",
      now: NOW,
      wait: async () => {},
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        const authorization = new Headers(init?.headers).get("authorization") ?? "";
        if (href.includes("/api/template")) {
          return Response.json({
            id: "pack-schema-readiness",
            name: "Schema",
            nodes: [{ id: "n1", type: "researcher", name: "Reader", instructions: "Read.", position: { x: 0, y: 0 } }],
            edges: [],
          });
        }
        if (href.endsWith("/api/save")) {
          saved = String(init?.body ?? "");
          headers.save = authorization;
          return Response.json({ success: true });
        }
        if (href.endsWith("/api/execute")) {
          headers.execute = authorization;
          return Response.json({ executionId: "run-portal" });
        }
        return Response.json({ status: "completed", results: { n1: { status: "done", output: "Noon." } } });
      }) as typeof fetch,
    });
    const body = JSON.parse(saved) as { mcpServers?: { id: string; url: string; headers?: unknown }[] };
    expect(body.mcpServers).toEqual([{ id: "portal", name: "MCP portal", url: "https://mcp.example/mcp" }]);
    expect(body.mcpServers?.[0]?.headers).toBeUndefined();
    expect(headers.save).toBe("Bearer test-run-secret");
    expect(headers.execute).toBe("Bearer test-run-secret");
  });

  it("leaves a workflow with no stored servers unattached when the portal URL is empty", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Clock",
      templateId: "pack-schema-readiness",
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    let saved = "";
    await runClientWorkflow({
      sql,
      workflowId: created.workflow.id,
      brief: "What time is it?",
      origin: "https://swarm.example",
      portalUrl: "",
      now: NOW,
      wait: async () => {},
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.includes("/api/template")) {
          return Response.json({
            id: "pack-schema-readiness",
            name: "Schema",
            nodes: [{ id: "n1", type: "researcher", name: "Reader", instructions: "Read.", position: { x: 0, y: 0 } }],
            edges: [],
          });
        }
        if (href.endsWith("/api/save")) {
          saved = String(init?.body ?? "");
          return Response.json({ success: true });
        }
        if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-plain" });
        return Response.json({ status: "completed", results: { n1: { status: "done", output: "Noon." } } });
      }) as typeof fetch,
    });
    expect(JSON.parse(saved).mcpServers).toBeUndefined();
  });

  it("keeps a stored demo server even when the portal URL is set", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Clock",
      templateId: "pack-schema-readiness",
      mcpServerIds: ["swarm-demo"],
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    let saved = "";
    await runClientWorkflow({
      sql,
      workflowId: created.workflow.id,
      brief: "What time is it?",
      origin: "https://swarm.example",
      portalUrl: "https://mcp.example/mcp",
      runSecret: "test-run-secret",
      now: NOW,
      wait: async () => {},
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.includes("/api/template")) {
          return Response.json({
            id: "pack-schema-readiness",
            name: "Schema",
            nodes: [{ id: "n1", type: "researcher", name: "Reader", instructions: "Read.", position: { x: 0, y: 0 } }],
            edges: [],
          });
        }
        if (href.endsWith("/api/save")) {
          saved = String(init?.body ?? "");
          return Response.json({ success: true });
        }
        if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-demo" });
        return Response.json({ status: "completed", results: { n1: { status: "done", output: "Noon." } } });
      }) as typeof fetch,
    });
    const body = JSON.parse(saved) as { mcpServers?: { id: string }[] };
    expect(body.mcpServers?.map((server) => server.id)).toEqual(["swarm-demo"]);
  });

  it("runs the oldest due workflow and moves a repeating schedule forward", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const first = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "First",
      templateId: "pack-schema-readiness",
      dueAt: NOW - 2,
      everyMs: 86_400_000,
      now: NOW,
    });
    const second = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Second",
      templateId: "pack-schema-readiness",
      dueAt: NOW - 1,
      now: NOW,
    });
    if (!first.ok || !second.ok) throw new Error("workflow");
    const result = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW,
      fetchImpl: swarmFetch(),
      wait: async () => {},
    });
    expect(result).toMatchObject({ ok: true, none: false, workflowId: first.workflow.id, executionId: "run-due", more: true });
    const recorded = await sql.get<{ execution_id: string; trigger: string }>(
      "SELECT execution_id, trigger FROM swarm_runs",
    );
    expect(recorded).toEqual({ execution_id: "run-due", trigger: "due" });
    const moved = await sql.get<{ next_run_at: number }>("SELECT next_run_at FROM client_workflows WHERE id = ?", [
      first.workflow.id,
    ]);
    expect(moved?.next_run_at).toBe(NOW + 86_400_000);
  });

  it("clears a one-shot schedule after the swarm starts", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Once",
      templateId: "pack-schema-readiness",
      dueAt: NOW - 1,
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    const result = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW,
      fetchImpl: swarmFetch(),
      wait: async () => {},
    });
    expect(result).toMatchObject({ ok: true, none: false, more: false });
    const row = await sql.get<{ next_run_at: number | null }>("SELECT next_run_at FROM client_workflows WHERE id = ?", [
      created.workflow.id,
    ]);
    expect(row?.next_run_at).toBeNull();
    const activity = await sql.get<{ kind: string; body: string; data_json: string }>(
      "SELECT kind, body, data_json FROM activities WHERE organization_id = 'org-1' AND kind = 'agent.swarm_run'",
    );
    expect(activity?.kind).toBe("agent.swarm_run");
    expect(activity?.body).toContain("Score 40");
    expect(JSON.parse(activity?.data_json ?? "{}")).toMatchObject({
      status: "completed",
      executionId: "run-due",
      trigger: "due",
      requestId: `due:${created.workflow.id}`,
    });
  });

  it("keeps the due time when the swarm does not start", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Retry",
      templateId: "pack-schema-readiness",
      dueAt: NOW - 5,
      everyMs: 86_400_000,
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    const result = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW,
      fetchImpl: async () => new Response("no", { status: 500 }),
      wait: async () => {},
    });
    expect(result.ok).toBe(false);
    const row = await sql.get<{ next_run_at: number }>("SELECT next_run_at FROM client_workflows WHERE id = ?", [
      created.workflow.id,
    ]);
    expect(row?.next_run_at).toBe(NOW - 5);
  });

  it("names the client in the scheduled brief and files a draft", async () => {
    const sql = await database();
    await sql.run("UPDATE organizations SET website = ?, industry = ?, notes = ? WHERE id = 'org-1'", [
      "https://northwind.example",
      "Yards",
      "We build docks.",
    ]);
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, organization_id
      ) VALUES ('space-1', 'northwind', 'Northwind', 'Northwind', NULL, 'Abra-ca-dabra', 'standard', 1000000000, 30, 0, 'active', ?, 'org-1')`,
      [NOW],
    );
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Care", now: NOW });
    if (!group.ok) throw new Error("group");
    const created = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Once",
      templateId: "pack-schema-readiness",
      dueAt: NOW - 1,
      now: NOW,
    });
    if (!created.ok) throw new Error("workflow");
    let brief = "";
    const result = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW,
      fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
        const href = String(url);
        if (href.endsWith("/api/execute")) brief = String(init?.body ?? "");
        return swarmFetch()(url, init);
      }) as typeof fetch,
      wait: async () => {},
      store: {
        async stat() {
          return null;
        },
        async read() {
          return null;
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
      },
    });
    expect(result.ok).toBe(true);
    const sent = JSON.parse(brief) as { input?: string };
    expect(sent.input).toContain("Northwind");
    expect(sent.input).toContain("https://northwind.example");
    expect(sent.input).toContain("Yards");
    expect(sent.input).toContain("We build docks.");
    const draft = await sql.get<{ title: string; status: string; published_version: number | null; copy_text: string }>(
      `SELECT d.title, d.status, d.published_version, i.copy_text
       FROM deliverables d JOIN deliverable_items i ON i.deliverable_id = d.id
       WHERE d.organization_id = 'org-1'`,
    );
    expect(draft).toMatchObject({
      title: "Once for Northwind",
      status: "draft",
      published_version: null,
      copy_text: "Score 40.",
    });
  });
});

function swarmFetch(): typeof fetch {
  return (async (url: string | URL | Request) => {
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
    if (href.endsWith("/api/execute")) return Response.json({ executionId: "run-due" });
    return Response.json({ status: "completed", results: { "schema-r": { status: "done", output: "Score 40." } } });
  }) as typeof fetch;
}
