import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { createProject } from "@/db/crm";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { GET as boardGet } from "@/app/api/agent-board/route";
import { POST as boardCreatePost } from "@/app/api/agent-board/tasks/route";
import { POST as boardTaskPost } from "@/app/api/agent-board/tasks/[taskId]/route";
import { GET as projectsGet, POST as projectsPost } from "@/app/api/agent-projects/route";
import { GET as csProjectsGet } from "@/app/api/client-services/projects/route";
import { POST as agentWorkPost } from "@/app/api/agent-work/route";
import { assignTaskAgent, createAgentTask, parseBoardAction, updateAgentTask } from "./agent-board";
import { handOverWaitingTasks, listAgentDispatches } from "./agent-dispatch";
import { createAgentProject, listAgentProjects } from "./agent-projects";
import { agentForToken, endAssignment, fileAgentWork, registerClientAgent } from "./agent-work-filing";
import { localObjectStore } from "./store/objects";
import { decideReview } from "./task-review";
import { moveTaskStage } from "./task-stage";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const staffCaller: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
let sql: Sql;
let d1: D1Like;
let root: string;

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
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)", [NOW]);
  root = mkdtempSync(path.join(tmpdir(), "agent-projects-"));
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.AGENT_MODE = "agents";
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  delete process.env.CLIENT_SERVICES_TOKEN;
  delete process.env.HANDOFF_OBJECT_PATH;
});

async function org(name: string, domain: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, name, domain, NOW, NOW]);
  return id;
}

async function project(organizationId: string, name: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)", [id, organizationId, name, NOW, NOW]);
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

async function agent(organizationId: string, agentId: string, role: "lead" | "hire" = "lead") {
  const made = await registerClientAgent(sql, { agentId, label: agentId, organizationId, role, actor: "test", now: NOW });
  if (!made.ok) throw new Error("register failed");
  const token = made.token as string;
  const principal = await agentForToken(sql, `Bearer ${token}`);
  if (!principal) throw new Error("token failed");
  return { token, principal };
}

/** Acme with a Website project and space, a lead, and a hire. Other client with its own lead. */
async function setup() {
  const acme = await org("Acme", "acme.example");
  const site = await project(acme, "Website");
  const siteSpace = await space(acme, "acme-example", site);
  const lead = await agent(acme, "acme-lead", "lead");
  const hire = await agent(acme, "acme-writer", "hire");
  const other = await org("Other", "other.example");
  await space(other, "other-example", await project(other, "Shop"));
  const otherLead = await agent(other, "other-lead", "lead");
  return { acme, site, siteSpace, lead, hire, other, otherLead };
}

function bearer(token: string, init: RequestInit = {}): RequestInit {
  return { ...init, headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) } };
}

async function dispatchesTo(agentId: string): Promise<{ task_id: string; reason: string; fallback: boolean | null }[]> {
  const rows = await sql.all<{ data_json: string }>(
    "SELECT data_json FROM activities WHERE kind = 'client_agent.dispatch' AND json_extract(data_json, '$.to') = ? ORDER BY created_at, rowid",
    [agentId],
  );
  return rows.map((row) => {
    const data = JSON.parse(row.data_json) as { task_id: string; reason: string; fallback?: boolean };
    return { task_id: data.task_id, reason: data.reason, fallback: data.fallback ?? null };
  });
}

describe("migration 0031", () => {
  it("adds tasks.assignee_agent_id and its index, and a re-run is a no-op", async () => {
    const columns = await sql.all<{ name: string }>("PRAGMA table_info(tasks)");
    expect(columns.some((column) => column.name === "assignee_agent_id")).toBe(true);
    const index = await sql.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'tasks_agent_assignee'");
    expect(index?.name).toBe("tasks_agent_assignee");
    await migrate(sql);
    const again = await sql.all<{ name: string }>("PRAGMA table_info(tasks)");
    expect(again.filter((column) => column.name === "assignee_agent_id")).toHaveLength(1);
  });
});

