import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import {
  filingChoices,
  listAgentsForStaff,
  listClientAgentWork,
  listClientGrants,
  listUnfiledForStaff,
  skillPacksFromIndex,
  staffAssignAgent,
  staffDiscardUnfiled,
  staffFileUnfiled,
  staffGrantSkills,
  staffRegisterAgent,
  staffRevokeAgent,
  staffRevokeSkill,
  staffRotateAgent,
  staffUnassignAgent,
  unfiledCount,
} from "./agent-admin";
import { updateAgentTask } from "./agent-board";
import { agentForToken, fileAgentWork } from "./agent-work-filing";

const NOW = 1_700_000_000_000;

let sql: Sql;
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
  sql = d1Sql(d1Over(db));
  await migrate(sql);
  root = mkdtempSync(path.join(tmpdir(), "agent-admin-"));
  store = localObjectStore(root);
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

async function person(email: string, admin: boolean, revoked = false): Promise<Caller> {
  const id = crypto.randomUUID();
  await sql.run("INSERT INTO users (id, email, created_at) VALUES (?, ?, ?)", [id, email, NOW]);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES (?, ?, ?, ?, ?)", [id, email, admin ? 1 : 0, NOW, revoked ? NOW : null]);
  return { userId: id, staff: { superAdmin: admin }, operatorOf: [], memberships: [] };
}

const outsider: Caller = { userId: "client-user", staff: null, operatorOf: [], memberships: [] };

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

async function space(organizationId: string, slug: string, projectId: string | null = null): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [id, slug, slug, slug, NOW, organizationId, projectId],
  );
  return id;
}

async function task(organizationId: string, projectId: string, title: string): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    `INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at, stage, skills_json, created_by_kind, round, position)
     VALUES (?, ?, ?, ?, 'todo', ?, ?, 'describe', '[]', 'staff', 1, 0)`,
    [id, projectId, organizationId, title, NOW, NOW],
  );
  return id;
}

async function setup() {
  const admin = await person("admin@abra.test", true);
  const staff = await person("pat@abra.test", false);
  const acme = await org("Acme Dental", "acme.example");
  const site = await project(acme, "Website");
  const acmeSpace = await space(acme, "acme-dental", site);
  const bolt = await org("Bolt Bikes", "bolt.example");
  const boltSpace = await space(bolt, "bolt-bikes");
  return { admin, staff, acme, site, acmeSpace, bolt, boltSpace };
}

const work = { external_id: "w-1", title: "Spring promo copy", kind: "copy", summary: "Hero and FAQ.", content: "# Copy" };

describe("roles", () => {
  it("only an admin issues, rotates, or revokes tokens; staff assign and grant", async () => {
    const { admin, staff, acme } = await setup();
    expect(await staffRegisterAgent(sql, staff, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW })).toMatchObject({ ok: false });
    expect(await staffRegisterAgent(sql, outsider, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW })).toMatchObject({ ok: false });
    const made = await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW });
    if (!made.ok || !made.token) throw new Error("register failed");
    expect(made.token.startsWith("caw_")).toBe(true);
    const stored = await sql.get<{ token_hash: string }>("SELECT token_hash FROM client_agents WHERE id = 'acme-lead'");
    expect(stored?.token_hash).not.toContain(made.token.slice(4));
    expect(await agentForToken(sql, `Bearer ${made.token}`)).not.toBeNull();

    expect(await staffRotateAgent(sql, staff, { agentId: "acme-lead", now: NOW })).toMatchObject({ ok: false });
    expect(await staffRevokeAgent(sql, staff, { agentId: "acme-lead", now: NOW })).toMatchObject({ ok: false });
    const rotated = await staffRotateAgent(sql, admin, { agentId: "acme-lead", now: NOW + 1 });
    if (!rotated.ok || !rotated.token) throw new Error("rotate failed");
    expect(await agentForToken(sql, `Bearer ${made.token}`)).toBeNull();
    expect(await staffRevokeAgent(sql, admin, { agentId: "acme-lead", now: NOW + 2 })).toMatchObject({ ok: true });
    expect(await agentForToken(sql, `Bearer ${rotated.token}`)).toBeNull();

    const revokedStaff = await person("gone@abra.test", false, true);
    expect(await staffAssignAgent(sql, revokedStaff, { agentId: "acme-lead", organizationId: acme, role: "hire", now: NOW })).toMatchObject({ ok: false });
    expect(await listAgentsForStaff(sql, outsider)).toEqual([]);
    expect(await listUnfiledForStaff(sql, outsider, NOW)).toEqual([]);
  });

  it("refuses a taken agent id instead of re-issuing its token", async () => {
    const { admin, acme } = await setup();
    await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW });
    expect(await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Again", organizationId: acme, role: "lead", now: NOW })).toMatchObject({ ok: false, field: "agentId" });
  });
});

