import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrganization, moveDealStage, setOrganizationInternal } from "@/db/crm";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as agentAgentsGet } from "@/app/api/agent-agents/route";
import { POST as agentsPost } from "@/app/api/client-services/agents/route";
import type { Caller } from "@/lib/authz";
import { agentForToken, endAssignment, registerClientAgent } from "./agent-work-filing";
import { countLiveClients, listFunctionAgentsOnClient } from "./function-agents";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const FUNCTION_IDS = ["engineering-lead", "seo-analytics", "creative-producer", "social-content-ops"];
const STAFF: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };

let db: DatabaseSync;
let d1: D1Like;
let sql: Sql;

/** D1 stand-in with real batch semantics, so the transaction buffer in d1Sql behaves as it does on Cloudflare. */
function d1Over(database: DatabaseSync): D1Like {
  const prepare = (statement: string) => ({
    bind: (...params: unknown[]) => {
      const stmt = database.prepare(statement);
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
    exec: async (statement: string) => database.exec(statement),
    batch: async (statements: unknown[]) => {
      database.exec("BEGIN");
      try {
        for (const entry of statements as { stmt: { run: (...a: never[]) => unknown }; args: never[] }[]) entry.stmt.run(...entry.args);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Like;
}

beforeEach(async () => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)", [NOW]);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.CLIENT_SERVICES_TOKEN = "cs-test-token";
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.CLIENT_SERVICES_TOKEN;
  delete process.env.HANDOFF_SKIP_MIGRATIONS;
});

async function org(name: string, domain: string, kind = "client", extra: { internal?: boolean; archived?: boolean } = {}): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO organizations (id, name, domain, kind, is_internal, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [id, name, domain, kind, extra.internal ? 1 : 0, extra.archived ? NOW : null, NOW, NOW],
  );
  return id;
}

async function live(agentId: string): Promise<string[]> {
  const rows = await sql.all<{ organization_id: string }>("SELECT organization_id FROM agent_assignments WHERE agent_id = ? AND ended_at IS NULL", [agentId]);
  return rows.map((row) => row.organization_id).sort();
}

async function postAgent(body: Record<string, unknown>): Promise<Response> {
  return agentsPost(
    new Request("https://hq.example/api/client-services/agents", { method: "POST", headers: { authorization: "Bearer cs-test-token" }, body: JSON.stringify(body) }),
  );
}

async function functionAgent(id: string, description = `${id} does its job. Choose it for that.`): Promise<void> {
  const res = await postAgent({ agent_id: id, label: id, function: true, function_label: id.toUpperCase(), description });
  expect(res.status).toBeLessThan(300);
}

describe("migration 0049", () => {
  it("backfills the four existing function agents across every client, once", async () => {
    // A production-shaped database: the step is held back, then the old agents and clients exist.
    const old = new DatabaseSync(":memory:");
    old.exec("PRAGMA foreign_keys = ON");
    const oldSql = d1Sql(d1Over(old));
    process.env.HANDOFF_SKIP_MIGRATIONS = "0049_function_agents.sql";
    await migrate(oldSql);
    delete process.env.HANDOFF_SKIP_MIGRATIONS;
    const insertOrg = (id: string, kind: string, internal = 0, archived: number | null = null) =>
      oldSql.run("INSERT INTO organizations (id, name, domain, kind, is_internal, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, id, `${id}.example`, kind, internal, archived, NOW, NOW]);
    await insertOrg("abra", "client");
    await insertOrg("renew", "client");
    await insertOrg("strongfoam", "client");
    await insertOrg("prospect", "lead");
    await insertOrg("test-org", "client", 1);
    await insertOrg("gone", "client", 0, NOW);
    await insertOrg("partner-with-lead", "partner");
    await insertOrg("opted-out", "client");
    const agent = (id: string) => oldSql.run("INSERT INTO client_agents (id, label, token_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", [id, id, `hash-${id}`, NOW, NOW]);
    for (const id of [...FUNCTION_IDS, "abracadabra-client", "partner-lead", "plain-hire"]) await agent(id);
    const assign = (agentId: string, organizationId: string, role: string, endedAt: number | null = null) =>
      oldSql.run(
        "INSERT INTO agent_assignments (id, agent_id, organization_id, role, assigned_by, assigned_at, ended_at) VALUES (?, ?, ?, ?, 'cs', ?, ?)",
        [`as-${agentId}-${organizationId}`, agentId, organizationId, role, NOW, endedAt],
      );
    await assign("abracadabra-client", "abra", "lead");
    await assign("partner-lead", "partner-with-lead", "lead");
    await assign("engineering-lead", "abra", "hire");
    await assign("seo-analytics", "opted-out", "hire", NOW + 5);
    await assign("plain-hire", "renew", "hire");

    await migrate(oldSql);
    const rows = await oldSql.all<{ id: string; kind: string; function_label: string | null; description: string | null }>("SELECT id, kind, function_label, description FROM client_agents ORDER BY id");
    expect(rows.filter((row) => row.kind === "function").map((row) => row.id).sort()).toEqual([...FUNCTION_IDS].sort());
    for (const row of rows.filter((entry) => entry.kind === "function")) {
      expect(row.function_label).toBeTruthy();
      expect(row.description?.length).toBeGreaterThan(40);
    }
    expect(rows.find((row) => row.id === "plain-hire")).toMatchObject({ kind: "client", function_label: null });

    const liveFor = async (id: string) =>
      (await oldSql.all<{ organization_id: string }>("SELECT organization_id FROM agent_assignments WHERE agent_id = ? AND ended_at IS NULL", [id])).map((row) => row.organization_id).sort();
    // Clients, plus the partner organization that has a live client agent. Not the lead, the internal test org, the archived one, or the one staff ended.
    for (const id of ["engineering-lead", "creative-producer", "social-content-ops"]) {
      expect(await liveFor(id)).toEqual(["abra", "opted-out", "partner-with-lead", "renew", "strongfoam"]);
    }
    expect(await liveFor("seo-analytics")).toEqual(["abra", "partner-with-lead", "renew", "strongfoam"]);
    // The existing Abracadabra hire row is the original one, not a duplicate.
    const kept = await oldSql.all<{ id: string; assigned_by: string }>("SELECT id, assigned_by FROM agent_assignments WHERE agent_id = 'engineering-lead' AND organization_id = 'abra'");
    expect(kept).toEqual([{ id: "as-engineering-lead-abra", assigned_by: "cs" }]);
    const added = await oldSql.get<{ role: string; assigned_by: string; workspace_id: string | null }>("SELECT role, assigned_by, workspace_id FROM agent_assignments WHERE agent_id = 'seo-analytics' AND organization_id = 'renew'");
    expect(added).toEqual({ role: "hire", assigned_by: "migration:0049", workspace_id: null });
    // The ordinary agents are untouched.
    expect(await liveFor("abracadabra-client")).toEqual(["abra"]);
    expect(await liveFor("plain-hire")).toEqual(["renew"]);

    // A rerun, even one that starts the step over after a stop, adds nothing.
    const before = await oldSql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments");
    await oldSql.run("DROP INDEX client_agents_kind");
    await migrate(oldSql);
    expect(await oldSql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments")).toEqual(before);
  });

  it("is a no-op on a database with no function agents", async () => {
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments")).toEqual({ n: 0 });
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM client_agents WHERE kind = 'function'")).toEqual({ n: 0 });
  });
});

describe("registering a function agent", () => {
  it("needs a label and a description, and is never a lead", async () => {
    await org("Acme", "acme.example");
    expect((await postAgent({ agent_id: "seo-analytics", function: true })).status).toBe(400);
    expect((await postAgent({ agent_id: "seo-analytics", function: true, function_label: "SEO" })).status).toBe(400);
    expect((await postAgent({ agent_id: "seo-analytics", function: "yes" })).status).toBe(400);
    expect((await postAgent({ agent_id: "seo-analytics", function: true, function_label: "SEO", description: "Does SEO", client: { domain: "acme.example" }, role: "lead" })).status).toBe(400);
    expect(await sql.get("SELECT id FROM client_agents WHERE id = 'seo-analytics'")).toBeUndefined();
  });

  it("assigns itself as a hire to every eligible client and reports how many", async () => {
    const acme = await org("Acme", "acme.example");
    const beta = await org("Beta", "beta.example");
    await org("Prospect", "prospect.example", "lead");
    await org("Test", "test.example", "client", { internal: true });
    await org("Old", "old.example", "client", { archived: true });
    const res = await postAgent({ agent_id: "seo-analytics", label: "SEO", function: true, function_label: "SEO and analytics", description: "Search visibility." });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { kind: string; clients: number; token: string };
    expect(body).toMatchObject({ kind: "function", clients: 2 });
    expect(body.token.startsWith("caw_")).toBe(true);
    expect(await live("seo-analytics")).toEqual([acme, beta].sort());
    const roles = await sql.all<{ role: string }>("SELECT DISTINCT role FROM agent_assignments WHERE agent_id = 'seo-analytics'");
    expect(roles).toEqual([{ role: "hire" }]);
    const timeline = await sql.all<{ kind: string }>("SELECT kind FROM activities WHERE actor_id = 'function-agents'");
    expect(timeline).toEqual([{ kind: "client_agent.assigned" }, { kind: "client_agent.assigned" }]);
  });

  it("is idempotent: one live assignment per agent and client, and nothing new on a repeat", async () => {
    await org("Acme", "acme.example");
    await functionAgent("seo-analytics");
    const first = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments");
    const again = await postAgent({ agent_id: "seo-analytics", function: true });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { token: unknown }).token).toBeNull();
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM agent_assignments")).toEqual(first);
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE actor_id = 'function-agents'")).toEqual({ n: 1 });
  });

  it("catches up a client that was missed, but never undoes an assignment that was ended on purpose", async () => {
    const acme = await org("Acme", "acme.example");
    const beta = await org("Beta", "beta.example");
    await functionAgent("seo-analytics");
    expect(await endAssignment(sql, { agentId: "seo-analytics", organizationId: beta, actor: "staff", now: NOW + 1 })).toBe(true);
    const gamma = await org("Gamma", "gamma.example");
    await postAgent({ agent_id: "seo-analytics", function: true });
    expect(await live("seo-analytics")).toEqual([acme, gamma].sort());
    // Putting it back is an explicit assignment, and the single live row rule still holds.
    const back = await postAgent({ agent_id: "seo-analytics", client: { domain: "beta.example" } });
    expect(back.status).toBe(200);
    expect(await live("seo-analytics")).toEqual([acme, beta, gamma].sort());
    expect(await sql.all("SELECT id FROM agent_assignments WHERE agent_id = 'seo-analytics' AND organization_id = ? AND ended_at IS NULL", [beta])).toHaveLength(1);
  });

  it("turns an existing agent into a function agent, and back without dropping its assignments", async () => {
    const acme = await org("Acme", "acme.example");
    const beta = await org("Beta", "beta.example");
    const made = await registerClientAgent(sql, { agentId: "helper", organizationId: acme, role: "hire", actor: "cs", now: NOW });
    expect(made.ok).toBe(true);
    expect(await live("helper")).toEqual([acme]);
    const up = await postAgent({ agent_id: "helper", function: true, function_label: "Helper", description: "Helps." });
    expect(await up.json()).toMatchObject({ kind: "function", clients: 2 });
    expect(await live("helper")).toEqual([acme, beta].sort());
    const down = await postAgent({ agent_id: "helper", function: false });
    expect(await down.json()).toMatchObject({ kind: "client" });
    expect(await live("helper")).toEqual([acme, beta].sort());
    const gamma = await org("Gamma", "gamma.example");
    await postAgent({ agent_id: "helper" });
    expect(await live("helper")).not.toContain(gamma);
  });

  it("skips a revoked function agent and picks it up again when its token is rotated", async () => {
    const acme = await org("Acme", "acme.example");
    await functionAgent("seo-analytics");
    await sql.run("UPDATE client_agents SET revoked_at = ? WHERE id = 'seo-analytics'", [NOW]);
    const beta = await org("Beta", "beta.example");
    await sql.run("UPDATE organizations SET updated_at = updated_at WHERE id = ?", [beta]);
    expect(await live("seo-analytics")).toEqual([acme]);
    const rotated = await postAgent({ agent_id: "seo-analytics", rotate: true });
    expect(rotated.status).toBe(200);
    expect(await live("seo-analytics")).toEqual([acme, beta].sort());
  });
});

describe("a new client", () => {
  it("gets every live function agent when staff create it, inside the D1 transaction", async () => {
    await org("Acme", "acme.example");
    for (const id of FUNCTION_IDS) await functionAgent(id);
    await functionAgent("revoked-one");
    await sql.run("UPDATE client_agents SET revoked_at = ? WHERE id = 'revoked-one'", [NOW]);
    const created = await createOrganization(sql, STAFF, { name: "Northwind", website: "northwind.example" }, NOW + 10);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const on = await listFunctionAgentsOnClient(sql, created.value.id);
    expect(on.map((row) => row.agentId).sort()).toEqual([...FUNCTION_IDS].sort());
    expect(await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM activities WHERE organization_id = ? AND kind = 'client_agent.assigned'", [created.value.id])).toEqual({ n: 4 });
  });

  it("does not give a lead function agents until it becomes a client", async () => {
    await functionAgent("seo-analytics");
    const created = await createOrganization(sql, STAFF, { name: "Prospect", kind: "lead" }, NOW + 10);
    if (!created.ok) throw new Error("not created");
    expect(await listFunctionAgentsOnClient(sql, created.value.id)).toEqual([]);
    await sql.run("UPDATE organizations SET kind = 'client' WHERE id = ?", [created.value.id]);
    // Winning the deal is the normal way a lead becomes a client.
    await sql.run("UPDATE organizations SET kind = 'lead' WHERE id = ?", [created.value.id]);
    const dealId = crypto.randomUUID();
    await sql.run("INSERT INTO deals (id, organization_id, title, stage, source, created_at, updated_at) VALUES (?, ?, 'Site', 'proposal', 'manual', ?, ?)", [dealId, created.value.id, NOW, NOW]);
    const won = await moveDealStage(sql, STAFF, { dealId, stage: "won" }, NOW + 20);
    expect(won.ok).toBe(true);
    expect((await listFunctionAgentsOnClient(sql, created.value.id)).map((row) => row.agentId)).toEqual(["seo-analytics"]);
  });

  it("gets them when an internal organization is marked as a real client", async () => {
    const test = await org("Test", "test.example", "client", { internal: true });
    await functionAgent("seo-analytics");
    expect(await live("seo-analytics")).toEqual([]);
    expect((await setOrganizationInternal(sql, STAFF, { organizationId: test, internal: false }, NOW + 5)).ok).toBe(true);
    expect(await live("seo-analytics")).toEqual([test]);
  });

  it("brings function agents along when a client agent is placed on a lead organization", async () => {
    const prospect = await org("Prospect", "prospect.example", "lead");
    await functionAgent("seo-analytics");
    expect(await live("seo-analytics")).toEqual([]);
    const made = await registerClientAgent(sql, { agentId: "prospect-lead", organizationId: prospect, role: "lead", actor: "cs", now: NOW });
    expect(made.ok).toBe(true);
    expect(await live("seo-analytics")).toEqual([prospect]);
    expect(await countLiveClients(sql, "seo-analytics")).toBe(1);
  });
});

describe("GET /api/agent-agents", () => {
  async function clientLead(domain: string, agentId: string): Promise<{ token: string; organizationId: string }> {
    const organizationId = await org(agentId, domain);
    const made = await registerClientAgent(sql, { agentId, organizationId, role: "lead", actor: "cs", now: NOW });
    if (!made.ok || !made.token) throw new Error("register failed");
    return { token: made.token, organizationId };
  }
  const get = (token: string | null, query = "") =>
    agentAgentsGet(new Request(`https://hq.example/api/agent-agents${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

  it("needs an agent token", async () => {
    expect((await get(null)).status).toBe(401);
    expect((await get("caw_not_a_real_token_value_000")).status).toBe(401);
  });

  it("lists the function agents on the caller's own clients, with what each does", async () => {
    const one = await clientLead("one.example", "one-lead");
    const two = await clientLead("two.example", "two-lead");
    await functionAgent("seo-analytics", "Search visibility and reporting. Choose it for rankings.");
    await functionAgent("creative-producer");
    await functionAgent("gone");
    await sql.run("UPDATE client_agents SET revoked_at = ? WHERE id = 'gone'", [NOW]);
    const res = await get(one.token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; clients: { organization_id: string; domain: string; agents: { agent_id: string; label: string; function: string; description: string }[] }[] };
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0]).toMatchObject({ organization_id: one.organizationId, domain: "one.example" });
    expect(body.clients[0].agents.map((row) => row.agent_id)).toEqual(["creative-producer", "seo-analytics"]);
    expect(body.clients[0].agents.find((row) => row.agent_id === "seo-analytics")).toMatchObject({ function: "SEO-ANALYTICS", description: "Search visibility and reporting. Choose it for rankings." });
    expect(JSON.stringify(body)).not.toContain(two.organizationId);
    expect(JSON.stringify(body)).not.toContain("token");
  });

  it("filters by client id, domain or space slug, and refuses a client that is not the caller's", async () => {
    const one = await clientLead("one.example", "one-lead");
    const two = await clientLead("two.example", "two-lead");
    await sql.run(
      `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id)
       VALUES ('ws-one', 'one-example', 'One', 'One', 'Studio', 'standard', 1, 1, 0, 'active', ?, ?)`,
      [NOW, one.organizationId],
    );
    await functionAgent("seo-analytics");
    for (const query of [`?client=${one.organizationId}`, "?client=one.example", "?client=https://www.one.example", "?client=one-example"]) {
      const res = await get(one.token, query);
      expect(res.status).toBe(200);
      expect(((await res.json()) as { clients: unknown[] }).clients).toHaveLength(1);
    }
    expect((await get(one.token, `?client=${two.organizationId}`)).status).toBe(403);
    expect((await get(one.token, "?client=two.example")).status).toBe(403);
    expect((await get(one.token, "?client=nope")).status).toBe(403);
  });

  it("changes nothing", async () => {
    const one = await clientLead("one.example", "one-lead");
    await functionAgent("seo-analytics");
    const count = () => db.prepare("SELECT (SELECT COUNT(*) FROM agent_assignments) + (SELECT COUNT(*) FROM activities) + (SELECT COUNT(*) FROM client_agents) AS n").get();
    const before = count();
    await get(one.token);
    expect(count()).toEqual(before);
  });

  it("lets a function agent see its siblings but not itself", async () => {
    await org("Acme", "acme.example");
    await functionAgent("seo-analytics");
    const res = await postAgent({ agent_id: "creative-producer", function: true, function_label: "Creative", description: "Pictures." });
    const { token } = (await res.json()) as { token: string };
    const principal = await agentForToken(sql, `Bearer ${token}`);
    expect(principal?.assignments).toHaveLength(1);
    const listed = (await (await get(token)).json()) as { clients: { agents: { agent_id: string }[] }[] };
    expect(listed.clients[0].agents.map((row) => row.agent_id)).toEqual(["seo-analytics"]);
  });
});
