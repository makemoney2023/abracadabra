import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as agentWorkGet, POST as agentWorkPost } from "@/app/api/agent-work/route";
import { GET as agentWorkItemGet } from "@/app/api/agent-work/[id]/route";
import { GET as agentSkillsGet } from "@/app/api/agent-skills/route";
import { GET as agentSkillGet } from "@/app/api/agent-skills/[...path]/route";
import { POST as skillGrantsPost } from "@/app/api/client-services/skill-grants/route";
import { cleanSkillPrefix, grantSkills, listAgentSkills, readAgentSkill } from "./agent-skills";
import { POST as agentsPost } from "@/app/api/client-services/agents/route";
import { GET as reviewsGet } from "@/app/api/client-services/reviews/route";
import { POST as reviewDecide } from "@/app/api/client-services/reviews/[taskId]/route";
import { moveTaskStage } from "./task-stage";
import { decideReview } from "./task-review";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import {
  agentForToken,
  discardUnfiledWork,
  endAssignment,
  fileAgentWork,
  listAgentContext,
  readAgentContextItem,
  fileUnfiledWork,
  listUnfiledWork,
  parseWorkPayload,
  registerClientAgent,
  revokeClientAgent,
} from "./agent-work-filing";
import { listClientUpdates } from "./client-work";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");

let sql: Sql;
let d1: D1Like;
let store: ObjectStore;
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
  root = mkdtempSync(path.join(tmpdir(), "agent-work-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.CLIENT_SERVICES_TOKEN;
  delete process.env.HANDOFF_OBJECT_PATH;
  delete process.env.AGENT_MODE;
});

async function org(name: string, domain: string, kind = "client"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [id, name, domain, kind, NOW, NOW]);
  return id;
}

async function space(organizationId: string, slug: string, projectId: string | null = null, opened = NOW): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [id, slug, slug, slug, opened, organizationId, projectId],
  );
  return id;
}

async function project(organizationId: string, name: string, status = "active"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [id, organizationId, name, status, NOW, NOW]);
  return id;
}