describe("agents list", () => {
  it("shows role, assignments, status, filed count, and last activity", async () => {
    const { admin, staff, acme, acmeSpace, bolt, site } = await setup();
    const made = await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, workspaceId: acmeSpace, projectId: site, role: "lead", now: NOW });
    if (!made.ok || !made.token) throw new Error("bad");
    expect(await staffAssignAgent(sql, staff, { agentId: "acme-lead", organizationId: bolt, role: "hire", now: NOW + 1 })).toMatchObject({ ok: true });
    const principal = await agentForToken(sql, `Bearer ${made.token}`);
    await fileAgentWork(sql, store, principal!, { ...work, client: { domain: "acme.example" } }, NOW + 5);
    const [row] = await listAgentsForStaff(sql, staff);
    expect(row).toMatchObject({ id: "acme-lead", status: "active", filedCount: 1 });
    expect(row?.assignments.map((item) => [item.organizationName, item.role, item.spaceName])).toEqual([
      ["Acme Dental", "lead", "acme-dental"],
      ["Bolt Bikes", "hire", null],
    ]);
    expect(row?.lastActivity).toBeGreaterThanOrEqual(NOW + 5);
    expect(await staffUnassignAgent(sql, staff, { agentId: "acme-lead", organizationId: bolt, now: NOW + 6 })).toMatchObject({ ok: true });
    expect((await listAgentsForStaff(sql, staff))[0]?.assignments).toHaveLength(1);
    await staffUnassignAgent(sql, staff, { agentId: "acme-lead", organizationId: acme, now: NOW + 7 });
    expect((await listAgentsForStaff(sql, staff))[0]?.status).toBe("idle");
  });
});

