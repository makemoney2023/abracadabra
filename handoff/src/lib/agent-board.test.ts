import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { POST as boardTaskPost } from "@/app/api/agent-board/tasks/[taskId]/route";
import * as boardTaskRoute from "@/app/api/agent-board/tasks/[taskId]/route";
import { POST as boardCreatePost } from "@/app/api/agent-board/tasks/route";
import { GET as boardGet } from "@/app/api/agent-board/route";
import { createAgentTask, listAgentBoard, parseBoardAction, updateAgentTask } from "./agent-board";
import { leadAgentFor } from "./agent-dispatch";
import { agentMode, LegacyStartsDisabled } from "./agent-mode";
import { agentForToken, registerClientAgent } from "./agent-work-filing";
import { listClientUpdates } from "./client-work";
import { claimDueWorkflow } from "./client-workflows";
import { retryCappedBuilds, startBuild, startRevision, type BuildDeps } from "./cursor-build";
import { runLeadSwarm } from "./lead-swarm";
import { moveTaskStage } from "./task-stage";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
let sql: Sql;
let d1: D1Like;

function d1Over(db: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      const stmt = db.prepare(statement);
      const args = params as never[];
      return {
        run: async () => stmt.run(...args),
        all: async <T>() => ({ results: stmt.all(...args) as T[] }),
        first: async <T>() => (stmt.get(...args) as T | undefined) ?? null,
        stmt,
        args,
      };
    },
  });
  return {
    prepare,
    exec: async (statement: string) => db.exec(statement),
    batch: async (statements: unknown[]) => {
      db.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  vi.restoreAllMocks();
});

async function org(name: string, domain: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, domain, NOW, NOW]);
  return id;
}

async function project(organizationId: string, name: string, status = "active"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [id, organizationId, name, status, NOW, NOW]);
  return id;
}

async function space(organizationId: string, slug: string, projectId: string | null): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [id, slug, slug, slug, NOW, organizationId, projectId],
  );
  return id;
}

