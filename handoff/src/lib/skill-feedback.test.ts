import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as guideGet } from "@/app/api/agent-skill-guide/route";
import { GET as csLibraryGet } from "@/app/api/client-services/skill-library/route";
import { GET as csLibraryReadGet } from "@/app/api/client-services/skill-library/[...path]/route";
import { GET as grantsGet, POST as grantsPost } from "@/app/api/client-services/skill-grants/route";
import { POST as agentWorkPost } from "@/app/api/agent-work/route";
import { agentForToken, parseSkillFeedback, parseWorkPayload, registerClientAgent } from "./agent-work-filing";
import { grantSkills } from "./agent-skills";
import { AGENT_SKILL_GUIDE } from "./agent-skill-guide";
import { signHqChatToken } from "./hq-chat-token";
import { skillUsageStats } from "./skill-usage";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;
const CTX = Symbol.for("__cloudflare-context__");
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

class FakeSkills {
  constructor(private readonly objects: Record<string, string>) {}
  async get(key: string) {
    const value = this.objects[key];
    return value == null ? null : { text: async () => value };
  }
}

const INDEX = {
  skills: [
    { name: "copywriting", description: "Write landing page copy", path: "community/marketingskills/copywriting/SKILL.md" },
    { name: "page-cro", description: "Improve page conversion", path: "community/marketingskills/page-cro/SKILL.md" },
    { name: "seo-audit", description: "Audit a site for search", path: "community/notfair-seo/seo-audit/SKILL.md" },
    { name: "context-engineering", description: "Context engineering basics", path: "context-engineering/SKILL.md" },
    { name: "tools", description: "Context tools", path: "context-engineering/skills/tools/SKILL.md" },
    { name: "superpowers", description: "Software build discipline", path: "plugins/superpowers/tdd/SKILL.md" },
  ],
};

const bucket = new FakeSkills({
  "skills/index.json": JSON.stringify(INDEX),
  "skills/manifest.json": JSON.stringify({ published_at: "2026-10-09T23:34:49.742Z", git_sha: "abc1234def", file_count: 6, skill_count: 6, pack_count: 5, fallback_count: 1 }),
  "skills/community/marketingskills/copywriting/SKILL.md": "---\nname: copywriting\n---\nWrite clearly.",
  "skills/community/notfair-seo/seo-audit/SKILL.md": "---\nname: seo-audit\n---\nCheck titles.",
});

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  root = mkdtempSync(path.join(tmpdir(), "skill-usage-"));
  process.env.HANDOFF_OBJECT_PATH = root;
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, SKILLS: bucket } };
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.HANDOFF_OBJECT_PATH;
  delete process.env.HQ_CHAT_SECRET;
  delete process.env.CLIENT_SERVICES_TOKEN;
});

async function client(name = "Acme Dental", domain = "acme.example") {
  const org = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)", [org, name, domain, NOW, NOW]);
  const project = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Site', 'active', ?, ?)", [project, org, NOW, NOW]);
  const space = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, ?, ?, ?, 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [space, domain.split(".")[0], domain, name, NOW, org, project],
  );
  return { org, project };
}

async function card(org: string, project: string, title = "Landing page", status = "doing", stage = "build"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, stage, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    [id, project, org, title, status, stage, NOW, NOW],
  );
  return id;
}