async function agentFor(organizationId: string | null, agentId = "acme-agent", extra: { workspaceId?: string; projectId?: string } = {}) {
  const made = await registerClientAgent(sql, { agentId, label: "Acme agent", organizationId, ...extra, actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const principal = await agentForToken(sql, `Bearer ${made.token}`);
  if (!principal) throw new Error("token failed");
  return { token: made.token, principal };
}

const work = {
  external_id: "task-42",
  title: "Spring promo landing page copy",
  kind: "copy",
  summary: "Hero, three benefit blocks, and an FAQ.",
  content: "## Hero\n\nSmile with confidence this spring.",
  links: [{ label: "Pull request", url: "https://github.com/example/repo/pull/7" }],
};

describe("tokens", () => {
  it("only stores a hash, and a revoked token stops working", async () => {
    const acme = await org("Acme", "acme.example");
    const { token } = await agentFor(acme);
    const row = await sql.get<{ token_hash: string }>("SELECT token_hash FROM client_agents WHERE id = 'acme-agent'");
    expect(row?.token_hash).not.toContain(token);
    expect(token.startsWith("caw_")).toBe(true);
    expect(await agentForToken(sql, "Bearer caw_wrong_token_value_123")).toBeNull();
    await revokeClientAgent(sql, "acme-agent", NOW);
    expect(await agentForToken(sql, `Bearer ${token}`)).toBeNull();
  });

  it("re-assigning keeps the token unless rotate is set", async () => {
    const acme = await org("Acme", "acme.example");
    const { token } = await agentFor(acme);
    const again = await registerClientAgent(sql, { agentId: "acme-agent", organizationId: acme, actor: "test", now: NOW + 1 });
    expect(again).toEqual({ ok: true, created: false, token: null });
    expect(await agentForToken(sql, `Bearer ${token}`)).not.toBeNull();
    const rotated = await registerClientAgent(sql, { agentId: "acme-agent", organizationId: acme, rotate: true, actor: "test", now: NOW + 2 });
    expect(rotated.ok && rotated.token).toBeTruthy();
    expect(await agentForToken(sql, `Bearer ${token}`)).toBeNull();
  });

  it("refuses a space from another client", async () => {
    const acme = await org("Acme", "acme.example");
    const other = await org("Other", "other.example");
    const foreign = await space(other, "other-example");
    const made = await registerClientAgent(sql, { agentId: "acme-agent", organizationId: acme, workspaceId: foreign, actor: "test", now: NOW });
    expect(made.ok).toBe(false);
  });
});

describe("payload", () => {
  it("needs an id, a title, and something to file", () => {
    expect(parseWorkPayload({ title: "x", content: "y" }).ok).toBe(false);
    expect(parseWorkPayload({ external_id: "1", content: "y" }).ok).toBe(false);
    expect(parseWorkPayload({ external_id: "1", title: "x" }).ok).toBe(false);
    expect(parseWorkPayload({ external_id: "1", title: "x", links: ["http://insecure.example"] }).ok).toBe(false);
    expect(parseWorkPayload({ external_id: "1", title: "x", kind: "spaceship", content: "y" }).ok).toBe(false);
    expect(parseWorkPayload(work).ok).toBe(true);
  });
});

describe("filing", () => {
  it("files into the client's only space, with a summary file and an activity", async () => {
    const acme = await org("Acme", "acme.example");
    const spaceId = await space(acme, "acme-example");
    const { principal } = await agentFor(acme);
    const result = await fileAgentWork(sql, store, principal, work, NOW);
    expect(result).toMatchObject({ ok: true, state: "filed", duplicate: false, workspaceId: spaceId, spaceSlug: "acme-example", route: "only_space" });
    if (!result.ok || result.state !== "filed") throw new Error("not filed");
    expect(result.paths[0]).toBe("Finished work/2023-11-14 Spring promo landing page copy/summary.md");
    const file = await sql.get<{ object_key: string; status: string; workspace_id: string }>("SELECT object_key, status, workspace_id FROM files");
    expect(file?.workspace_id).toBe(spaceId);
    expect(file?.status).toBe("uploaded");
    const saved = new TextDecoder().decode((await store.read(file?.object_key ?? "")) ?? new Uint8Array());
    expect(saved).toContain("# Spring promo landing page copy");
    expect(saved).toContain("Smile with confidence");
    expect(saved).toContain("https://github.com/example/repo/pull/7");
    const batch = await sql.get<{ label: string }>("SELECT label FROM batches");
    expect(batch?.label).toBe("From Acme agent");
    const activity = await sql.get<{ kind: string; workspace_id: string; organization_id: string }>(
      "SELECT kind, workspace_id, organization_id FROM activities WHERE kind = 'client_agent.work_filed'",
    );
    expect(activity).toEqual({ kind: "client_agent.work_filed", workspace_id: spaceId, organization_id: acme });
    const item = await sql.get<{ payload_json: string | null }>("SELECT payload_json FROM agent_work_items");
    expect(item?.payload_json).toBeNull();
  });

  it("is idempotent on external_id", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { principal } = await agentFor(acme);
    const first = await fileAgentWork(sql, store, principal, work, NOW);
    const second = await fileAgentWork(sql, store, principal, work, NOW + 1000);
    expect(second).toMatchObject({ ok: true, duplicate: true, state: "filed" });
    if (first.ok && first.state === "filed" && second.ok && second.state === "filed") expect(second.paths).toEqual(first.paths);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM files"))?.n).toBe(1);
  });

  it("stores attachments next to the summary", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { principal } = await agentFor(acme);
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const result = await fileAgentWork(sql, store, principal, { ...work, attachments: [{ name: "hero.png", body: png }, { name: "faq.md", body: "Q and A" }] }, NOW);
    if (!result.ok || result.state !== "filed") throw new Error("not filed");
    expect(result.paths.map((p) => p.split("/").at(-1))).toEqual(["summary.md", "hero.png", "faq.md"]);
  });

  it("picks the project's space when the client has more than one", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-old", null, NOW - 10);
    const promo = await project(acme, "Spring promo");
    const promoSpace = await space(acme, "acme-promo", promo);
    const { principal } = await agentFor(acme);
    const result = await fileAgentWork(sql, store, principal, { ...work, project_id: promo }, NOW);
    expect(result).toMatchObject({ state: "filed", workspaceId: promoSpace, projectId: promo, route: "project" });
  });

  it("uses the space set at assignment when there are several", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-one", null, NOW - 10);
    const two = await space(acme, "acme-two");
    const { principal } = await agentFor(acme, "acme-agent", { workspaceId: two });
    const result = await fileAgentWork(sql, store, principal, work, NOW);
    expect(result).toMatchObject({ state: "filed", workspaceId: two, route: "assigned_space" });
  });

  it("follows a task to its project's space", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-old", null, NOW - 10);
    const promo = await project(acme, "Spring promo");
    const promoSpace = await space(acme, "acme-promo", promo);
    const taskId = crypto.randomUUID();
    await sql.run(
      "INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, ?, 'Copy', 'todo', ?, ?)",
      [taskId, promo, acme, NOW, NOW],
    );
    const { principal } = await agentFor(acme);
    const result = await fileAgentWork(sql, store, principal, { ...work, task_id: taskId }, NOW);
    expect(result).toMatchObject({ state: "filed", workspaceId: promoSpace, route: "task" });
  });
});

