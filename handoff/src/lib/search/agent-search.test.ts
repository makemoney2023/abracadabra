import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as searchGet } from "@/app/api/agent-search/route";
import { POST as cardsPost } from "@/app/api/agent-search/cards/route";
import { migrate } from "@/db/migrate";
import { migrateSearch } from "@/db/migrate-search";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { clientContext } from "@/lib/agent-context";
import { listAgentDispatches } from "@/lib/agent-dispatch";
import { agentForToken, endAssignment, registerClientAgent } from "@/lib/agent-work-filing";
import type { Caller } from "@/lib/authz";
import { runHqTool } from "@/lib/hq-tools";
import { recordSearchDataUpdated, searchUpdateRecipients } from "./agent-events";
import { loadAgentSearch, parseAgentRange, SEARCH_CARD_CREATED } from "./agent-search";
import { createSearchCard, SEARCH_CARDS_PER_DAY, searchCardTitle } from "./agent-search-cards";
import { opportunityId } from "./opportunities";

const NOW = Date.parse("2026-10-25T12:00:00Z");
const CTX = Symbol.for("__cloudflare-context__");
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };

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

let sql: Sql;
let searchSql: Sql;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)", [NOW]);
  const searchD1 = d1Over(new DatabaseSync(":memory:"));
  searchSql = d1Sql(searchD1);
  await migrateSearch(searchSql);
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, SEARCH_DB: searchD1 } };
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
});

async function org(id: string, domain: string) {
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [id, id, domain, NOW, NOW]);
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Website', 'active', ?, ?)", [`${id}-site`, id, NOW, NOW]);
}

async function property(id: string, organizationId: string, status = "active") {
  await sql.run(
    `INSERT INTO search_properties (id, organization_id, site_url, status, data_through, last_success_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, '2026-10-21', ?, ?, ?)`,
    [id, organizationId, `sc-domain:${id}.com`, status, NOW - 3_600_000, NOW, NOW],
  );
}