describe("unfiled inbox", () => {
  async function unfiledItem() {
    const ctx = await setup();
    const made = await staffRegisterAgent(sql, ctx.admin, { agentId: "roamer", label: "Roaming agent", organizationId: ctx.acme, role: "lead", now: NOW });
    await staffAssignAgent(sql, ctx.admin, { agentId: "roamer", organizationId: ctx.bolt, role: "hire", now: NOW });
    if (!made.ok || !made.token) throw new Error("bad");
    const principal = await agentForToken(sql, `Bearer ${made.token}`);
    const todo = await task(ctx.acme, ctx.site, "Write promo copy");
    const result = await fileAgentWork(sql, store, principal!, { ...work, task_id: todo, client: { domain: "nobody.example" } }, NOW);
    if (!result.ok) throw new Error("bad");
    return { ...ctx, itemId: result.workItemId, todo };
  }

  it("lists why it couldn't be filed, with a hint and a count", async () => {
    const { staff, itemId } = await unfiledItem();
    expect(await unfiledCount(sql, NOW)).toBe(1);
    const [row] = await listUnfiledForStaff(sql, staff, NOW);
    expect(row).toMatchObject({ id: itemId, agentId: "roamer", agentLabel: "Roaming agent", title: "Spring promo copy", domainHint: "nobody.example" });
    expect(row?.reason.length).toBeGreaterThan(5);
    const choices = await filingChoices(sql);
    expect(choices.clients.map((client) => client.name)).toEqual(["Acme Dental", "Bolt Bikes"]);
    expect(choices.clients[0]?.tasks.map((item) => item.title)).toEqual(["Write promo copy"]);
  });

  it("suggests the client whose domain matched", async () => {
    const ctx = await setup();
    const made = await staffRegisterAgent(sql, ctx.admin, { agentId: "loner", label: "Loner", organizationId: ctx.bolt, role: "lead", now: NOW });
    if (!made.ok || !made.token) throw new Error("bad");
    const principal = await agentForToken(sql, `Bearer ${made.token}`);
    await fileAgentWork(sql, store, principal!, { ...work, client: { domain: "acme.example" } }, NOW);
    const [row] = await listUnfiledForStaff(sql, ctx.staff, NOW);
    expect(row?.suggestion).toMatchObject({ organizationId: ctx.acme, name: "Acme Dental" });
  });

  it("files to the chosen space and closes the agent's task", async () => {
    const { staff, acme, acmeSpace, bolt, itemId, todo } = await unfiledItem();
    expect(await staffFileUnfiled(sql, store, staff, { id: itemId, target: `${bolt}:${acmeSpace}`, taskId: "keep", now: NOW })).toMatchObject({ ok: false, field: "target" });
    expect(await staffFileUnfiled(sql, store, outsider, { id: itemId, target: `${acme}:${acmeSpace}`, taskId: "keep", now: NOW })).toMatchObject({ ok: false });
    expect(await staffFileUnfiled(sql, store, staff, { id: itemId, target: `${acme}:${acmeSpace}`, taskId: "keep", now: NOW + 1 })).toEqual({ ok: true, message: "Filed. It is held until Client Services approves it." });
    // Filing never closes the card: it waits on Client Services review.
    expect(await sql.get<{ status: string; review: number | null }>("SELECT status, review_requested_at AS review FROM tasks WHERE id = ?", [todo])).toEqual({ status: "doing", review: NOW + 1 });
    expect(await unfiledCount(sql, NOW + 2)).toBe(0);
    const panel = await listClientAgentWork(sql, staff, acme);
    expect(panel.filed[0]).toMatchObject({ title: "Spring promo copy", taskTitle: "Write promo copy", taskClosed: false, spaceSlug: "acme-dental", visibility: "held" });
    expect(panel.filed[0]?.batchId).toBeTruthy();
    expect(panel.filed[0]?.paths.length).toBeGreaterThan(0);
  });

  it("files with no task when staff pick none, and refuses another client's task", async () => {
    const { staff, bolt, boltSpace, itemId, todo } = await unfiledItem();
    expect(await staffFileUnfiled(sql, store, staff, { id: itemId, target: `${bolt}:${boltSpace}`, taskId: todo, now: NOW })).toMatchObject({ ok: false });
    expect(await staffFileUnfiled(sql, store, staff, { id: itemId, target: `${bolt}:${boltSpace}`, taskId: "", now: NOW })).toEqual({ ok: true, message: "Filed. It is held until Client Services approves it." });
    expect((await sql.get<{ status: string }>("SELECT status FROM tasks WHERE id = ?", [todo]))?.status).toBe("todo");
  });

  it("discards only with a reason, and logs it", async () => {
    const { staff, itemId } = await unfiledItem();
    expect(await staffDiscardUnfiled(sql, staff, { id: itemId, reason: " ", now: NOW })).toMatchObject({ ok: false, field: "reason" });
    expect(await staffDiscardUnfiled(sql, staff, { id: itemId, reason: "Duplicate of last week's copy", now: NOW })).toMatchObject({ ok: true });
    expect(await staffDiscardUnfiled(sql, staff, { id: itemId, reason: "Again", now: NOW })).toMatchObject({ ok: false });
    const row = await sql.get<{ state: string; route: string }>("SELECT state, route FROM agent_work_items WHERE id = ?", [itemId]);
    expect(row).toEqual({ state: "discarded", route: "discarded: Duplicate of last week's copy" });
    const log = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'client_agent.work_discarded'");
    expect(JSON.parse(log!.data_json)).toMatchObject({ work_item_id: itemId, reason: "Duplicate of last week's copy" });
  });
});