describe("never guesses", () => {
  it("an unassigned agent's work waits, with the domain match only as a suggestion", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { principal } = await agentFor(null);
    const result = await fileAgentWork(sql, store, principal, { ...work, client: { domain: "acme.example" } }, NOW);
    expect(result).toMatchObject({ ok: true, state: "unfiled", reason: "agent_not_assigned" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM files"))?.n).toBe(0);
    const inbox = await listUnfiledWork(sql, NOW);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ suggested_organization_id: acme, suggested_organization_name: "Acme", unfiled_reason: "agent_not_assigned" });
  });

  it("a payload naming another client does not move the work there", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const other = await org("Other", "other.example");
    await space(other, "other-example");
    const { principal } = await agentFor(acme);
    const byDomain = await fileAgentWork(sql, store, principal, { ...work, external_id: "a", client: { domain: "other.example" } }, NOW);
    const bySlug = await fileAgentWork(sql, store, principal, { ...work, external_id: "b", client: { space_slug: "other-example" } }, NOW);
    expect(byDomain).toMatchObject({ state: "unfiled", reason: "client_mismatch" });
    expect(bySlug).toMatchObject({ state: "unfiled", reason: "client_mismatch" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM files"))?.n).toBe(0);
  });

  it("two spaces and no hint waits as ambiguous; no space waits too", async () => {
    const acme = await org("Acme", "acme.example");
    const { principal } = await agentFor(acme);
    expect(await fileAgentWork(sql, store, principal, { ...work, external_id: "none" }, NOW)).toMatchObject({ state: "unfiled", reason: "no_space" });
    await space(acme, "acme-one");
    await space(acme, "acme-two");
    expect(await fileAgentWork(sql, store, principal, { ...work, external_id: "two" }, NOW)).toMatchObject({ state: "unfiled", reason: "ambiguous_space" });
  });

  it("a task or project from another client is refused", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const other = await org("Other", "other.example");
    const otherProject = await project(other, "Theirs");
    const { principal } = await agentFor(acme);
    const result = await fileAgentWork(sql, store, principal, { ...work, project_id: otherProject }, NOW);
    expect(result).toMatchObject({ state: "unfiled", reason: "project_not_open" });
  });

  it("an agent_id that does not match the token is forbidden", async () => {
    const acme = await org("Acme", "acme.example");
    const { principal } = await agentFor(acme);
    expect(await fileAgentWork(sql, store, principal, { ...work, agent_id: "someone-else" }, NOW)).toMatchObject({ ok: false, error: "forbidden" });
  });
});

describe("unfiled inbox", () => {
  it("staff file an item into a checked space, or discard it", async () => {
    const acme = await org("Acme", "acme.example");
    const one = await space(acme, "acme-one");
    await space(acme, "acme-two");
    const { principal } = await agentFor(acme);
    const waiting = await fileAgentWork(sql, store, principal, work, NOW);
    if (!waiting.ok) throw new Error("bad");
    const other = await org("Other", "other.example");
    expect(await fileUnfiledWork(sql, store, { id: waiting.workItemId, organizationId: other, workspaceId: one, actor: "staff-1", now: NOW })).toEqual({ ok: false, error: "invalid" });
    const filed = await fileUnfiledWork(sql, store, { id: waiting.workItemId, organizationId: acme, workspaceId: one, actor: "staff-1", now: NOW + 1 });
    expect(filed.ok).toBe(true);
    expect(await listUnfiledWork(sql, NOW + 2)).toHaveLength(0);
    const row = await sql.get<{ state: string; filed_by: string; route: string }>("SELECT state, filed_by, route FROM agent_work_items");
    expect(row).toEqual({ state: "filed", filed_by: "staff-1", route: "staff" });

    const second = await fileAgentWork(sql, store, principal, { ...work, external_id: "x2" }, NOW);
    if (!second.ok) throw new Error("bad");
    expect(await discardUnfiledWork(sql, { id: second.workItemId, actor: "staff-1", now: NOW })).toBe(true);
    expect(await listUnfiledWork(sql, NOW + 2)).toHaveLength(0);
  });
});