async function agent(org: string, agentId = "acme-lead") {
  const made = await registerClientAgent(sql, { agentId, label: `${agentId} bot`, organizationId: org, role: "lead", actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  return { principal: (await agentForToken(sql, `Bearer ${made.token}`))!, auth: { authorization: `Bearer ${made.token}`, "content-type": "application/json" } };
}


const CS_TOKEN = "cs-token-for-tests";

type FeedbackRow = { agent_id: string; organization_id: string | null; task_id: string | null; work_item_id: string; path: string; prefix: string; useful: number; note: string | null };

async function feedbackRows(): Promise<FeedbackRow[]> {
  return sql.all<FeedbackRow>("SELECT agent_id, organization_id, task_id, work_item_id, path, prefix, useful, note FROM skill_feedback ORDER BY path");
}

function file(auth: Record<string, string>, body: Record<string, unknown>) {
  return agentWorkPost(new Request("https://hq.example/api/agent-work", { method: "POST", headers: auth, body: JSON.stringify({ title: "Copy", content: "# Copy", ...body }) }));
}

async function stats() {
  return skillUsageStats(sql, {
    now: NOW + DAY,
    days: 30,
    libraryPacks: [{ prefix: "community/marketingskills/", count: 2 }],
  });
}

const csHeaders = { authorization: `Bearer ${CS_TOKEN}`, "content-type": "application/json" };

describe("parseSkillFeedback", () => {
  it("accepts entries, normalises paths, keeps the last verdict per skill, and trims notes", () => {
    expect(parseSkillFeedback(undefined)).toEqual({ ok: true, items: [] });
    expect(
      parseSkillFeedback([
        { path: ".cursor/skills/community/marketingskills/copywriting/SKILL.md", useful: true },
        { path: "community/marketingskills/copywriting/SKILL.md", useful: false, note: `  ${"x".repeat(600)}  ` },
        { path: "community/marketingskills/page-cro/SKILL.md", useful: true, note: "  " },
      ]),
    ).toEqual({
      ok: true,
      items: [
        { path: "community/marketingskills/copywriting/SKILL.md", useful: false, note: "x".repeat(500) },
        { path: "community/marketingskills/page-cro/SKILL.md", useful: true, note: null },
      ],
    });
  });

  it("refuses a non-list, a missing or non-boolean useful, org/ paths, pack paths, and more than 30 entries", () => {
    expect(parseSkillFeedback("nope")).toMatchObject({ ok: false });
    expect(parseSkillFeedback([{ path: "community/marketingskills/copywriting/SKILL.md" }])).toMatchObject({ ok: false });
    expect(parseSkillFeedback([{ path: "community/marketingskills/copywriting/SKILL.md", useful: "yes" }])).toMatchObject({ ok: false });
    expect(parseSkillFeedback([{ path: "org/acme/secret/SKILL.md", useful: true }])).toMatchObject({ ok: false });
    expect(parseSkillFeedback([{ path: "community/marketingskills/", useful: true }])).toMatchObject({ ok: false });
    expect(parseSkillFeedback(["community/marketingskills/copywriting/SKILL.md"])).toMatchObject({ ok: false });
    expect(parseSkillFeedback(Array.from({ length: 31 }, (_, i) => ({ path: `a/b/s${i}/SKILL.md`, useful: true })))).toMatchObject({ ok: false });
    expect(parseWorkPayload({ external_id: "x", title: "t", summary: "s", skill_feedback: [{ path: "a/b/c/SKILL.md" }] })).toMatchObject({ ok: false });
  });
});

describe("skill_feedback on filings", () => {
  it("stores verdicts on the card, drops unknown paths, and counts Useful / Not useful per pack and skill", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const response = await file(auth, {
      external_id: "run-1",
      task_id: taskId,
      skills_used: ["community/marketingskills/copywriting/SKILL.md"],
      skill_feedback: [
        { path: "community/marketingskills/copywriting/SKILL.md", useful: true, note: "Clear structure." },
        { path: "community/marketingskills/page-cro/SKILL.md", useful: false, note: "Assumes ecommerce." },
        { path: "community/nope/x/SKILL.md", useful: true },
      ],
    });
    expect(response.status).toBeLessThan(300);
    const body = (await response.json()) as { work_item_id: string; skill_feedback: { path: string; useful: boolean }[]; skill_feedback_unknown: string[] };
    expect(body.skill_feedback).toEqual([
      { path: "community/marketingskills/copywriting/SKILL.md", useful: true },
      { path: "community/marketingskills/page-cro/SKILL.md", useful: false },
    ]);
    expect(body.skill_feedback_unknown).toEqual(["community/nope/x/SKILL.md"]);
    const rows = await feedbackRows();
    expect(rows).toEqual([
      { agent_id: "acme-lead", organization_id: org, task_id: taskId, work_item_id: body.work_item_id, path: "community/marketingskills/copywriting/SKILL.md", prefix: "community/marketingskills/", useful: 1, note: "Clear structure." },
      { agent_id: "acme-lead", organization_id: org, task_id: taskId, work_item_id: body.work_item_id, path: "community/marketingskills/page-cro/SKILL.md", prefix: "community/marketingskills/", useful: 0, note: "Assumes ecommerce." },
    ]);
    const usage = await stats();
    expect(usage.totals).toMatchObject({ useful: 1, notUseful: 1, cites: 1 });
    expect(usage.packs.find((row) => row.key === "community/marketingskills/")).toMatchObject({ useful: 1, notUseful: 1, cites: 1 });
    expect(usage.skills.find((row) => row.key === "community/marketingskills/copywriting/SKILL.md")).toMatchObject({ useful: 1, notUseful: 0 });
    // page-cro was never read or cited but still gets a row from its verdict.
    expect(usage.skills.find((row) => row.key === "community/marketingskills/page-cro/SKILL.md")).toMatchObject({ useful: 0, notUseful: 1, reads: 0, cites: 0 });
  });

  it("records feedback without skills_used, and a repeated filing records nothing more", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    const send = () => file(auth, { external_id: "run-2", skill_feedback: [{ path: "community/notfair-seo/seo-audit/SKILL.md", useful: true }] });
    expect((await send()).status).toBeLessThan(300);
    expect((await send()).status).toBeLessThan(300);
    expect(await feedbackRows()).toHaveLength(1);
  });

  it("answers 400 for a malformed skill_feedback and files nothing", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    const response = await file(auth, { external_id: "run-3", skill_feedback: [{ path: "community/marketingskills/copywriting/SKILL.md", useful: "maybe" }] });
    expect(response.status).toBe(400);
    expect(await feedbackRows()).toEqual([]);
    expect(await sql.get("SELECT id FROM agent_work_items WHERE external_id = 'run-3'")).toBeFalsy();
  });

  it("never fails a filing when the feedback write fails", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    await sql.exec("CREATE TRIGGER skill_feedback_fail BEFORE INSERT ON skill_feedback BEGIN SELECT RAISE(ABORT, 'disk full'); END");
    const response = await file(auth, { external_id: "run-4", skill_feedback: [{ path: "community/marketingskills/copywriting/SKILL.md", useful: true }] });
    expect(response.status).toBeLessThan(300);
    expect(await feedbackRows()).toEqual([]);
  });

  it("reads the usage page as zero when the feedback table is missing", async () => {
    await sql.exec("DROP TABLE skill_feedback");
    await expect(stats()).resolves.toMatchObject({ totals: { useful: 0, notUseful: 0 } });
  });
});