async function task(organizationId: string, projectId: string | null, title: string, extra: { stage?: string; status?: string; deliverableId?: string } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, created_by_kind, round, position, deliverable_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 'staff', 1, 0, ?)`,
    [id, projectId, organizationId, title, extra.status ?? "todo", NOW, NOW, extra.stage ?? "describe", extra.deliverableId ?? null],
  );
  return id;
}

async function agent(organizationId: string, agentId: string, role: "lead" | "hire" = "lead") {
  const made = await registerClientAgent(sql, { agentId, label: agentId, organizationId, role, actor: "test", now: NOW });
  if (!made.ok) throw new Error("register failed");
  const token = made.token as string;
  const principal = await agentForToken(sql, `Bearer ${token}`);
  if (!principal) throw new Error("token failed");
  return { token, principal };
}

async function client() {
  const acme = await org("Acme", "acme.example");
  const site = await project(acme, "Website");
  await space(acme, "acme-example", site);
  return { acme, site };
}

function deps(fetchImpl: typeof fetch): BuildDeps {
  return { fetch: fetchImpl, cursorKey: "test-key", put: async () => "key", now: NOW };
}

async function feed() {
  const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
  if (!Array.isArray(updates)) throw new Error("bad feed");
  return updates;
}

async function kinds(kind: string) {
  return sql.all<{ data_json: string; body: string }>("SELECT data_json, body FROM activities WHERE kind = ?", [kind]);
}

describe("AGENT_MODE flag", () => {
  it("defaults to legacy, and only 'agents' flips it", () => {
    expect(agentMode()).toBe("legacy");
    process.env.AGENT_MODE = "nonsense";
    expect(agentMode()).toBe("legacy");
    process.env.AGENT_MODE = " Agents ";
    expect(agentMode()).toBe("agents");
    delete process.env.AGENT_MODE;
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { AGENT_MODE: "agents" } };
    expect(agentMode()).toBe("agents");
  });

  it("legacy: a swarm start reaches the swarm; agents: it is refused before any call", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    await expect(runLeadSwarm({ origin: "https://hq.example", workflowId: "w1", brief: "Plan", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalled();
    fetchImpl.mockClear();
    process.env.AGENT_MODE = "agents";
    await expect(runLeadSwarm({ origin: "https://hq.example", workflowId: "w1", brief: "Plan", fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(LegacyStartsDisabled);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("agents: workflow claims and Cursor build starts and retries are refused", async () => {
    const { acme, site } = await client();
    const id = await task(acme, site, "Homepage", { stage: "build" });
    const fetchImpl = vi.fn(async () => new Response("{}"));
    process.env.AGENT_MODE = "agents";
    expect(await claimDueWorkflow({ sql, organizationId: acme, origin: "https://hq.example", now: NOW })).toEqual({ ok: false, error: "invalid" });
    expect(await startBuild(sql, id, deps(fetchImpl as unknown as typeof fetch))).toEqual({ ok: false, reason: "agent_mode" });
    await retryCappedBuilds(sql, deps(fetchImpl as unknown as typeof fetch));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("legacy: a board move to build still goes through the Cursor gate, with no dispatch", async () => {
    const { acme, site } = await client();
    await agent(acme, "acme-lead");
    const id = await task(acme, site, "Homepage", { stage: "engineer" });
    const fetchImpl = vi.fn(async () => new Response("{}"));
    const moved = await moveTaskStage(sql, { taskId: id, to: "build", now: NOW, actor: { kind: "staff", id: "u1" }, build: deps(fetchImpl as unknown as typeof fetch) });
    expect(moved.ok && moved.handedTo).toBeFalsy();
    expect(await kinds("client_agent.dispatch")).toHaveLength(0);
  });

  it("agents: board build and run hand the task to the lead agent and post to the feed", async () => {
    const { acme, site } = await client();
    const { principal: hire } = await agent(acme, "acme-hire", "hire");
    const { token: leadToken } = await agent(acme, "acme-lead");
    expect(hire.agentId).toBe("acme-hire");
    expect(await leadAgentFor(sql, acme)).toBe("acme-lead");
    const build = await task(acme, site, "Homepage", { stage: "engineer" });
    const run = await task(acme, site, "Weekly posts", { stage: "engineer" });
    const fetchImpl = vi.fn(async () => new Response("{}"));
    process.env.AGENT_MODE = "agents";
    const built = await moveTaskStage(sql, { taskId: build, to: "build", now: NOW, actor: { kind: "staff", id: "u1" }, build: deps(fetchImpl as unknown as typeof fetch) });
    expect(built).toMatchObject({ ok: true, column: "doing", stage: "build", status: "doing", handedTo: "acme-lead" });
    const ran = await moveTaskStage(sql, { taskId: run, to: "run", now: NOW + 1, actor: { kind: "staff", id: "u1" }, swarm: { origin: "https://hq.example", fetchImpl: fetchImpl as unknown as typeof fetch } });
    expect(ran).toMatchObject({ ok: true, column: "doing", stage: "run", handedTo: "acme-lead" });
    expect(fetchImpl).not.toHaveBeenCalled();
    const dispatches = (await feed()).filter((update) => update.kind === "client_agent.dispatch");
    expect(dispatches).toHaveLength(2);
    const lead = await agentForToken(sql, `Bearer ${leadToken}`);
    const { listAgentDispatches } = await import("./agent-dispatch");
    expect((await listAgentDispatches(sql, lead!)).map((row) => row.reason).sort()).toEqual(["build", "run"]);
  });

  it("agents: with no lead agent the dispatch says Client Services must assign one", async () => {
    const { acme, site } = await client();
    const id = await task(acme, site, "Homepage", { stage: "engineer" });
    process.env.AGENT_MODE = "agents";
    const moved = await moveTaskStage(sql, { taskId: id, to: "build", now: NOW, actor: { kind: "staff", id: "u1" } });
    expect(moved).toMatchObject({ ok: true, handedTo: null });
    expect((await kinds("client_agent.dispatch"))[0]?.body).toContain("needs a lead agent");
  });

  async function changesRequested() {
    const { acme, site } = await client();
    const ws = (await sql.get<{ id: string }>("SELECT id FROM workspaces WHERE organization_id = ?", [acme]))!.id;
    const deliverable = crypto.randomUUID();
    await sql.run(
      `INSERT INTO deliverables (id, organization_id, project_id, workspace_id, title, kind, status, actor_kind, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Homepage', 'website', 'changes_requested', 'staff', ?, ?)`,
      [deliverable, acme, site, ws, NOW, NOW],
    );
    await task(acme, site, "Homepage", { stage: "build", status: "done", deliverableId: deliverable });
    await agent(acme, "acme-lead");
    return deliverable;
  }

  it("legacy: a client's ask for changes wakes the HQ agent as before", async () => {
    const deliverable = await changesRequested();
    const wake = vi.fn(async () => undefined);
    expect(await startRevision(sql, deliverable, NOW, wake)).toBeTruthy();
    expect(wake).toHaveBeenCalledWith(expect.any(String), "changes_requested");
    expect(await kinds("client_agent.dispatch")).toHaveLength(0);
  });

  it("agents: a client's ask for changes goes to the lead agent instead", async () => {
    const deliverable = await changesRequested();
    const wake = vi.fn(async () => undefined);
    process.env.AGENT_MODE = "agents";
    expect(await startRevision(sql, deliverable, NOW, wake)).toBeTruthy();
    expect(wake).not.toHaveBeenCalled();
    const [row] = await kinds("client_agent.dispatch");
    expect(JSON.parse(row!.data_json)).toMatchObject({ reason: "changes", to: "acme-lead", deliverable_id: deliverable });
  });
});

