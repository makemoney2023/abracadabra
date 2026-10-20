import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import { STUDIO_NAV_GROUPS } from "@/app/staff-links";
import { visibleNavGroups } from "@/app/staff-nav";
import { staffHandOverWaiting } from "./agent-admin";
import { handOverWaitingTasks } from "./agent-dispatch";
import { agentMode, legacyStartsAllowed } from "./agent-mode";
import { registerClientAgent } from "./agent-work-filing";
import { runHqTool } from "./hq-tools";
import { startPipeline } from "./specialist-pipeline";
import { moveTaskStage } from "./task-stage";

/**
 * AGENT_MODE=agents gaps from the code review: lead intake, pipelines, workflow tools, the /swarm nav,
 * and handing over tasks already waiting when a lead agent is assigned.
 */

const NOW = 1_700_000_000_000;
const staffCaller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
let sql: Sql;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  sql = sqliteSql(db);
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)", [NOW]);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('proj-1', 'org-1', 'Website', 'active', ?, ?)", [NOW, NOW]);
});

afterEach(() => {
  delete process.env.AGENT_MODE;
});

async function rows(table: string): Promise<number> {
  const found = await sql.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return Number(found?.n ?? 0);
}

async function task(id: string, stage: string, status = "todo"): Promise<void> {
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at)
     VALUES (?, 'proj-1', 'org-1', ?, ?, ?, 0, ?, ?)`,
    [id, `Card ${id}`, status, stage, NOW, NOW],
  );
}

async function dispatches(): Promise<{ task_id: string; to: string | null; reason: string }[]> {
  const found = await sql.all<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'client_agent.dispatch' ORDER BY created_at, rowid");
  return found.map((row) => JSON.parse(row.data_json));
}

function tool(name: string, input: Record<string, unknown>, key: string) {
  return runHqTool(sql, staffCaller as never, { tool: name, input, idempotencyKey: key, approved: true }, NOW, {
    swarm: { origin: "https://swarm.example", fetchImpl: (async () => { throw new Error("no swarm calls"); }) as unknown as typeof fetch },
  } as never);
}

describe("agentMode reads a Worker's own env first", () => {
  it("takes env.AGENT_MODE over process.env", () => {
    expect(agentMode({ AGENT_MODE: "agents" })).toBe("agents");
    process.env.AGENT_MODE = "agents";
    expect(agentMode({ AGENT_MODE: "legacy" })).toBe("legacy");
    expect(legacyStartsAllowed({})).toBe(false);
  });
});

describe("pipelines in agents mode", () => {
  it("startPipeline refuses before writing a group, a stage, or a task", async () => {
    process.env.AGENT_MODE = "agents";
    const before = [await rows("workflow_groups"), await rows("client_workflows"), await rows("tasks")];
    const started = await startPipeline(sql, {
      organizationId: "org-1",
      projectId: "proj-1",
      label: "Posts",
      paths: [".cursor/skills/marketing/copywriting/SKILL.md"],
      startedBy: "staff-1",
      now: NOW,
      origin: "https://swarm.example",
    });
    expect(started).toEqual({ ok: false, error: "agent_mode" });
    expect([await rows("workflow_groups"), await rows("client_workflows"), await rows("tasks")]).toEqual(before);
  });

  it("start_pipeline from chat returns a refusal that names the mode", async () => {
    process.env.AGENT_MODE = "agents";
    const result = await tool("start_pipeline", { organizationId: "org-1", projectId: "proj-1", paths: ".cursor/skills/marketing/copywriting/SKILL.md" }, "p1");
    expect(result).toMatchObject({ ok: true, value: { agentMode: "agents" } });
    expect(JSON.stringify(result)).toContain("AGENT_MODE is agents");
    expect(await rows("workflow_groups")).toBe(0);
  });
});

describe("workflow tools in agents mode", () => {
  beforeEach(async () => {
    await sql.run("INSERT INTO workflow_groups (id, organization_id, project_id, name, created_at) VALUES ('grp-1', 'org-1', 'proj-1', 'Posts', ?)", [NOW]);
    await sql.run(
      `INSERT INTO client_workflows (id, group_id, organization_id, project_id, name, template_id, created_at, updated_at)
       VALUES ('wf-free', 'grp-1', 'org-1', 'proj-1', 'Loose', 'pack-a', ?, ?)`,
      [NOW, NOW],
    );
  });

  it("create_workflow, queue_followup_swarms, append_pipeline_stage, accept_workflow and run_workflow refuse with the mode named", async () => {
    process.env.AGENT_MODE = "agents";
    const before = [await rows("client_workflows"), await rows("workflow_groups"), await rows("tasks")];
    const calls: [string, Record<string, unknown>][] = [
      ["create_workflow", { organizationId: "org-1", groupId: "grp-1", name: "Copy", templateId: "pack-a", projectId: "proj-1", dueAt: NOW + 60_000 }],
      ["queue_followup_swarms", { organizationId: "org-1", id: "wf-free", title: "Next | pack-a" }],
      ["append_pipeline_stage", { organizationId: "org-1", groupId: "grp-1", paths: ".cursor/skills/marketing/copywriting/SKILL.md" }],
      ["accept_workflow", { id: "wf-free" }],
      ["run_workflow", { id: "wf-free" }],
    ];
    for (const [index, [name, input]] of calls.entries()) {
      const result = await tool(name, input, `k${index}`);
      expect(result, name).toMatchObject({ ok: true, value: { agentMode: "agents" } });
      expect(JSON.stringify(result), name).toContain(`${name} is off: AGENT_MODE is agents`);
    }
    expect([await rows("client_workflows"), await rows("workflow_groups"), await rows("tasks")]).toEqual(before);
  });

  it("run_workflow on a task-backed workflow hands the task to the lead agent instead", async () => {
    process.env.AGENT_MODE = "agents";
    await task("t-run", "engineer");
    await sql.run(
      `INSERT INTO client_workflows (id, group_id, organization_id, project_id, name, template_id, task_id, created_at, updated_at)
       VALUES ('wf-task', 'grp-1', 'org-1', 'proj-1', 'Tasked', 'pack-a', 't-run', ?, ?)`,
      [NOW, NOW],
    );
    await registerClientAgent(sql, { agentId: "acme-lead", organizationId: "org-1", role: "lead", actor: "test", now: NOW });
    const result = await tool("run_workflow", { id: "wf-task" }, "run-task");
    expect(result).toMatchObject({ ok: true, value: { taskId: "t-run", stage: "run" } });
    expect((await dispatches()).at(-1)).toMatchObject({ task_id: "t-run", to: "acme-lead", reason: "run" });
  });

  it("legacy mode is untouched: the refusal set does not apply", async () => {
    const result = await tool("accept_workflow", { id: "wf-free" }, "legacy-accept");
    expect(JSON.stringify(result)).not.toContain("AGENT_MODE is agents");
  });
});

describe("/swarm in the HQ nav", () => {
  it("is hidden when the shell passes it as hidden, and nothing else moves", () => {
    const all = STUDIO_NAV_GROUPS.flatMap((group) => group.items.map((item) => item.href));
    const shown = visibleNavGroups(STUDIO_NAV_GROUPS, ["/swarm"]).flatMap((group) => group.items.map((item) => item.href));
    expect(all).toContain("/swarm");
    expect(shown).not.toContain("/swarm");
    expect(shown).toEqual(all.filter((href) => href !== "/swarm"));
    expect(visibleNavGroups(STUDIO_NAV_GROUPS, []).flatMap((group) => group.items.map((item) => item.href))).toEqual(all);
  });
});

describe("hand over waiting tasks", () => {
  it("assigning a lead in agents mode re-sends tasks already in build or run, once", async () => {
    process.env.AGENT_MODE = "agents";
    await task("t-build", "describe");
    await task("t-run", "describe");
    await task("t-done", "build", "done");
    await task("t-review", "build", "doing");
    await task("t-describe", "describe");
    // Moved before any lead existed: the dispatch says "needs a lead agent".
    await moveTaskStage(sql, { taskId: "t-build", to: "build", now: NOW, actor: { kind: "staff", id: "staff-1" } });
    await moveTaskStage(sql, { taskId: "t-run", to: "run", now: NOW, actor: { kind: "staff", id: "staff-1" } });
    await moveTaskStage(sql, { taskId: "t-review", to: "review", now: NOW, actor: { kind: "staff", id: "staff-1" } });
    expect((await dispatches()).map((row) => row.to)).toEqual([null, null]);

    const made = await registerClientAgent(sql, { agentId: "acme-lead", organizationId: "org-1", role: "lead", actor: "client-services", now: NOW + 1 });
    expect(made.ok && [...(made.handedOver ?? [])].sort()).toEqual(["t-build", "t-run"]);
    const sent = (await dispatches()).slice(2).sort((a, b) => a.task_id.localeCompare(b.task_id));
    expect(sent).toEqual([
      expect.objectContaining({ task_id: "t-build", to: "acme-lead", reason: "build" }),
      expect.objectContaining({ task_id: "t-run", to: "acme-lead", reason: "run" }),
    ]);
    const again = await handOverWaitingTasks(sql, { organizationId: "org-1", actor: { kind: "staff", id: "staff-1" }, now: NOW + 2 });
    expect(again).toEqual({ leadAgentId: "acme-lead", taskIds: [] });
  });

  it("a hire assignment, or legacy mode, hands over nothing", async () => {
    await task("t-build", "build", "doing");
    await registerClientAgent(sql, { agentId: "acme-lead", organizationId: "org-1", role: "lead", actor: "cs", now: NOW });
    expect(await dispatches()).toEqual([]);
    process.env.AGENT_MODE = "agents";
    const hire = await registerClientAgent(sql, { agentId: "acme-hire", organizationId: "org-1", role: "hire", actor: "cs", now: NOW + 1 });
    expect(hire).not.toHaveProperty("handedOver");
    expect(await dispatches()).toEqual([]);
  });

  it("the staff button refuses in legacy, needs a lead, then hands over", async () => {
    await task("t-build", "build", "doing");
    expect(await staffHandOverWaiting(sql, staffCaller as never, { organizationId: "org-1", now: NOW })).toMatchObject({ ok: false });
    process.env.AGENT_MODE = "agents";
    expect(await staffHandOverWaiting(sql, staffCaller as never, { organizationId: "org-1", now: NOW })).toMatchObject({
      ok: false,
      error: "This client has no lead agent. Assign one first.",
    });
    delete process.env.AGENT_MODE;
    await registerClientAgent(sql, { agentId: "acme-lead", organizationId: "org-1", role: "lead", actor: "cs", now: NOW });
    process.env.AGENT_MODE = "agents";
    const handed = await staffHandOverWaiting(sql, staffCaller as never, { organizationId: "org-1", now: NOW + 1 });
    expect(handed).toMatchObject({ ok: true, message: "Handed 1 waiting task to acme-lead." });
  });
});