describe("Client Services feed", () => {
  it("reports filed work to Client Services", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { principal } = await agentFor(acme);
    await fileAgentWork(sql, store, principal, work, NOW);
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 1000, origin: "https://hq.example" });
    if (!Array.isArray(updates)) throw new Error("bad");
    const filed = updates.find((update) => update.kind === "client_agent.work_filed");
    expect(filed?.summary).toContain("Spring promo landing page copy");
    expect(filed?.links.some((link) => link.url === "https://hq.example/w/acme-example")).toBe(true);
  });
});

describe("routes", () => {
  it("Client Services registers an agent by domain and the agent files with its token", async () => {
    const acme = await org("Acme", "acme.example");
    const spaceId = await space(acme, "acme-example");
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    process.env.CLIENT_SERVICES_TOKEN = "cs-test-token";
    process.env.HANDOFF_OBJECT_PATH = root;

    const unauthorized = await agentsPost(new Request("https://hq.example/api/client-services/agents", { method: "POST", body: "{}" }));
    expect(unauthorized.status).toBe(401);

    const registered = await agentsPost(
      new Request("https://hq.example/api/client-services/agents", {
        method: "POST",
        headers: { authorization: "Bearer cs-test-token" },
        body: JSON.stringify({ agent_id: "acme-agent", label: "Acme agent", client: { domain: "https://www.acme.example" } }),
      }),
    );
    expect(registered.status).toBe(201);
    const { token, organization_id } = (await registered.json()) as { token: string; organization_id: string };
    expect(organization_id).toBe(acme);

    const noToken = await agentWorkPost(new Request("https://hq.example/api/agent-work", { method: "POST", body: JSON.stringify(work) }));
    expect(noToken.status).toBe(401);

    const filed = await agentWorkPost(
      new Request("https://hq.example/api/agent-work", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(work) }),
    );
    expect(filed.status).toBe(201);
    const body = (await filed.json()) as { state: string; space: { id: string; slug: string } };
    expect(body.state).toBe("filed");
    expect(body.space.id).toBe(spaceId);

    const again = await agentWorkPost(
      new Request("https://hq.example/api/agent-work", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(work) }),
    );
    expect(again.status).toBe(200);

    const huge = await agentWorkPost(
      new Request("https://hq.example/api/agent-work", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...work, external_id: "big", content: "x".repeat(1_100_000) }),
      }),
    );
    expect(huge.status).toBe(413);
  });
});

async function task(organizationId: string, projectId: string | null, title = "Copy"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'todo', ?, ?)",
    [id, projectId, organizationId, title, NOW, NOW],
  );
  return id;
}

async function principal(agentId: string) {
  const row = await sql.get<{ id: string }>("SELECT id FROM client_agents WHERE id = ?", [agentId]);
  if (!row) throw new Error("no agent");
  const rotated = await registerClientAgent(sql, { agentId, rotate: true, actor: "test", now: NOW });
  if (!rotated.ok || !rotated.token) throw new Error("rotate failed");
  return (await agentForToken(sql, `Bearer ${rotated.token}`))!;
}

describe("many agents and clients", () => {
  it("several agents serve one client, and one hire serves two clients", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const beta = await org("Beta", "beta.example");
    await space(beta, "beta-example");
    const lead = await agentFor(acme, "acme-lead");
    await registerClientAgent(sql, { agentId: "designer", label: "Designer hire", organizationId: acme, role: "hire", actor: "test", now: NOW });
    await registerClientAgent(sql, { agentId: "designer", organizationId: beta, role: "hire", actor: "test", now: NOW });
    const designer = await principal("designer");
    expect(designer.assignments.map((a) => a.organizationId).sort()).toEqual([acme, beta].sort());
    expect(designer.assignments.every((a) => a.role === "hire")).toBe(true);

    expect(await fileAgentWork(sql, store, lead.principal, work, NOW)).toMatchObject({ state: "filed", organizationId: acme });
    expect(await fileAgentWork(sql, store, designer, { ...work, external_id: "d1" }, NOW)).toMatchObject({ state: "unfiled", reason: "ambiguous_client" });
    expect(await fileAgentWork(sql, store, designer, { ...work, external_id: "d2", client: { domain: "beta.example" } }, NOW)).toMatchObject({ state: "filed", organizationId: beta });
    const acmeTask = await task(acme, null);
    expect(await fileAgentWork(sql, store, designer, { ...work, external_id: "d3", task_id: acmeTask }, NOW)).toMatchObject({ state: "filed", organizationId: acme });
  });

  it("an ended assignment stops filing and reading for that client", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { token } = await agentFor(acme);
    expect(await endAssignment(sql, { agentId: "acme-agent", organizationId: acme, actor: "test", now: NOW })).toBe(true);
    const after = (await agentForToken(sql, `Bearer ${token}`))!;
    expect(after.assignments).toHaveLength(0);
    expect(await fileAgentWork(sql, store, after, work, NOW)).toMatchObject({ state: "unfiled", reason: "agent_not_assigned" });
  });
});