describe("card assignment", () => {
  it("a lead creates a card for a hire on the same client; another client's agent is a 400", async () => {
    const { lead } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Write the FAQ", assignee: "acme-writer", now: NOW });
    expect(made).toMatchObject({ ok: true, task: { assignee_agent_id: "acme-writer" } });
    const foreign = await createAgentTask(sql, lead.principal, { title: "Nope", assignee: "other-lead", now: NOW });
    expect(foreign).toMatchObject({ ok: false, status: 400 });
    const unknown = await createAgentTask(sql, lead.principal, { title: "Nope", assignee: "ghost-agent", now: NOW });
    expect(unknown).toMatchObject({ ok: false, status: 400 });
    const plain = await createAgentTask(sql, lead.principal, { title: "Lead's own", now: NOW });
    expect(plain).toMatchObject({ ok: true, task: { assignee_agent_id: null } });
  });

  it("a hire's cards default to itself, and a hire can't assign a card to someone else", async () => {
    const { hire } = await setup();
    const own = await createAgentTask(sql, hire.principal, { title: "My draft", now: NOW });
    expect(own).toMatchObject({ ok: true, task: { assignee_agent_id: "acme-writer" } });
    const toLead = await createAgentTask(sql, hire.principal, { title: "For the lead", assignee: "acme-lead", now: NOW });
    expect(toLead).toMatchObject({ ok: false, status: 403 });
  });

  it("the assign action is lead only, checks the target's client, and logs to the board feed", async () => {
    const { lead, hire } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Hero copy", now: NOW });
    if (!made.ok) throw new Error("setup");
    expect(parseBoardAction({ action: "assign", to: "Acme-Writer" })).toEqual({ action: "assign", to: "acme-writer" });
    expect(parseBoardAction({ action: "assign", to: null })).toEqual({ action: "assign", to: null });
    expect(parseBoardAction({ action: "assign", to: "lead" })).toEqual({ action: "assign", to: null });

    const byHire = await updateAgentTask(sql, hire.principal, { taskId: made.task.id, change: { action: "assign", to: "acme-writer" }, now: NOW + 1 });
    expect(byHire).toMatchObject({ ok: false, status: 403 });
    const foreign = await updateAgentTask(sql, lead.principal, { taskId: made.task.id, change: { action: "assign", to: "other-lead" }, now: NOW + 1 });
    expect(foreign).toMatchObject({ ok: false, status: 400 });
    const assigned = await updateAgentTask(sql, lead.principal, { taskId: made.task.id, change: { action: "assign", to: "acme-writer" }, now: NOW + 2 });
    expect(assigned).toMatchObject({ ok: true, task: { assignee_agent_id: "acme-writer" } });
    const logged = await sql.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM activities WHERE kind = 'client_agent.board' AND json_extract(data_json, '$.action') = 'assign'",
    );
    expect(logged?.n).toBe(1);
    const back = await updateAgentTask(sql, lead.principal, { taskId: made.task.id, change: { action: "assign", to: null }, now: NOW + 3 });
    expect(back).toMatchObject({ ok: true, task: { assignee_agent_id: null } });
  });

  it("GET /api/agent-board?mine=1 returns only this agent's cards; POST /tasks takes assignee", async () => {
    const { lead, hire } = await setup();
    const created = await boardCreatePost(
      new Request("https://hq.example/api/agent-board/tasks", bearer(lead.token, { method: "POST", body: JSON.stringify({ title: "Blog post", assignee: "acme-writer" }) })),
    );
    expect(created.status).toBe(201);
    await boardCreatePost(new Request("https://hq.example/api/agent-board/tasks", bearer(lead.token, { method: "POST", body: JSON.stringify({ title: "Lead card" }) })));
    const bad = await boardCreatePost(
      new Request("https://hq.example/api/agent-board/tasks", bearer(lead.token, { method: "POST", body: JSON.stringify({ title: "x", assignee: "other-lead" }) })),
    );
    expect(bad.status).toBe(400);

    const mine = await boardGet(new Request("https://hq.example/api/agent-board?mine=1", bearer(hire.token)));
    const mineBody = (await mine.json()) as { tasks: { title: string; assignee_agent_id: string | null }[] };
    expect(mineBody.tasks.map((task) => task.title)).toEqual(["Blog post"]);
    const all = await boardGet(new Request("https://hq.example/api/agent-board", bearer(hire.token)));
    expect(((await all.json()) as { tasks: unknown[] }).tasks).toHaveLength(2);
    const leadMine = await boardGet(new Request("https://hq.example/api/agent-board?mine=1", bearer(lead.token)));
    expect(((await leadMine.json()) as { tasks: unknown[] }).tasks).toHaveLength(0);
  });
});

