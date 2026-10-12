import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { claimDueWorkflow, createClientWorkflow, createWorkflowGroup, settleRunningSwarms } from "./client-workflows";
import { abandonPipeline, acceptWorkflow, appendPipelineStage, SOCIAL_PIPELINE, startPipeline } from "./specialist-pipeline";

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
     VALUES ('proj-1', 'org-1', 'Launch', 'active', ?, ?)`,
    [NOW, NOW],
  );
  return sql;
}

function swarmFetch(executed: { workflowId: string; input: string; kind?: string }[]): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("/api/template")) {
      return Response.json({
        id: "skill",
        name: "Skill",
        nodes: [{ id: "n1", type: "writer", name: "Page", instructions: "Write.", position: { x: 0, y: 0 } }],
        edges: [],
      });
    }
    if (href.endsWith("/api/save")) {
      const saved = JSON.parse(String(init?.body ?? "{}")) as { id?: string; kind?: string };
      executed.push({ workflowId: saved.id ?? "", input: "", kind: saved.kind });
      return Response.json({ success: true });
    }
    if (href.endsWith("/api/execute")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { workflowId?: string; input?: string };
      const row = executed.find((item) => item.workflowId === body.workflowId && item.input === "");
      if (row) row.input = body.input ?? "";
      else executed.push({ workflowId: body.workflowId ?? "", input: body.input ?? "" });
      return Response.json({ executionId: `exec-${executed.length}` });
    }
    const page = JSON.stringify([{ name: "North", fact: "Open Sundays", source: "https://north.example" }]);
    return Response.json({
      status: "completed",
      receipt: { tools: [{ server: "parallel", tool: "search" }], check: { ok: true, errors: [] }, missing: [] },
      results: { n1: { status: "done", output: page } },
    });
  }) as typeof fetch;
}

describe("specialist pipeline", () => {
  it("starts the social preset as four stages and only the first swarm", async () => {
    const sql = await database();
    const executed: { workflowId: string; input: string; kind?: string }[] = [];
    const started = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "social",
      paths: [...SOCIAL_PIPELINE],
      startedBy: "staff-1",
      now: NOW,
      origin: "https://swarm.example",
      fetchImpl: swarmFetch(executed),
      wait: async () => {},
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.stages.map((stage) => stage.kind)).toEqual(["research", "copy", "language", "visual"]);
    expect(started.executionId).toBe("exec-1");
    expect(executed).toHaveLength(1);
    expect(executed[0]?.kind).toBe("research");
    const again = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "social",
      paths: [SOCIAL_PIPELINE[0]],
      startedBy: "staff-1",
      now: NOW + 1,
    });
    expect(again).toEqual({ ok: false, error: "open" });
    const copy = started.stages[1];
    const held = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW + 2,
      workflowId: copy?.id,
      fetchImpl: swarmFetch(executed),
      wait: async () => {},
    });
    expect(held).toMatchObject({ ok: true, status: "waiting_accept", waitingOn: started.stages[0]?.id });
    expect(executed).toHaveLength(1);
    const added = await appendPipelineStage(sql, {
      organizationId: "org-1",
      groupId: started.groupId,
      skillPath: ".cursor/skills/community/marketingskills/seo-audit/SKILL.md",
      now: NOW + 3,
    });
    expect(added).toMatchObject({ ok: true });
    expect(executed).toHaveLength(1);
    const accepted = await acceptWorkflow(sql, {
      organizationId: "org-1",
      workflowId: started.stages[0]?.id ?? "",
      now: NOW + 3,
    });
    expect(accepted.ok).toBe(true);
    const next = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW + 4,
      workflowId: copy?.id,
      instruction: "Facts: Open Sundays\nDo not use: Unlock",
      fetchImpl: swarmFetch(executed),
      wait: async () => {},
    });
    expect(next).toMatchObject({ ok: true, status: "completed" });
    expect(executed[1]?.input).toContain("https://north.example");
    expect(executed[1]?.input).toContain("Return JSON only.");
    expect(executed[1]?.input).not.toContain("Sunday hours");
    const due = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW + 5,
      fetchImpl: swarmFetch(executed),
      wait: async () => {},
    });
    expect(due).toEqual({ ok: true, none: true });
  });

  it("keeps a settled receipt when the chat notice fails", async () => {
    const sql = await database();
    const group = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "audit",
      paths: [".cursor/skills/community/marketingskills/seo-audit/SKILL.md"],
      startedBy: "staff-1",
      now: NOW,
    });
    if (!group.ok) throw new Error("pipeline");
    await sql.run(
      `INSERT INTO swarm_runs (
        id, organization_id, project_id, workflow_id, swarm_workflow_id, execution_id, template_id, name, status, trigger, started_at
      ) VALUES ('swarm-1', 'org-1', 'proj-1', ?, 'client-audit', 'exec-audit', 'skill-audit', 'seo-audit', 'running', 'chat', ?)`,
      [group.stages[0]?.id, NOW],
    );
    const settled = await settleRunningSwarms({
      sql,
      origin: "https://swarm.example",
      now: NOW + 1,
      fetchImpl: (async (url: string | URL | Request) => {
        const href = String(url);
        if (href.includes("/api/template")) return Response.json({ nodes: [{ id: "n1" }] });
        return Response.json({
          status: "check_failed",
          receipt: { check: { errors: ["not json"] }, missing: ["not json"] },
          results: { n1: { status: "done", output: "not json" } },
        });
      }) as typeof fetch,
      notify: async () => {
        throw new Error("chat down");
      },
    });
    expect(settled).toBe(1);
    const row = await sql.get<{ last_status: string; last_receipt: string; last_output: string }>(
      "SELECT last_status, last_receipt, last_output FROM client_workflows WHERE id = ?",
      [group.stages[0]?.id],
    );
    expect(row?.last_status).toBe("check_failed");
    expect(row?.last_receipt).toContain("not json");
    expect(row?.last_output).toContain("not json");
  });

  it("renders an accepted visual page and keeps the accept when an image fails", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO workspaces (
        id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
        quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id
      ) VALUES ('space-1', 'northwind', 'Northwind', 'Northwind', NULL, 'Abra', 'standard', 1000000000, 30, 0, 'active', ?, 'org-1', 'proj-1')`,
      [NOW],
    );
    const started = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "visual",
      paths: [SOCIAL_PIPELINE[3]],
      startedBy: "staff-1",
      now: NOW,
    });
    if (!started.ok) throw new Error("pipeline");
    const page = JSON.stringify([{ imagePrompt: "A quiet room", videoPrompt: "A slow pan" }]);
    await sql.run("UPDATE client_workflows SET last_status = 'completed', last_output = ? WHERE id = ?", [
      page,
      started.stages[0]?.id,
    ]);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const objects = new Map<string, Uint8Array>();
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
    const accepted = await acceptWorkflow(sql, {
      organizationId: "org-1",
      workflowId: started.stages[0]?.id ?? "",
      now: NOW + 1,
      store,
      run: async () => ({ image: Buffer.from(png).toString("base64") }),
    });
    expect(accepted).toMatchObject({ ok: true, images: { stored: 1, errors: [] } });
    const file = await sql.get<{ relative_path: string }>(
      "SELECT relative_path FROM files WHERE relative_path LIKE 'agent/visual/%'",
    );
    expect(file?.relative_path).toMatch(/\.png$/);
    const kept = await sql.get<{ accepted_at: number }>("SELECT accepted_at FROM client_workflows WHERE id = ?", [
      started.stages[0]?.id,
    ]);
    expect(kept?.accepted_at).toBe(NOW + 1);
    await sql.run("UPDATE client_workflows SET accepted_at = NULL, last_receipt = NULL WHERE id = ?", [started.stages[0]?.id]);
    const failed = await acceptWorkflow(sql, {
      organizationId: "org-1",
      workflowId: started.stages[0]?.id ?? "",
      now: NOW + 2,
      store,
      run: async () => {
        throw new Error("flux down");
      },
    });
    expect(failed).toMatchObject({ ok: true, images: { stored: 0, errors: ["flux down"] } });
    const still = await sql.get<{ accepted_at: number; last_receipt: string }>(
      "SELECT accepted_at, last_receipt FROM client_workflows WHERE id = ?",
      [started.stages[0]?.id],
    );
    expect(still?.accepted_at).toBe(NOW + 2);
    expect(still?.last_receipt).toContain("flux down");
    const files = await sql.all<{ relative_path: string }>("SELECT relative_path FROM files WHERE relative_path LIKE 'agent/visual/%'");
    expect(files).toHaveLength(1);
    const again = await acceptWorkflow(sql, {
      organizationId: "org-1",
      workflowId: started.stages[0]?.id ?? "",
      now: NOW + 3,
      store,
      run: async () => ({ image: Buffer.from(png).toString("base64") }),
    });
    expect(again).toMatchObject({ ok: true, images: { stored: 0, errors: [] } });
    const after = await sql.all<{ relative_path: string }>("SELECT relative_path FROM files WHERE relative_path LIKE 'agent/visual/%'");
    expect(after).toHaveLength(1);
  });

  it("closes a half-built pipeline so the project can start again", async () => {
    const sql = await database();
    const broken = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "social",
      paths: [SOCIAL_PIPELINE[0], " "],
      startedBy: "staff-1",
      now: NOW,
    });
    expect(broken.ok).toBe(false);
    const next = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "social",
      paths: [SOCIAL_PIPELINE[0]],
      startedBy: "staff-1",
      now: NOW + 1,
    });
    expect(next.ok).toBe(true);
  });

  it("does not stale a group that is not a pipeline", async () => {
    const sql = await database();
    const group = await createWorkflowGroup(sql, { organizationId: "org-1", name: "Old", projectId: "proj-1", now: NOW });
    if (!group.ok) throw new Error("group");
    const workflow = await createClientWorkflow(sql, {
      organizationId: "org-1",
      groupId: group.group.id,
      name: "Schema",
      templateId: "pack-schema-readiness",
      projectId: "proj-1",
      now: NOW,
    });
    if (!workflow.ok) throw new Error("workflow");
    const closed = await abandonPipeline(sql, { organizationId: "org-1", groupId: group.group.id, now: NOW + 1 });
    expect(closed).toEqual({ ok: false, error: "missing" });
    const row = await sql.get<{ last_status: string | null }>("SELECT last_status FROM client_workflows WHERE id = ?", [
      workflow.workflow.id,
    ]);
    expect(row?.last_status ?? null).toBeNull();
  });

  it("keeps an accepted page when the rerun does not start", async () => {
    const sql = await database();
    const started = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "audit",
      paths: [".cursor/skills/community/marketingskills/seo-audit/SKILL.md"],
      startedBy: "staff-1",
      now: NOW,
    });
    if (!started.ok) throw new Error("pipeline");
    await sql.run("UPDATE client_workflows SET last_status = 'completed', last_output = ?, accepted_at = ? WHERE id = ?", [
      "The audit page",
      NOW,
      started.stages[0]?.id,
    ]);
    const rerun = await claimDueWorkflow({
      sql,
      organizationId: "org-1",
      origin: "https://swarm.example",
      now: NOW + 1,
      workflowId: started.stages[0]?.id,
      fetchImpl: (async () => {
        throw new Error("swarm down");
      }) as typeof fetch,
      wait: async () => {},
    });
    expect(rerun).toEqual({ ok: false, error: "invalid" });
    const row = await sql.get<{ accepted_at: number | null; last_output: string | null; last_status: string | null }>(
      "SELECT accepted_at, last_output, last_status FROM client_workflows WHERE id = ?",
      [started.stages[0]?.id],
    );
    expect(row).toEqual({ accepted_at: NOW, last_output: "The audit page", last_status: "completed" });
  });
});