describe("agent skills guide", () => {
  it("is served as markdown to an agent token and to Client Services, and refuses everyone else", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    const { org } = await client();
    const { auth } = await agent(org);
    expect((await guideGet(new Request("https://hq.example/api/agent-skill-guide"))).status).toBe(401);
    expect((await guideGet(new Request("https://hq.example/api/agent-skill-guide", { headers: { authorization: "Bearer nope" } }))).status).toBe(401);
    const asAgent = await guideGet(new Request("https://hq.example/api/agent-skill-guide", { headers: auth }));
    expect(asAgent.status).toBe(200);
    expect(asAgent.headers.get("content-type")).toMatch(/text\/markdown/);
    const text = await asAgent.text();
    expect(text).toBe(AGENT_SKILL_GUIDE);
    for (const word of ["Discover", "Pick", "Load", "Attach", "Cite", "skill_feedback", "useful"]) expect(text).toContain(word);
    const asCs = await guideGet(new Request("https://hq.example/api/agent-skill-guide?format=json", { headers: csHeaders }));
    expect(asCs.status).toBe(200);
    expect(await asCs.json()).toEqual({ guide: AGENT_SKILL_GUIDE });
  });
});

describe("Client Services skill library (read-only)", () => {
  it("lists packs, searches, and reads a skill with the Client Services token, and hides org/", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    const list = await csLibraryGet(new Request("https://hq.example/api/client-services/skill-library", { headers: csHeaders }));
    expect(list.status).toBe(200);
    const packs = (await list.json()) as { packs: { prefix: string }[]; skill_count: number };
    expect(packs.skill_count).toBe(6);
    expect(packs.packs.map((pack) => pack.prefix)).toContain("community/marketingskills/");
    const found = await csLibraryGet(new Request("https://hq.example/api/client-services/skill-library?q=copy", { headers: csHeaders }));
    expect(((await found.json()) as { skills: { path: string }[] }).skills.map((skill) => skill.path)).toEqual(["community/marketingskills/copywriting/SKILL.md"]);
    const read = await csLibraryReadGet(new Request("https://hq.example/x", { headers: csHeaders }), { params: Promise.resolve({ path: ["community", "marketingskills", "copywriting", "SKILL.md"] }) });
    expect(read.status).toBe(200);
    expect(((await read.json()) as { body: string }).body).toContain("Write clearly.");
    const hidden = await csLibraryReadGet(new Request("https://hq.example/x", { headers: csHeaders }), { params: Promise.resolve({ path: ["org", "acme", "secret", "SKILL.md"] }) });
    expect(hidden.status).toBe(404);
    const events = await sql.all<{ event: string; actor_kind: string; actor_id: string; source: string; status: number | null }>(
      "SELECT event, actor_kind, actor_id, source, status FROM skill_events ORDER BY rowid",
    );
    expect(events.map((row) => [row.event, row.actor_kind, row.actor_id, row.source, row.status])).toEqual([
      ["list", "system", "client-services", "client-services-skill-library", 200],
      ["search", "system", "client-services", "client-services-skill-library", 200],
      ["read", "system", "client-services", "client-services-skill-library", 200],
      ["read", "system", "client-services", "client-services-skill-library", 404],
    ]);
  });

  it("refuses an agent token, a wrong token, and no token, and offers no write", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    const { org } = await client();
    const { auth } = await agent(org);
    for (const headers of [auth, { authorization: "Bearer wrong" }, {}] as Record<string, string>[]) {
      expect((await csLibraryGet(new Request("https://hq.example/api/client-services/skill-library", { headers }))).status).toBe(401);
      const read = await csLibraryReadGet(new Request("https://hq.example/x", { headers }), { params: Promise.resolve({ path: ["community", "marketingskills", "copywriting", "SKILL.md"] }) });
      expect(read.status).toBe(401);
    }
    const route = await import("@/app/api/client-services/skill-library/route");
    expect(Object.keys(route).filter((key) => ["POST", "PUT", "PATCH", "DELETE"].includes(key))).toEqual([]);
    const nested = await import("@/app/api/client-services/skill-library/[...path]/route");
    expect(Object.keys(nested).filter((key) => ["POST", "PUT", "PATCH", "DELETE"].includes(key))).toEqual([]);
  });
});