describe("handoffs", () => {
  it("hands work to another agent on the same client, who finds it with handed_to_me", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const lead = await agentFor(acme, "acme-lead");
    await registerClientAgent(sql, { agentId: "writer", organizationId: acme, role: "hire", actor: "test", now: NOW });
    const writer = await principal("writer");
    const result = await fileAgentWork(sql, store, lead.principal, { ...work, kind: "plan", handoff: { to: "writer", note: "Write the FAQ next." } }, NOW);
    expect(result).toMatchObject({ state: "filed", handoffTo: "writer" });
    const inbox = await listAgentContext(sql, writer, { handedToMe: true });
    expect(inbox.ok && inbox.items.map((i) => [i.title, i.handoff_note])).toEqual([[work.title, "Write the FAQ next."]]);
    const activity = await sql.get<{ n: number }>("SELECT count(*) AS n FROM activities WHERE kind = 'client_agent.handoff'");
    expect(activity?.n).toBe(1);
  });

  it("refuses a handoff to an agent that is not on this client", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const beta = await org("Beta", "beta.example");
    const lead = await agentFor(acme, "acme-lead");
    await registerClientAgent(sql, { agentId: "beta-agent", organizationId: beta, actor: "test", now: NOW });
    expect(await fileAgentWork(sql, store, lead.principal, { ...work, handoff: { to: "beta-agent" } }, NOW)).toMatchObject({ ok: false, error: "invalid" });
    expect(await fileAgentWork(sql, store, lead.principal, { ...work, handoff: { to: "nobody" } }, NOW)).toMatchObject({ ok: false, error: "invalid" });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_work_items"))?.n).toBe(0);
  });
});

describe("task completion", () => {
  it("moves the linked task to Waiting on Client Services once filed (never done), unless keep_task_open", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const { principal: agent } = await agentFor(acme);
    const one = await task(acme, null, "One");
    const two = await task(acme, null, "Two");
    expect(await fileAgentWork(sql, store, agent, { ...work, external_id: "t1", task_id: one }, NOW)).toMatchObject({ state: "filed", taskClosed: false, awaitingReview: true, reviewState: "held" });
    expect(await fileAgentWork(sql, store, agent, { ...work, external_id: "t2", task_id: two, keep_task_open: true }, NOW)).toMatchObject({ state: "filed", taskClosed: false });
    const rows = await sql.all<{ title: string; status: string; in_review: number }>(
      "SELECT title, status, review_requested_at IS NOT NULL AS in_review FROM tasks ORDER BY title",
    );
    expect(rows).toEqual([{ title: "One", status: "doing", in_review: 1 }, { title: "Two", status: "todo", in_review: 0 }]);
    const moved = await sql.get<{ actor_id: string }>("SELECT actor_id FROM activities WHERE kind = 'agent.task_stage'");
    expect(moved?.actor_id).toBe("acme-agent");
  });

  it("unfiled work does not close the task", async () => {
    const acme = await org("Acme", "acme.example");
    const { principal: agent } = await agentFor(acme);
    const one = await task(acme, null);
    expect(await fileAgentWork(sql, store, agent, { ...work, task_id: one }, NOW)).toMatchObject({ state: "unfiled", reason: "no_space" });
    expect((await sql.get<{ status: string }>("SELECT status FROM tasks"))?.status).toBe("todo");
  });
});

describe("context read-back", () => {
  it("an agent reads every agent's filed work for its own clients only", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    const beta = await org("Beta", "beta.example");
    await space(beta, "beta-example");
    const acmeLead = await agentFor(acme, "acme-lead");
    await registerClientAgent(sql, { agentId: "acme-hire", organizationId: acme, role: "hire", actor: "test", now: NOW });
    const acmeHire = await principal("acme-hire");
    await registerClientAgent(sql, { agentId: "beta-lead", organizationId: beta, actor: "test", now: NOW });
    const betaLead = await principal("beta-lead");
    await fileAgentWork(sql, store, acmeLead.principal, { ...work, kind: "note", title: "Brand notes" }, NOW);
    await fileAgentWork(sql, store, acmeHire, { ...work, title: "FAQ draft" }, NOW + 1);
    const secret = await fileAgentWork(sql, store, betaLead, { ...work, title: "Beta secret plan" }, NOW + 2);

    const seen = await listAgentContext(sql, acmeHire, {});
    expect(seen.ok && seen.items.map((i) => i.title)).toEqual(["FAQ draft", "Brand notes"]);
    expect(await listAgentContext(sql, acmeHire, { client: "beta.example" })).toMatchObject({ ok: false, status: 403 });
    const notes = await listAgentContext(sql, acmeHire, { kind: "note" });
    expect(notes.ok && notes.items.map((i) => i.title)).toEqual(["Brand notes"]);
    if (!secret.ok) throw new Error("bad");
    expect(await readAgentContextItem(sql, acmeHire, secret.workItemId)).toBeNull();
    const own = await readAgentContextItem(sql, betaLead, secret.workItemId);
    expect(own?.context_md).toContain("# Beta secret plan");
  });
});