describe("agent board updates", () => {
  it("lists only the agent's clients' tasks", async () => {
    const { acme, site } = await client();
    const other = await org("Other", "other.example");
    await task(other, await project(other, "Other site"), "Not yours");
    await task(acme, site, "Homepage");
    const { principal } = await agent(acme, "acme-lead");
    const board = await listAgentBoard(sql, principal, {});
    expect(board.ok && board.tasks.map((row) => row.title)).toEqual(["Homepage"]);
    expect((await listAgentBoard(sql, principal, { client: { domain: "other.example" } })).ok).toBe(false);
  });

  it("starts, blocks with a reason, asks for review, notes, and moves; each lands on the timeline and the feed", async () => {
    const { acme, site } = await client();
    const id = await task(acme, site, "Homepage");
    const { principal } = await agent(acme, "acme-hire", "hire");
    const step = async (change: unknown, at: number) => {
      const parsed = parseBoardAction(change);
      if (!parsed) throw new Error("bad action");
      const result = await updateAgentTask(sql, principal, { taskId: id, change: parsed, now: NOW + at });
      if (!result.ok) throw new Error(result.message);
      return result.task;
    };
    expect((await step({ action: "start" }, 1)).status).toBe("doing");
    const blocked = await step({ action: "block", reason: "Waiting on the logo files" }, 2);
    expect(blocked).toMatchObject({ status: "blocked", blocked_reason: "Waiting on the logo files" });
    await step({ action: "note", body: "Used the spring palette." }, 3);
    expect(await step({ action: "move", to: "describe" }, 4)).toMatchObject({ column: "todo", stage: "describe" });
    expect((await step({ action: "move", to: "done" }, 5)).column).toBe("done");
    const second = await task(acme, site, "About page");
    const reviewed = await updateAgentTask(sql, principal, { taskId: second, change: parseBoardAction({ action: "review", note: "Draft is in the space." })!, now: NOW + 6 });
    expect(reviewed).toMatchObject({ ok: true, task: { column: "review", status: "doing" } });
    const timeline = await kinds("client_agent.board");
    expect(timeline.map((row) => JSON.parse(row.data_json).action)).toEqual(["start", "block", "note", "move", "move", "review"]);
    const moves = timeline.filter((row) => JSON.parse(row.data_json).action === "move").map((row) => JSON.parse(row.data_json));
    expect(moves.map((data) => [data.to, data.asked ?? null])).toEqual([["todo", "describe"], ["done", null]]);
    expect(timeline.find((row) => JSON.parse(row.data_json).to === "todo")?.body).toContain("to To do.");
    const posted = (await feed()).filter((update) => update.kind === "client_agent.board");
    expect(posted).toHaveLength(6);
    expect(posted.some((update) => update.summary.includes("Waiting on the logo files"))).toBe(true);
    expect(posted.some((update) => update.summary.includes("ready for review"))).toBe(true);
  });

  it("move takes todo, doing, review, and done, and the old stage names as aliases", () => {
    expect(parseBoardAction({ action: "move", to: "todo" })).toEqual({ action: "move", to: "todo" });
    expect(parseBoardAction({ action: "move", to: "Doing" })).toEqual({ action: "move", to: "doing" });
    expect(parseBoardAction({ action: "move", to: "describe" })).toEqual({ action: "move", to: "todo", asked: "describe" });
    for (const old of ["engineer", "build", "run"]) {
      expect(parseBoardAction({ action: "move", to: old })).toEqual({ action: "move", to: "doing", asked: old });
    }
    expect(parseBoardAction({ action: "move", to: "review" })).toEqual({ action: "move", to: "review" });
    expect(parseBoardAction({ action: "move", to: "done" })).toEqual({ action: "move", to: "done" });
  });

  it("refuses moves into Doing in legacy mode, and in agents mode stores build and hands it to the lead agent", async () => {
    const { acme, site } = await client();
    const id = await task(acme, site, "Homepage");
    const { principal } = await agent(acme, "acme-lead");
    for (const to of ["doing", "build", "run", "engineer"]) {
      const refused = await updateAgentTask(sql, principal, { taskId: id, change: parseBoardAction({ action: "move", to })!, now: NOW });
      expect(refused).toMatchObject({ ok: false, status: 403 });
    }
    process.env.AGENT_MODE = "agents";
    const moved = await updateAgentTask(sql, principal, { taskId: id, change: parseBoardAction({ action: "move", to: "doing" })!, now: NOW });
    expect(moved).toMatchObject({ ok: true, handedTo: "acme-lead", task: { column: "doing", stage: "build" } });
    // Already in Doing: run (an alias of doing) changes nothing and hands nothing over again.
    const again = await updateAgentTask(sql, principal, { taskId: id, change: parseBoardAction({ action: "move", to: "run" })!, now: NOW + 1 });
    expect(again).toMatchObject({ ok: true, task: { column: "doing", stage: "build" } });
    expect(await kinds("client_agent.dispatch")).toHaveLength(1);
  });

  it("cannot touch another client's task, and rejects unknown actions such as delete", async () => {
    await client();
    const other = await org("Other", "other.example");
    const foreign = await task(other, await project(other, "Other site"), "Not yours");
    const acme = (await sql.get<{ id: string }>("SELECT id FROM organizations WHERE domain = 'acme.example'"))!.id;
    const { principal } = await agent(acme, "acme-lead");
    expect(await updateAgentTask(sql, principal, { taskId: foreign, change: { action: "start" }, now: NOW })).toMatchObject({ ok: false, status: 404 });
    expect(parseBoardAction({ action: "delete" })).toBeNull();
    expect(parseBoardAction({ action: "block" })).toBeNull();
    expect(parseBoardAction({ action: "move", to: "trash" })).toBeNull();
    expect("DELETE" in boardTaskRoute).toBe(false);
  });

  it("creates a task in the client's only open project, and asks which project when there are several", async () => {
    const { acme, site } = await client();
    const { principal } = await agent(acme, "acme-lead");
    const made = await createAgentTask(sql, principal, { title: "Write FAQ", note: "From the kickoff call.", now: NOW });
    expect(made).toMatchObject({ ok: true, task: { project_id: site, column: "todo", stage: "describe", status: "todo" } });
    const row = await sql.get<{ created_by_kind: string }>("SELECT created_by_kind FROM tasks WHERE title = 'Write FAQ'");
    expect(row?.created_by_kind).toBe("agent");
    expect((await feed()).some((update) => update.kind === "client_agent.board" && update.summary.includes("Write FAQ"))).toBe(true);
    const second = await project(acme, "Socials");
    expect(await createAgentTask(sql, principal, { title: "Plan posts", now: NOW })).toMatchObject({ ok: false, status: 400 });
    expect(await createAgentTask(sql, principal, { title: "Plan posts", projectId: second, stage: "engineer", now: NOW })).toMatchObject({ ok: true, task: { project_id: second, column: "doing", stage: "engineer" } });
    expect(await createAgentTask(sql, principal, { title: "Plan reels", projectId: second, stage: "doing", now: NOW })).toMatchObject({ ok: true, task: { column: "doing", stage: "engineer" } });
    expect(await createAgentTask(sql, principal, { title: "Plan stories", projectId: second, stage: "todo", now: NOW })).toMatchObject({ ok: true, task: { column: "todo", stage: "describe" } });
    expect(await createAgentTask(sql, principal, { title: "Plan posts", projectId: second, stage: "done", now: NOW })).toMatchObject({ ok: false, status: 400 });
    const other = await org("Other", "other.example");
    expect(await createAgentTask(sql, principal, { title: "Sneaky", projectId: await project(other, "Theirs"), now: NOW })).toMatchObject({ ok: false, status: 403 });
  });

  it("routes need the agent token", async () => {
    const { acme, site } = await client();
    const id = await task(acme, site, "Homepage");
    const { token } = await agent(acme, "acme-lead");
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };
    expect((await boardGet(new Request("https://hq.example/api/agent-board"))).status).toBe(401);
    const listed = await boardGet(new Request("https://hq.example/api/agent-board?client=acme.example", { headers: auth }));
    expect(((await listed.json()) as { tasks: unknown[] }).tasks).toHaveLength(1);
    const update = await boardTaskPost(
      new Request(`https://hq.example/api/agent-board/tasks/${id}`, { method: "POST", headers: auth, body: JSON.stringify({ action: "block", reason: "Need copy" }) }),
      { params: Promise.resolve({ taskId: id }) },
    );
    expect(update.status).toBe(200);
    const bad = await boardTaskPost(
      new Request(`https://hq.example/api/agent-board/tasks/${id}`, { method: "POST", headers: auth, body: JSON.stringify({ action: "delete" }) }),
      { params: Promise.resolve({ taskId: id }) },
    );
    expect(bad.status).toBe(400);
    const created = await boardCreatePost(
      new Request("https://hq.example/api/agent-board/tasks", { method: "POST", headers: auth, body: JSON.stringify({ title: "Write FAQ" }) }),
    );
    expect(created.status).toBe(201);
  });
});