describe("GET /api/client-services/skill-grants", () => {
  async function seed() {
    const a = await client("Acme Dental", "acme.example");
    const b = await client("Beta Law", "beta.example");
    await agent(a.org, "acme-lead");
    await agent(b.org, "beta-lead");
    await grantSkills(sql, { agentId: "acme-lead", prefixes: ["community/marketingskills/"], actor: "client-services", now: NOW });
    await grantSkills(sql, { organizationId: a.org, prefixes: ["community/notfair-seo/"], actor: "client-services", now: NOW + 1 });
    await grantSkills(sql, { agentId: "beta-lead", prefixes: ["plugins/superpowers/"], actor: "client-services", now: NOW + 2 });
    return { a, b };
  }

  async function grants(query = "", headers: Record<string, string> = csHeaders) {
    const response = await grantsGet(new Request(`https://hq.example/api/client-services/skill-grants${query}`, { headers }));
    return { status: response.status, body: (await response.json()) as { grants?: { scope: string; agent_id: string | null; organization_id: string | null; organization_name: string | null; prefix: string; granted_by: string; revoked_at: string | null }[] } };
  }

  it("lists live grants for Client Services, newest first, with agent and client scopes", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    const { a } = await seed();
    const { status, body } = await grants();
    expect(status).toBe(200);
    expect(body.grants?.map((grant) => [grant.scope, grant.agent_id, grant.organization_name, grant.prefix, grant.granted_by])).toEqual([
      ["agent", "beta-lead", null, "plugins/superpowers/", "client-services"],
      ["client", null, "Acme Dental", "community/notfair-seo/", "client-services"],
      ["agent", "acme-lead", null, "community/marketingskills/", "client-services"],
    ]);
    expect((await grants(`?client=${a.org}`)).body.grants?.map((grant) => grant.prefix)).toEqual(["community/notfair-seo/"]);
    expect((await grants("?client=beta.example")).body.grants).toEqual([]);
    expect((await grants("?agent_id=ACME-LEAD")).body.grants?.map((grant) => grant.prefix)).toEqual(["community/marketingskills/"]);
    expect((await grants("?client=nobody.example")).status).toBe(404);
  });

  it("hides revoked grants unless asked", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    await seed();
    await grantsPost(new Request("https://hq.example/api/client-services/skill-grants", { method: "POST", headers: csHeaders, body: JSON.stringify({ agent_id: "acme-lead", prefixes: ["community/marketingskills/"], revoke: true }) }));
    expect((await grants()).body.grants?.map((grant) => grant.prefix)).not.toContain("community/marketingskills/");
    const all = (await grants("?include_revoked=1")).body.grants ?? [];
    expect(all.find((grant) => grant.prefix === "community/marketingskills/")?.revoked_at).toMatch(/^\d{4}-/);
  });

  it("serves live HQ staff by chat token, and refuses agents, revoked staff, and strangers", async () => {
    process.env.CLIENT_SERVICES_TOKEN = CS_TOKEN;
    process.env.HQ_CHAT_SECRET = "chat-secret-for-tests";
    await seed();
    await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-staff', 'staff@abra.example', 0, ?, NULL)", [NOW]);
    await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-gone', 'gone@abra.example', 0, ?, ?)", [NOW, NOW]);
    const staff = { authorization: `Bearer ${signHqChatToken("user-staff", "chat-secret-for-tests", Date.now())}` };
    const gone = { authorization: `Bearer ${signHqChatToken("user-gone", "chat-secret-for-tests", Date.now())}` };
    expect((await grants("", staff)).body.grants).toHaveLength(3);
    expect((await grants("", gone)).status).toBe(403);
    expect((await grants("", { authorization: "Bearer wrong" })).status).toBe(401);
    expect((await grants("", {})).status).toBe(401);
    const { org } = await client("Gamma", "gamma.example");
    const { auth } = await agent(org, "gamma-lead");
    expect((await grants("", auth)).status).toBe(401);
  });
});