class FakeSkills {
  constructor(private readonly objects: Record<string, string>) {}
  async get(key: string) {
    const value = this.objects[key];
    return value == null ? null : { text: async () => value };
  }
}

const skillsBucket = new FakeSkills({
  "skills/index.json": JSON.stringify({
    skills: [
      { name: "copywriting", description: "Write landing page copy", path: "community/marketingskills/copywriting/SKILL.md", pack: "community" },
      { name: "seo-audit", description: "Audit a site for search", path: "community/notfair-seo/seo-audit/SKILL.md", pack: "community" },
      { name: "remotion", description: "Make videos", path: "community/remotion/basics/SKILL.md", pack: "community" },
    ],
  }),
  "skills/community/marketingskills/copywriting/SKILL.md": "---\nname: copywriting\n---\nWrite clearly.",
  "skills/community/notfair-seo/seo-audit/SKILL.md": "---\nname: seo-audit\n---\nCheck titles.",
  "skills/community/remotion/basics/SKILL.md": "---\nname: remotion\n---\nRender.",
});

describe("skill packs through HQ", () => {
  it("cleans prefixes and refuses paths that leave the library", () => {
    expect(cleanSkillPrefix("community/marketingskills")).toBe("community/marketingskills/");
    expect(cleanSkillPrefix(".cursor/skills/community/remotion/")).toBe("community/remotion/");
    expect(cleanSkillPrefix("../secrets/")).toBeNull();
    expect(cleanSkillPrefix("/etc/")).toBeNull();
    expect(cleanSkillPrefix("org/")).toBeNull();
  });

  it("lists and reads only skills granted to the agent or to its clients", async () => {
    const acme = await org("Acme", "acme.example");
    const { principal: agent } = await agentFor(acme);
    await grantSkills(sql, { agentId: "acme-agent", prefixes: ["community/marketingskills"], actor: "test", now: NOW });
    await grantSkills(sql, { organizationId: acme, prefixes: ["community/notfair-seo/seo-audit/SKILL.md"], actor: "test", now: NOW });
    const listed = await listAgentSkills(sql, skillsBucket, agent);
    expect(listed.ok && listed.skills.map((s) => s.name)).toEqual(["copywriting", "seo-audit"]);
    expect(listed.ok && listed.skills[0].pack).toBe("community/marketingskills");
    const searched = await listAgentSkills(sql, skillsBucket, agent, "audit");
    expect(searched.ok && searched.skills.map((s) => s.name)).toEqual(["seo-audit"]);
    const read = await readAgentSkill(sql, skillsBucket, agent, "community/marketingskills/copywriting/SKILL.md");
    expect(read).toMatchObject({ ok: true, path: "community/marketingskills/copywriting/SKILL.md" });
    expect(read.ok && read.version).toMatch(/^[0-9a-f]{12}$/);
    expect(await readAgentSkill(sql, skillsBucket, agent, "community/remotion/basics/SKILL.md")).toMatchObject({ ok: false, status: 403 });
    expect(await readAgentSkill(sql, skillsBucket, agent, "community/marketingskills/../remotion/basics/SKILL.md")).toMatchObject({ ok: false, status: 404 });
  });

  it("client grants follow the assignment", async () => {
    const acme = await org("Acme", "acme.example");
    const { token } = await agentFor(acme);
    await grantSkills(sql, { organizationId: acme, prefixes: ["community/remotion/"], actor: "test", now: NOW });
    await endAssignment(sql, { agentId: "acme-agent", organizationId: acme, actor: "test", now: NOW });
    const after = (await agentForToken(sql, `Bearer ${token}`))!;
    const listed = await listAgentSkills(sql, skillsBucket, after);
    expect(listed.ok && listed.skills).toEqual([]);
  });
});