describe("hand-out to the assignee", () => {
  it("moving a card to Doing hands it to its assignee, who sees it in ?dispatches=1; the lead does not", async () => {
    const { lead, hire } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Landing page", assignee: "acme-writer", now: NOW });
    if (!made.ok) throw new Error("setup");
    const moved = await updateAgentTask(sql, lead.principal, { taskId: made.task.id, change: { action: "move", to: "doing" }, now: NOW + 1 });
    expect(moved).toMatchObject({ ok: true, handedTo: "acme-writer" });
    expect((await listAgentDispatches(sql, hire.principal)).map((row) => row.task_id)).toEqual([made.task.id]);
    expect(await listAgentDispatches(sql, lead.principal)).toEqual([]);
  });

  it("falls back to the lead when the assignee was unassigned or revoked", async () => {
    const { acme, lead } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Pricing page", assignee: "acme-writer", now: NOW });
    if (!made.ok) throw new Error("setup");
    await endAssignment(sql, { agentId: "acme-writer", organizationId: acme, actor: "test", now: NOW + 1 });
    const moved = await moveTaskStage(sql, { taskId: made.task.id, to: "doing", now: NOW + 2, actor: { kind: "staff", id: "staff-1" } });
    expect(moved).toMatchObject({ ok: true, handedTo: "acme-lead" });
    expect(await dispatchesTo("acme-lead")).toEqual([{ task_id: made.task.id, reason: "build", fallback: true }]);
    const body = await sql.get<{ body: string }>("SELECT body FROM activities WHERE kind = 'client_agent.dispatch' ORDER BY created_at DESC LIMIT 1");
    expect(body?.body).toContain("acme-writer is no longer on this client");
  });

  it("Client Services sending a card back hands the changes to its assignee", async () => {
    const { lead, hire } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "About page", assignee: "acme-writer", stage: "doing", now: NOW });
    if (!made.ok) throw new Error("setup");
    await updateAgentTask(sql, hire.principal, { taskId: made.task.id, change: { action: "review", note: "Draft ready" }, now: NOW + 1 });
    const back = await decideReview(sql, { taskId: made.task.id, decision: "progress", note: "Shorter intro", now: NOW + 2, actor: { kind: "system", id: "client-services" } });
    expect(back).toMatchObject({ ok: true, handedTo: "acme-writer" });
    expect((await dispatchesTo("acme-writer")).map((row) => row.reason)).toEqual(["changes"]);
  });

  it("assigning a card already in Doing hands it to the new owner; hand-over on lead assignment skips it", async () => {
    const { acme, lead } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Menu", now: NOW });
    if (!made.ok) throw new Error("setup");
    await updateAgentTask(sql, lead.principal, { taskId: made.task.id, change: { action: "move", to: "doing" }, now: NOW + 1 });
    expect(await dispatchesTo("acme-lead")).toHaveLength(1);
    const assigned = await assignTaskAgent(sql, { taskId: made.task.id, to: "acme-writer", actor: { kind: "staff", id: "staff-1" }, now: NOW + 2 });
    expect(assigned).toMatchObject({ ok: true, assignee: "acme-writer", handedTo: "acme-writer" });
    expect(await dispatchesTo("acme-writer")).toHaveLength(1);
    const handed = await handOverWaitingTasks(sql, { organizationId: acme, actor: { kind: "system", id: "test" }, now: NOW + 3 });
    expect(handed).toEqual({ leadAgentId: "acme-lead", taskIds: [] });
    expect(await dispatchesTo("acme-lead")).toHaveLength(1);
  });
});

describe("handoff of filed work", () => {
  it("handoff.to must be an agent on the same client: a clear 400, not a 500", async () => {
    const { lead } = await setup();
    process.env.HANDOFF_OBJECT_PATH = root;
    const post = (handoff: unknown, id: string) =>
      agentWorkPost(
        new Request(
          "https://hq.example/api/agent-work",
          bearer(lead.token, { method: "POST", body: JSON.stringify({ external_id: id, title: "Notes", kind: "note", content: "Hello", handoff }) }),
        ),
      );
    const foreign = await post({ to: "other-lead" }, "w1");
    expect(foreign.status).toBe(400);
    expect(((await foreign.json()) as { error: string }).error).toContain("not an agent assigned to this client");
    expect((await post({ to: "no-such-agent" }, "w2")).status).toBe(400);
    const ok = await fileAgentWork(sql, localObjectStore(root), lead.principal, { external_id: "w3", title: "Notes", kind: "note", content: "Hi", handoff: { to: "acme-writer" } }, NOW);
    expect(ok).toMatchObject({ ok: true, state: "filed", handoffTo: "acme-writer" });
  });
});

