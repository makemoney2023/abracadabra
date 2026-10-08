import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { runAgentWork } from "@/db/agent-work";
import {
  assignClientWorkflow,
  createClientWorkflow,
  createWorkflowGroup,
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
});