describe("agent read routes", () => {
  it("GET /api/agent-work, /api/agent-work/:id, /api/agent-skills and skill-grants work with the right tokens", async () => {
    const acme = await org("Acme", "acme.example");
    await space(acme, "acme-example");
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, SKILLS: skillsBucket } };
    process.env.CLIENT_SERVICES_TOKEN = "cs-test-token";
    process.env.HANDOFF_OBJECT_PATH = root;
    const { token, principal: agent } = await agentFor(acme);
    const filed = await fileAgentWork(sql, store, agent, work, NOW);
    if (!filed.ok) throw new Error("bad");
    const auth = { authorization: `Bearer ${token}` };

    expect((await agentWorkGet(new Request("https://hq.example/api/agent-work"))).status).toBe(401);
    const list = await agentWorkGet(new Request("https://hq.example/api/agent-work?client=acme-example", { headers: auth }));
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { items: { id: string }[]; clients: { organization_id: string }[] };
    expect(listBody.items.map((i) => i.id)).toEqual([filed.workItemId]);
    expect(listBody.clients[0].organization_id).toBe(acme);
    const one = await agentWorkItemGet(new Request(`https://hq.example/api/agent-work/${filed.workItemId}`, { headers: auth }), {
      params: Promise.resolve({ id: filed.workItemId }),
    });
    expect(((await one.json()) as { context_md: string }).context_md).toContain("Smile with confidence");

    const grant = await skillGrantsPost(
      new Request("https://hq.example/api/client-services/skill-grants", {
        method: "POST",
        headers: { authorization: "Bearer cs-test-token" },
        body: JSON.stringify({ client: { domain: "acme.example" }, prefixes: ["community/marketingskills/"] }),
      }),
    );
    expect(grant.status).toBe(200);
    const skills = await agentSkillsGet(new Request("https://hq.example/api/agent-skills", { headers: auth }));
    expect(((await skills.json()) as { skills: { name: string }[] }).skills.map((s) => s.name)).toEqual(["copywriting"]);
    const body = await agentSkillGet(new Request("https://hq.example/api/agent-skills/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "marketingskills", "copywriting", "SKILL.md"] }),
    });
    expect(body.status).toBe(200);
    expect(body.headers.get("etag")).toMatch(/^"[0-9a-f]{12}"$/);
    const denied = await agentSkillGet(new Request("https://hq.example/api/agent-skills/x", { headers: auth }), {
      params: Promise.resolve({ path: ["community", "remotion", "basics", "SKILL.md"] }),
    });
    expect(denied.status).toBe(403);
    const noCs = await skillGrantsPost(new Request("https://hq.example/api/client-services/skill-grants", { method: "POST", body: "{}" }));
    expect(noCs.status).toBe(401);
  });
});