describe("agent projects", () => {
  it("lists projects only for this agent's clients, each with its space", async () => {
    const { lead, site, siteSpace, acme } = await setup();
    const listed = await listAgentProjects(sql, lead.principal, {});
    expect(listed).toMatchObject({ ok: true, projects: [{ id: site, name: "Website", open: true, space: { id: siteSpace, slug: "acme-example" } }] });
    const foreign = await listAgentProjects(sql, lead.principal, { client: { domain: "other.example" } });
    expect(foreign).toMatchObject({ ok: false, status: 403 });
    const response = await projectsGet(new Request(`https://hq.example/api/agent-projects?client=${acme}`, bearer(lead.token)));
    expect(response.status).toBe(200);
    expect(((await response.json()) as { projects: unknown[] }).projects).toHaveLength(1);
  });

  it("a lead opens a project with its own new space; a duplicate name returns the existing one", async () => {
    const { lead, acme, siteSpace } = await setup();
    const response = await projectsPost(
      new Request("https://hq.example/api/agent-projects", bearer(lead.token, { method: "POST", body: JSON.stringify({ name: "Spring Promo", description: "Ads + page" }) })),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { created: boolean; project: { id: string; space: { id: string; slug: string } | null } };
    expect(body.created).toBe(true);
    expect(body.project.space).not.toBeNull();
    expect(body.project.space?.id).not.toBe(siteSpace);
    expect(body.project.space?.slug).toContain("spring-promo");
    const again = await createAgentProject(sql, lead.principal, { name: "spring promo", now: NOW + 1 });
    expect(again).toMatchObject({ ok: true, created: false, project: { id: body.project.id } });
    const count = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE organization_id = ?", [acme]);
    expect(count?.n).toBe(2);
    const card = await createAgentTask(sql, lead.principal, { title: "Promo hero", projectId: body.project.id, assignee: "acme-writer", now: NOW + 2 });
    expect(card).toMatchObject({ ok: true, task: { project_id: body.project.id, assignee_agent_id: "acme-writer" } });
  });

  it("a hire gets 403, and so does a client the agent is not on", async () => {
    const { hire, lead } = await setup();
    const byHire = await projectsPost(new Request("https://hq.example/api/agent-projects", bearer(hire.token, { method: "POST", body: JSON.stringify({ name: "Side gig" }) })));
    expect(byHire.status).toBe(403);
    const elsewhere = await createAgentProject(sql, lead.principal, { client: { domain: "other.example" }, name: "Shop 2", now: NOW });
    expect(elsewhere).toMatchObject({ ok: false, status: 403 });
  });
});

describe("Client Services projects", () => {
  it("needs the Client Services token and lists projects with spaces and the client's agents", async () => {
    const { site } = await setup();
    process.env.CLIENT_SERVICES_TOKEN = "cs-test-token";
    expect((await csProjectsGet(new Request("https://hq.example/api/client-services/projects"))).status).toBe(401);
    const response = await csProjectsGet(new Request("https://hq.example/api/client-services/projects?client=acme.example", { headers: { authorization: "Bearer cs-test-token" } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { projects: { id: string; space: unknown }[]; clients: { agents: { id: string; role: string }[] }[] };
    expect(body.projects.map((row) => row.id)).toEqual([site]);
    expect(body.clients[0].agents).toEqual([
      { id: "acme-lead", label: "acme-lead", role: "lead" },
      { id: "acme-writer", label: "acme-writer", role: "hire" },
    ]);
    const all = await csProjectsGet(new Request("https://hq.example/api/client-services/projects", { headers: { authorization: "Bearer cs-test-token" } }));
    expect(((await all.json()) as { projects: unknown[] }).projects).toHaveLength(2);
  });
});

describe("staff projects", () => {
  it("a second staff-created project gets its own space instead of filing into the first one's", async () => {
    const { acme, siteSpace } = await setup();
    const made = await createProject(sql, staffCaller, { organizationId: acme, name: "Brand refresh" }, NOW + 1);
    if (!made.ok) throw new Error("project");
    const spaces = await sql.all<{ id: string; slug: string }>("SELECT id, slug FROM workspaces WHERE project_id = ? AND status = 'active'", [made.value.id]);
    expect(spaces).toHaveLength(1);
    expect(spaces[0].id).not.toBe(siteSpace);
    expect(spaces[0].slug).toContain("brand-refresh");
    // A client with no space at all still gets none (its first intake opens one).
    const fresh = await org("Fresh", "fresh.example");
    const first = await createProject(sql, staffCaller, { organizationId: fresh, name: "Site" }, NOW + 2);
    if (!first.ok) throw new Error("project");
    expect(await sql.get("SELECT id FROM workspaces WHERE organization_id = ?", [fresh])).toBeUndefined();
  });
});

describe("board action route", () => {
  it("POST /api/agent-board/tasks/:id with assign returns 403 for a hire and 200 for the lead", async () => {
    const { lead, hire } = await setup();
    const made = await createAgentTask(sql, lead.principal, { title: "Route card", now: NOW });
    if (!made.ok) throw new Error("setup");
    const context = { params: Promise.resolve({ taskId: made.task.id }) };
    const byHire = await boardTaskPost(
      new Request("https://hq.example/x", bearer(hire.token, { method: "POST", body: JSON.stringify({ action: "assign", to: "acme-writer" }) })),
      context,
    );
    expect(byHire.status).toBe(403);
    const byLead = await boardTaskPost(
      new Request("https://hq.example/x", bearer(lead.token, { method: "POST", body: JSON.stringify({ action: "assign", to: "acme-writer" }) })),
      { params: Promise.resolve({ taskId: made.task.id }) },
    );
    expect(byLead.status).toBe(200);
    expect(((await byLead.json()) as { task: { assignee_agent_id: string } }).task.assignee_agent_id).toBe("acme-writer");
  });
});