describe("skill grants", () => {
  it("grants per client by default and per agent as extras", async () => {
    const { admin, staff, acme } = await setup();
    await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW });
    expect(await staffGrantSkills(sql, staff, { scope: "client", organizationId: acme, prefixes: ["community/marketingskills/"], now: NOW })).toMatchObject({ ok: true });
    expect(await staffGrantSkills(sql, staff, { scope: "agent", agentId: "acme-lead", prefixes: ["design/brand"], now: NOW })).toMatchObject({ ok: true });
    expect(await staffGrantSkills(sql, staff, { scope: "agent", agentId: "acme-lead", prefixes: ["../secrets"], now: NOW })).toMatchObject({ ok: false });
    expect(await listClientGrants(sql, staff)).toEqual([{ organizationId: acme, name: "Acme Dental", prefixes: ["community/marketingskills/"] }]);
    expect((await listAgentsForStaff(sql, staff))[0]?.grants).toEqual(["design/brand/"]);
    expect(await staffRevokeSkill(sql, staff, { agentId: "acme-lead", prefix: "design/brand/", now: NOW })).toMatchObject({ ok: true });
    expect((await listAgentsForStaff(sql, staff))[0]?.grants).toEqual([]);
  });

  it("groups the published index into packs", async () => {
    const index = JSON.stringify({
      skills: [
        { name: "a", path: "community/marketingskills/copy/SKILL.md" },
        { name: "b", path: "community/marketingskills/seo/SKILL.md" },
        { name: "c", path: "design/brand/logo/SKILL.md" },
        { name: "d", path: "org/private/x/SKILL.md" },
      ],
    });
    const bucket = { get: async (key: string) => (key === "skills/index.json" ? { text: async () => index } : null) };
    expect(await skillPacksFromIndex(bucket)).toMatchObject({
      ok: true,
      skillCount: 3,
      manifest: null,
      packs: [
        { prefix: "community/marketingskills/", name: "marketingskills", count: 2, description: "2 skills: a, b" },
        { prefix: "design/brand/", name: "brand", count: 1, description: "1 skill: c" },
      ],
    });
    expect(await skillPacksFromIndex(undefined)).toMatchObject({ ok: false });
    expect(await skillPacksFromIndex({ get: async () => null })).toMatchObject({ ok: false });
  });
});

describe("client panel", () => {
  it("lists board updates and assigned agents, and is empty for non-staff", async () => {
    const { admin, staff, acme, site } = await setup();
    const made = await staffRegisterAgent(sql, admin, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", now: NOW });
    if (!made.ok || !made.token) throw new Error("bad");
    const principal = await agentForToken(sql, `Bearer ${made.token}`);
    const todo = await task(acme, site, "Homepage");
    await updateAgentTask(sql, principal!, { taskId: todo, change: { action: "block", reason: "Waiting on logo" }, now: NOW + 1 });
    const panel = await listClientAgentWork(sql, staff, acme);
    expect(panel.agents).toEqual([{ id: "acme-lead", label: "Acme lead", role: "lead", revoked: false }]);
    expect(panel.updates.some((update) => update.kind === "client_agent.board" && update.body.includes("Waiting on logo"))).toBe(true);
    expect(await listClientAgentWork(sql, outsider, acme)).toEqual({ agents: [], filed: [], updates: [] });
  });
});