describe("Client Services review flow", () => {
  const cs = { authorization: "Bearer cs-review-token", "content-type": "application/json" };

  async function inReview() {
    const acme = await org("Acme", "acme.example");
    const projectId = await project(acme, "Website");
    await space(acme, "acme-example", projectId);
    const made = await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", actor: "test", now: NOW });
    if (!made.ok || !made.token) throw new Error("register failed");
    const agent = (await agentForToken(sql, `Bearer ${made.token}`))!;
    const taskId = await task(acme, projectId, "Landing page");
    await moveTaskStage(sql, { taskId, to: "review", note: "Draft is ready.", now: NOW + 1, actor: { kind: "agent", id: "acme-lead" } });
    return { acme, projectId, agent, taskId };
  }

  function decide(taskId: string, body: unknown, headers: Record<string, string> = cs) {
    return reviewDecide(
      new Request(`https://hq.example/api/client-services/reviews/${taskId}`, { method: "POST", headers, body: JSON.stringify(body) }),
      { params: Promise.resolve({ taskId }) },
    );
  }

  it("filing work on a task waiting on Client Services keeps it open, links the item, and posts awaiting review", async () => {
    const { agent, taskId } = await inReview();
    const filed = await fileAgentWork(sql, store, agent, { ...work, task_id: taskId }, NOW + 2);
    expect(filed).toMatchObject({ state: "filed", taskClosed: false, awaitingReview: true });
    const row = await sql.get<{ status: string; review_requested_at: number | null }>("SELECT status, review_requested_at FROM tasks WHERE id = ?", [taskId]);
    expect(row).toEqual({ status: "doing", review_requested_at: NOW + 1 });
    expect((await sql.get<{ task_id: string }>("SELECT task_id FROM agent_work_items WHERE state = 'filed'"))?.task_id).toBe(taskId);
    const waiting = await sql.get<{ body: string; data_json: string }>("SELECT body, data_json FROM activities WHERE kind = 'client_agent.review_waiting'");
    expect(waiting?.body).toContain('Awaiting Client Services review: "Landing page"');
    expect(JSON.parse(waiting!.data_json)).toMatchObject({ task_id: taskId, agent_id: "acme-lead" });
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((update) => update.kind === "client_agent.review_waiting")).toBe(true);
  });

  it("GET lists open reviews with the note, who asked, the client's agents, and the filed work; token required", async () => {
    const { acme, taskId, agent } = await inReview();
    await fileAgentWork(sql, store, agent, { ...work, task_id: taskId }, NOW + 2);
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    process.env.CLIENT_SERVICES_TOKEN = "cs-review-token";
    expect((await reviewsGet(new Request("https://hq.example/api/client-services/reviews"))).status).toBe(401);
    expect((await decide(taskId, { action: "approve" }, { authorization: "Bearer wrong" })).status).toBe(401);
    const res = await reviewsGet(new Request("https://hq.example/api/client-services/reviews?client=acme.example", { headers: cs }));
    expect(res.status).toBe(200);
    const { reviews } = (await res.json()) as { reviews: Record<string, unknown>[] };
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      task_id: taskId,
      title: "Landing page",
      organization: { id: acme, name: "Acme" },
      project: { name: "Website" },
      note: "Draft is ready.",
      requested_by: { kind: "agent", id: "acme-lead" },
      agents: [{ agent_id: "acme-lead", role: "lead" }],
      filed_work: [{ agent_id: "acme-lead", title: work.title, kind: "copy" }],
    });
    const other = await reviewsGet(new Request("https://hq.example/api/client-services/reviews?client=nobody.example", { headers: cs }));
    expect(other.status).toBe(404);
  });

  it("POST approve moves it to Done with the timeline and feed; send_back needs a note; a decided card is 409", async () => {
    const { taskId } = await inReview();
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    process.env.CLIENT_SERVICES_TOKEN = "cs-review-token";
    expect((await decide(taskId, { action: "maybe" })).status).toBe(400);
    const noNote = await decide(taskId, { action: "send_back", note: "  " });
    expect(noNote.status).toBe(400);
    expect(await noNote.json()).toMatchObject({ code: "note_required" });
    expect((await decide("missing-task", { action: "approve" })).status).toBe(404);
    const approved = await decide(taskId, { action: "approve" });
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ ok: true, column: "done", status: "done" });
    const row = await sql.get<{ status: string; review_requested_at: number | null }>("SELECT status, review_requested_at FROM tasks WHERE id = ?", [taskId]);
    expect(row).toEqual({ status: "done", review_requested_at: null });
    const decided = await sql.get<{ actor_kind: string; actor_id: string; body: string }>(
      "SELECT actor_kind, actor_id, body FROM activities WHERE kind = 'client_services.task_review'",
    );
    expect(decided).toMatchObject({ actor_kind: "system", actor_id: "client-services" });
    expect(decided?.body).toContain("Client Services: review approved");
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((update) => update.kind === "client_services.task_review")).toBe(true);
    expect((await decide(taskId, { action: "approve" })).status).toBe(409);
  });

  it("POST send_back in AGENT_MODE=agents returns it to Doing and hands the note to the lead agent", async () => {
    process.env.AGENT_MODE = "agents";
    const { taskId } = await inReview();
    await sql.run("UPDATE tasks SET stage = 'build' WHERE id = ?", [taskId]);
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
    process.env.CLIENT_SERVICES_TOKEN = "cs-review-token";
    const res = await decide(taskId, { action: "send_back", note: "Shorter hero, please." });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, column: "doing", stage: "build", status: "doing", handed_to: "acme-lead" });
    const row = await sql.get<{ review_requested_at: number | null; review_note: string }>("SELECT review_requested_at, review_note FROM tasks WHERE id = ?", [taskId]);
    expect(row).toEqual({ review_requested_at: null, review_note: "Shorter hero, please." });
    const dispatch = await sql.get<{ data_json: string }>(
      "SELECT data_json FROM activities WHERE kind = 'client_agent.dispatch' AND json_extract(data_json, '$.reason') = 'changes'",
    );
    expect(JSON.parse(dispatch!.data_json)).toMatchObject({ task_id: taskId, to: "acme-lead", note: "Shorter hero, please." });
  });

  it("a client agent can't approve its own work", async () => {
    const { taskId } = await inReview();
    const tried = await decideReview(sql, { taskId, decision: "approve", now: NOW + 3, actor: { kind: "agent", id: "acme-lead" } });
    expect(tried).toEqual({ ok: false, error: "invalid" });
    expect((await sql.get<{ status: string }>("SELECT status FROM tasks WHERE id = ?", [taskId]))?.status).toBe("doing");
  });
});