async function agent(organizationId: string, agentId: string, role: "lead" | "hire" = "lead") {
  const made = await registerClientAgent(sql, { agentId, label: agentId, organizationId, role, actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const principal = await agentForToken(sql, `Bearer ${made.token}`);
  if (!principal) throw new Error("token failed");
  return { token: made.token, principal };
}

/** 28 days of facts: site totals, a low-CTR query, a striking-distance query, and a page that lost clicks. */
async function facts(organizationId: string, propertyId: string) {
  const day = (offset: number) => new Date(Date.parse("2026-10-24T00:00:00Z") - offset * 86_400_000).toISOString().slice(0, 10);
  await searchSql.run("INSERT INTO search_queries (property_id, text) VALUES (?, 'blue shoes'), (?, 'red boots')", [propertyId, propertyId]);
  await searchSql.run("INSERT INTO search_pages (property_id, url) VALUES (?, ?)", [propertyId, `https://${propertyId}.com/sale`]);
  const q = async (text: string) => (await searchSql.get<{ id: number }>("SELECT id FROM search_queries WHERE property_id = ? AND text = ?", [propertyId, text]))!.id;
  const p = (await searchSql.get<{ id: number }>("SELECT id FROM search_pages WHERE property_id = ?", [propertyId]))!.id;
  for (let offset = 0; offset < 56; offset += 1) {
    const current = offset < 28;
    await searchSql.run(
      "INSERT INTO search_daily_site (organization_id, property_id, day, search_type, clicks, impressions, pos_sum, is_final) VALUES (?, ?, ?, 'web', ?, 200, 1000, 1)",
      [organizationId, propertyId, day(offset), current ? 5 : 6],
    );
    if (current) {
      await searchSql.run(
        "INSERT INTO search_daily_query (organization_id, property_id, day, query_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, 0, 40, 80)",
        [organizationId, propertyId, day(offset), await q("blue shoes")],
      );
      await searchSql.run(
        "INSERT INTO search_daily_query (organization_id, property_id, day, query_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, 0, 10, 120)",
        [organizationId, propertyId, day(offset), await q("red boots")],
      );
    }
    await searchSql.run(
      "INSERT INTO search_daily_page (organization_id, property_id, day, page_id, clicks, impressions, pos_sum) VALUES (?, ?, ?, ?, ?, 50, 250)",
      [organizationId, propertyId, day(offset), p, current ? 0 : 1],
    );
  }
}

const bearer = (token: string, init: RequestInit = {}): RequestInit => ({ ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } });

describe("GET /api/agent-search", () => {
  it("needs a token, and only reads clients the agent is assigned to", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await org("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "b.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await property("prop-b", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    await facts("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "prop-b");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    expect((await searchGet(new Request("https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))).status).toBe(401);
    const other = await searchGet(new Request("https://hq.example/api/agent-search?client=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bearer(lead.token)));
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: "This agent is not assigned to that client." });
    const byDomain = await searchGet(new Request("https://hq.example/api/agent-search?client=b.example", bearer(lead.token)));
    expect(byDomain.status).toBe(403);
    // Another client's property id is not this client's: 404, no data.
    const foreign = await searchGet(new Request("https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&property=prop-b", bearer(lead.token)));
    expect(foreign.status).toBe(404);
    const unknown = await searchGet(new Request("https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&property=nope", bearer(lead.token)));
    expect(unknown.status).toBe(404);
    const ok = await searchGet(new Request("https://hq.example/api/agent-search?client=a.example", bearer(lead.token)));
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { organization_id: string; properties: { id: string }[] };
    expect(body.organization_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(body.properties.map((row) => row.id)).toEqual(["prop-a"]);
    // A finished assignment loses access.
    await endAssignment(sql, { agentId: "a-lead", organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", actor: "test", now: NOW });
    expect([401, 403]).toContain((await searchGet(new Request("https://hq.example/api/agent-search?client=a.example", bearer(lead.token)))).status);
  });

  it("validates the range and defaults to 28 days", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    for (const bad of ["1y", "28", "DROP"]) {
      const response = await searchGet(new Request(`https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&range=${bad}`, bearer(lead.token)));
      expect(response.status).toBe(400);
    }
    const plain = (await (await searchGet(new Request("https://hq.example/api/agent-search", bearer(lead.token)))).json()) as { range: string };
    expect(plain.range).toBe("28d");
    const week = (await (await searchGet(new Request("https://hq.example/api/agent-search?range=7d", bearer(lead.token)))).json()) as { range: string };
    expect(week.range).toBe("7d");
    expect(parseAgentRange(null)).toBeNull();
    expect(parseAgentRange("16m")).toBe("16m");
    expect(parseAgentRange("12m")).toBeUndefined();
  });

  it("returns totals, change, top rows and opportunities, and notes one read per agent per day", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    const response = await searchGet(new Request("https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", bearer(lead.token)));
    const body = (await response.json()) as {
      source: string;
      properties: {
        state: string;
        data_through: string;
        last_sync_at: string;
        totals: { clicks: number; impressions: number };
        previous: { clicks: number };
        change: { clicks: { delta: number } };
        top_queries: { label: string }[];
        top_pages: { label: string }[];
        url_inspection: { daily_budget: number; used_today: number };
        opportunities: { id: string; type: string; query: string | null; page: string | null }[];
      }[];
      act: string;
    };
    expect(body.source).toBe("google_search_console");
    const [prop] = body.properties;
    expect(prop.state).toBe("ok");
    expect(prop.data_through).toBe("2026-10-21");
    expect(prop.totals).toMatchObject({ clicks: 140, impressions: 5600 });
    expect(prop.previous.clicks).toBe(168);
    expect(prop.change.clicks.delta).toBeCloseTo(-1 / 6);
    expect(prop.top_queries.map((row) => row.label).sort()).toEqual(["blue shoes", "red boots"]);
    expect(prop.top_pages).toHaveLength(1);
    expect(prop.url_inspection).toEqual({ daily_budget: 200, used_today: 0 });
    const kinds = prop.opportunities.map((row) => `${row.type}:${row.query ?? row.page}`).sort();
    expect(kinds).toEqual(["low_ctr:blue shoes", "page_drop:https://prop-a.com/sale", "striking_distance:red boots"]);
    expect(body.act).toContain("POST /api/agent-search/cards");
    await searchGet(new Request("https://hq.example/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", bearer(lead.token)));
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'search.agent_read'")).toEqual({ n: 1 });
  });

  it("says pending, empty, or unavailable instead of guessing", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-p", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "pending");
    await property("prop-e", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    const empty = await loadAgentSearch(sql, searchSql, { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", now: NOW });
    expect(empty.ok && empty.result.properties.map((row) => [row.id, row.state, row.reason])).toEqual([
      ["prop-p", "pending", null],
      ["prop-e", "empty", null],
    ]);
    const noDb = await loadAgentSearch(sql, null, { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", now: NOW });
    expect(noDb.ok && noDb.result.properties.map((row) => [row.state, row.reason])).toEqual([
      ["pending", null],
      ["unavailable", "no_db"],
    ]);
    const bare = d1Sql(d1Over(new DatabaseSync(":memory:")));
    const notReady = await loadAgentSearch(sql, bare, { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", propertyId: "prop-e", now: NOW });
    expect(notReady.ok && notReady.result.properties[0]).toMatchObject({ state: "unavailable", reason: "not_ready", opportunities: [] });
    const none = await loadAgentSearch(sql, searchSql, { organizationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", now: NOW });
    expect(none.ok && none.result.properties).toEqual([]);
  });
});

describe("search.data_updated: agents see new data right away", () => {
  it("writes one event per run key for the lead and SEO agents, and shows it in their dispatches", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await org("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "b.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    const seo = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "seo-analytics", "hire");
    const writer = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-writer", "hire");
    const otherLead = await agent("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "b-lead");
    expect(await searchUpdateRecipients(sql, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).toEqual(["a-lead", "seo-analytics"]);
    const input = { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", propertyId: "prop-a", siteUrl: "sc-domain:prop-a.com", runKey: "daily:prop-a:1", mode: "daily" as const, now: NOW };
    expect(await recordSearchDataUpdated({ sql, searchSql }, input)).toBe(true);
    expect(await recordSearchDataUpdated({ sql, searchSql }, input)).toBe(false);
    expect(await sql.get("SELECT count(*) AS n FROM activities WHERE kind = 'search.data_updated'")).toEqual({ n: 1 });
    const [update] = await listAgentDispatches(sql, lead.principal);
    expect(update).toMatchObject({ kind: "search_update", reason: "search_data", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", task_id: null });
    expect(update.search?.property_id).toBe("prop-a");
    expect(update.search?.read).toBe("/api/agent-search?client=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&property=prop-a");
    expect((update.search?.opportunities as { type: string }[]).length).toBe(3);
    expect(update.title).toContain("Search data updated for sc-domain:prop-a.com");
    expect((await listAgentDispatches(sql, seo.principal)).map((row) => row.kind)).toEqual(["search_update"]);
    expect(await listAgentDispatches(sql, writer.principal)).toEqual([]);
    expect(await listAgentDispatches(sql, otherLead.principal)).toEqual([]);
    // since= hides it once seen.
    expect(await listAgentDispatches(sql, lead.principal, NOW)).toEqual([]);
    // The API shows it as latest_update.
    const read = await loadAgentSearch(sql, searchSql, { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", now: NOW });
    expect(read.ok && read.result.latest_update).toMatchObject({ property_id: "prop-a", data_through: "2026-10-21" });
  });

  it("never throws into the sync job when the event cannot be written", async () => {
    const broken = { ...sql, get: async () => { throw new Error("boom"); } } as unknown as Sql;
    expect(
      await recordSearchDataUpdated({ sql: broken, searchSql }, { organizationId: "o", propertyId: "p", siteUrl: "s", runKey: "k", mode: "daily", now: NOW }),
    ).toBe(false);
  });
});

describe("POST /api/agent-search/cards", () => {
  it("turns a current opportunity into a card through the agent card path, with the evidence", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    const id = opportunityId("low_ctr", "blue shoes");
    const response = await cardsPost(new Request("https://hq.example/api/agent-search/cards", bearer(lead.token, { method: "POST", body: JSON.stringify({ client: "a.example", opportunity_id: id }) })));
    expect(response.status).toBe(201);
    const body = (await response.json()) as { task: { id: string; title: string; column: string; organization_id: string }; cards_left_today: number };
    expect(body.task).toMatchObject({ title: 'Search: lift CTR for "blue shoes"', column: "todo", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    expect(body.cards_left_today).toBe(SEARCH_CARDS_PER_DAY - 1);
    const board = await sql.get<{ body: string; data_json: string }>("SELECT body, data_json FROM activities WHERE kind = 'client_agent.board'");
    expect(board?.body).toContain("Staff only");
    expect(JSON.parse(board!.data_json)).toMatchObject({ action: "create", task_id: body.task.id });
    expect(await sql.get("SELECT created_by_kind, organization_id FROM tasks WHERE id = ?", [body.task.id])).toEqual({ created_by_kind: "agent", organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
    // Same opportunity while the card is open: 409 with that card.
    const again = await cardsPost(new Request("https://hq.example/api/agent-search/cards", bearer(lead.token, { method: "POST", body: JSON.stringify({ client: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", opportunity_id: id }) })));
    expect(again.status).toBe(409);
    expect(((await again.json()) as { task_id: string }).task_id).toBe(body.task.id);
    // Done frees it.
    await sql.run("UPDATE tasks SET status = 'done' WHERE id = ?", [body.task.id]);
    expect((await createSearchCard(sql, searchSql, lead.principal, { client: { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, opportunityId: id, now: NOW })).ok).toBe(true);
  });

  it("refuses other clients, made-up opportunities, bad ranges, and a missing SEARCH_DB", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await org("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "b.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await property("prop-b", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    await facts("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "prop-b");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    const id = opportunityId("low_ctr", "blue shoes");
    const post = (body: unknown) => cardsPost(new Request("https://hq.example/api/agent-search/cards", bearer(lead.token, { method: "POST", body: JSON.stringify(body) })));
    expect((await post({ client: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", opportunity_id: id })).status).toBe(403);
    expect((await post({ client: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", opportunity_id: "low_ctr:00000000" })).status).toBe(404);
    expect((await post({ client: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", opportunity_id: id, property: "prop-b" })).status).toBe(404);
    expect((await post({ client: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", opportunity_id: id, range: "1y" })).status).toBe(400);
    expect((await post({ client: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).status).toBe(400);
    expect(await createSearchCard(sql, null, lead.principal, { client: { organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, opportunityId: id, now: NOW })).toMatchObject({ ok: false, status: 503 });
    expect(await sql.get("SELECT count(*) AS n FROM tasks")).toEqual({ n: 0 });
  });

  it("stops at five search cards per client per UTC day", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const lead = await agent("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a-lead");
    for (let index = 0; index < SEARCH_CARDS_PER_DAY; index += 1) {
      await sql.run(
        "INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at) VALUES (?, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ?, 'agent', 'a-lead', 'x', ?, ?)",
        [crypto.randomUUID(), SEARCH_CARD_CREATED, JSON.stringify({ opportunity_id: `x:${index}`, task_id: `t-${index}` }), NOW - 1000],
      );
    }
    const id = opportunityId("striking_distance", "red boots");
    expect(await createSearchCard(sql, searchSql, lead.principal, { opportunityId: id, now: NOW })).toMatchObject({ ok: false, status: 429 });
    // Yesterday's cards don't count.
    expect((await createSearchCard(sql, searchSql, lead.principal, { opportunityId: id, now: NOW + 86_400_000 })).ok).toBe(true);
  });

  it("titles each kind for the HQ board", () => {
    const base = { id: "x", query: "q", page: "https://a.com/p?x=1", clicks: 0, impressions: 0, ctr: null, position: null, previous_clicks: null, clicks_at_stake: 0, why: "" };
    expect(searchCardTitle({ ...base, type: "striking_distance" })).toBe('Search: move "q" into the top 3');
    expect(searchCardTitle({ ...base, type: "query_drop" })).toBe('Search: clicks fell for "q"');
    expect(searchCardTitle({ ...base, type: "page_drop" })).toBe("Search: /p?x=1 is losing clicks");
    expect(searchCardTitle({ ...base, type: "site_drop" })).toBe("Search: site clicks fell vs the previous period");
  });
});

describe("HQ chat and client agent context", () => {
  it("search_console is a staff read tool scoped to a client staff can see", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const result = await runHqTool(sql, staff, { tool: "search_console", input: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", range: "28d" } }, NOW, { searchSql });
    expect(result).toMatchObject({ ok: true });
    expect((result as { value: { properties: { id: string }[] } }).value.properties.map((row) => row.id)).toEqual(["prop-a"]);
    expect(await runHqTool(sql, staff, { tool: "search_console", input: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", range: "1y" } }, NOW, { searchSql })).toEqual({ ok: false, error: "invalid" });
    expect(await runHqTool(sql, staff, { tool: "search_console", input: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", propertyId: "zzz" } }, NOW, { searchSql })).toEqual({ ok: false, error: "missing" });
    expect(await runHqTool(sql, staff, { tool: "search_console", input: { organizationId: "nope" } }, NOW, { searchSql })).toEqual({ ok: false, error: "missing" });
    const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [] };
    expect(await runHqTool(sql, client, { tool: "search_console", input: { organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }, NOW, { searchSql })).toEqual({ ok: false, error: "forbidden" });
  });

  it("adds a staff-only search section to the client context only when there is data", async () => {
    await org("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "a.example");
    await property("prop-a", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(await clientContext(sql, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { searchSql, now: NOW })).not.toHaveProperty("search");
    expect(await clientContext(sql, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).not.toHaveProperty("search");
    await facts("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "prop-a");
    const context = (await clientContext(sql, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", { searchSql, now: NOW })) as { search: { staffOnly: string; properties: { topOpportunities: unknown[] }[] } };
    expect(context.search.staffOnly).toContain("Never quote them to the client");
    expect(context.search.properties[0].topOpportunities).toHaveLength(3);
  });
});
