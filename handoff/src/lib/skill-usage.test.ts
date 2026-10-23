import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { GET as libraryGet } from "@/app/api/agent-skill-library/route";
import { GET as libraryReadGet } from "@/app/api/agent-skill-library/[...path]/route";
import { GET as agentSkillsGet } from "@/app/api/agent-skills/route";
import { GET as agentSkillGet } from "@/app/api/agent-skills/[...path]/route";
import { POST as boardTaskPost } from "@/app/api/agent-board/tasks/[taskId]/route";
import { POST as agentWorkPost } from "@/app/api/agent-work/route";
import { POST as chatSkillEventsPost } from "@/app/api/hq-chat/skill-events/route";
import { agentForToken, parseSkillsUsed, parseWorkPayload, registerClientAgent } from "./agent-work-filing";
import { grantSkills } from "./agent-skills";
import { skillPacksFromIndex, publishedLabel } from "./agent-admin";
import { fallbackSkillCard, libraryManifest, parseLibraryManifest, skillIndexFromFiles } from "./skill-library";
import { packsFrom, packOf } from "./skill-packs";
import { afterResponse, packOfPrefix, skillUsageStats, usageWindow, writeSkillEvents } from "./skill-usage";
import { suggestPacksForClient } from "./skill-suggest";
import { postSkillEvent, readEvent, searchEvent } from "./hq-chat-skill-log";
import { clientServicesReview } from "./task-review";
import { signHqChatToken } from "./hq-chat-token";

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

type EventRow = { event: string; actor_kind: string; actor_id: string | null; organization_id: string | null; task_id: string | null; path: string | null; prefix: string | null; query: string | null; status: number | null; source: string; work_item_id: string | null };

async function events(): Promise<EventRow[]> {
  return sql.all<EventRow>("SELECT event, actor_kind, actor_id, organization_id, task_id, path, prefix, query, status, source, work_item_id FROM skill_events ORDER BY rowid");
}

async function review(taskId: string, action: "approve" | "send_back", at: number) {
  await sql.run("UPDATE tasks SET review_requested_at = ?, status = 'doing' WHERE id = ?", [at - 1, taskId]);
  const result = await clientServicesReview(sql, { taskId, action, note: action === "send_back" ? "Tighten the headline." : undefined, now: at });
  if (!result.ok) throw new Error(`review failed: ${JSON.stringify(result)}`);
}

// ---------- Index and manifest ----------

describe("indexer fallback", () => {
  const teaser = "# Teaser\n\ndescription: Draft anonymous one-page company teasers for sell-side M&A processes.\n\n## Workflow\n";
  const raci = "## Purpose\nAssign Responsible, Accountable, Consulted, and Informed roles to major tasks.\n\n## Use when\n- ownership is blurry\n";

  it("indexes a file with no front matter from its description line", () => {
    expect(fallbackSkillCard("community/corp/02-finance/teaser/SKILL.md", teaser)).toEqual({
      name: "teaser",
      description: "Draft anonymous one-page company teasers for sell-side M&A processes.",
    });
  });

  it("falls back to the first plain paragraph, skipping headings, lists, and code", () => {
    expect(fallbackSkillCard("community/ba/skills/raci-matrix/SKILL.md", raci).description).toBe(
      "Assign Responsible, Accountable, Consulted, and Informed roles to major tasks.",
    );
    const fenced = "# T\n\n```\ncode line\n```\n\nReal words here.\n";
    expect(fallbackSkillCard("a/b/c/SKILL.md", fenced).description).toBe("Real words here.");
  });

  it("caps a long fallback description at 300 characters", () => {
    const long = `## Purpose\n${"word ".repeat(200)}\n`;
    const card = fallbackSkillCard("a/b/c/SKILL.md", long);
    expect(card.description.length).toBeLessThanOrEqual(300);
    expect(card.description.endsWith("…")).toBe(true);
  });

  it("keeps front matter when present and indexes every SKILL.md except org/", () => {
    const rows = skillIndexFromFiles([
      { path: "community/marketingskills/copywriting/SKILL.md", raw: "---\nname: copywriting\ndescription: Copy\n---\nBody" },
      { path: "community/corp/teaser/SKILL.md", raw: teaser },
      { path: "community/ba/skills/raci-matrix/SKILL.md", raw: raci },
      { path: "org/acme/secret/SKILL.md", raw: "---\nname: secret\n---\n" },
    ]);
    expect(rows.map((row) => [row.path, row.name])).toEqual([
      ["community/ba/skills/raci-matrix/SKILL.md", "raci-matrix"],
      ["community/corp/teaser/SKILL.md", "teaser"],
      ["community/marketingskills/copywriting/SKILL.md", "copywriting"],
    ]);
  });

  it("writes a manifest with counts and reads it back; junk reads as null", () => {
    const files = [
      { path: "a/b/one/SKILL.md", raw: "---\nname: one\n---\n" },
      { path: "a/b/two/SKILL.md", raw: "# Two\n\nNo front matter.\n" },
    ];
    const index = skillIndexFromFiles(files);
    const manifest = libraryManifest({ files, index, packCount: 1, gitSha: "abc", now: new Date(NOW) });
    expect(manifest).toEqual({ published_at: new Date(NOW).toISOString(), git_sha: "abc", file_count: 2, skill_count: 2, pack_count: 1, fallback_count: 1 });
    expect(parseLibraryManifest(JSON.stringify(manifest))).toEqual(manifest);
    expect(parseLibraryManifest("not json")).toBeNull();
    expect(parseLibraryManifest(JSON.stringify({ published_at: 1 }))).toBeNull();
  });
});

// ---------- Agents page counts ----------

describe("Agents page library summary", () => {
  it("uses the shared pack grouping: no context-engineering/SKILL.md/ pack, with skill count, descriptions, and manifest", async () => {
    const summary = await skillPacksFromIndex(bucket);
    if (!summary.ok) throw new Error("summary failed");
    const prefixes = summary.packs.map((pack) => pack.prefix);
    expect(prefixes).toEqual(packsFrom(INDEX.skills.map((skill) => ({ ...skill, pack: packOf(skill.path) }))).map((pack) => pack.prefix));
    expect(prefixes).toContain("context-engineering/");
    expect(prefixes.some((prefix) => prefix.includes("SKILL.md"))).toBe(false);
    expect(summary.skillCount).toBe(6);
    expect(summary.manifest?.git_sha).toBe("abc1234def");
    expect(summary.packs.find((pack) => pack.prefix === "community/marketingskills/")?.description).toContain("copywriting");
  });

  it("labels the publish time in Toronto time", () => {
    expect(publishedLabel("2026-10-09T23:34:49.742Z")).toMatch(/^Oct 9(, 2026)?, 7:34 PM ET$/);
    expect(publishedLabel(null)).toBeNull();
    expect(publishedLabel("nope")).toBeNull();
  });
});

// ---------- Logging from the agent APIs ----------

describe("usage logging", () => {
  it("logs a library list and a search with the agent and its only client", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    expect((await libraryGet(new Request("https://hq.example/api/agent-skill-library", { headers: auth }))).status).toBe(200);
    expect((await libraryGet(new Request("https://hq.example/api/agent-skill-library?q=copy&pack=community/marketingskills/", { headers: auth }))).status).toBe(200);
    const rows = await events();
    expect(rows.map((row) => row.event)).toEqual(["list", "search"]);
    expect(rows[1]).toMatchObject({ actor_kind: "agent", actor_id: "acme-lead", organization_id: org, prefix: "community/marketingskills/", source: "agent-skill-library" });
    expect(rows[1].query).toContain("q=copy");
  });

  it("logs reads with path, pack, card, and status, including a 404", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const read = (p: string) =>
      libraryReadGet(new Request(`https://hq.example/api/agent-skill-library/${p}?task_id=${taskId}`, { headers: auth }), { params: Promise.resolve({ path: p.split("/") }) });
    expect((await read("community/marketingskills/copywriting/SKILL.md")).status).toBe(200);
    expect((await read("community/missing/x/SKILL.md")).status).toBe(404);
    const rows = await events();
    expect(rows[0]).toMatchObject({ event: "read", path: "community/marketingskills/copywriting/SKILL.md", prefix: "community/marketingskills/", task_id: taskId, status: 200 });
    expect(rows[1]).toMatchObject({ event: "read", status: 404 });
  });

  it("logs granted list and read on /api/agent-skills, and a 403 read without a grant", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    await grantSkills(sql, { organizationId: org, prefixes: ["community/notfair-seo/"], actor: "test", now: NOW });
    expect((await agentSkillsGet(new Request("https://hq.example/api/agent-skills?q=audit", { headers: auth }))).status).toBe(200);
    const get = (p: string) => agentSkillGet(new Request(`https://hq.example/api/agent-skills/${p}`, { headers: auth }), { params: Promise.resolve({ path: p.split("/") }) });
    expect((await get("community/notfair-seo/seo-audit/SKILL.md")).status).toBe(200);
    expect((await get("community/marketingskills/copywriting/SKILL.md")).status).toBe(403);
    const rows = await events();
    expect(rows.map((row) => [row.event, row.status, row.source])).toEqual([
      ["search", 200, "agent-skills"],
      ["read", 200, "agent-skills"],
      ["read", 403, "agent-skills"],
    ]);
  });

  it("logs attach and detach on a card with its client", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const act = (body: unknown) =>
      boardTaskPost(new Request(`https://hq.example/api/agent-board/tasks/${taskId}`, { method: "POST", headers: auth, body: JSON.stringify(body) }), {
        params: Promise.resolve({ taskId }),
      });
    expect((await act({ action: "attach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(200);
    expect((await act({ action: "attach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(200);
    expect((await act({ action: "detach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(200);
    const rows = await events();
    expect(rows.map((row) => [row.event, row.prefix, row.task_id, row.organization_id])).toEqual([
      ["attach", "community/marketingskills/", taskId, org],
      ["detach", "community/marketingskills/", taskId, org],
    ]);
  });

  it("an attached pack keeps counting in usage after its card is done", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const act = (body: unknown) =>
      boardTaskPost(new Request(`https://hq.example/api/agent-board/tasks/${taskId}`, { method: "POST", headers: auth, body: JSON.stringify(body) }), {
        params: Promise.resolve({ taskId }),
      });
    expect((await act({ action: "attach_skills", prefixes: ["community/marketingskills/"] })).status).toBe(200);
    await sql.run("UPDATE tasks SET status = 'done' WHERE id = ?", [taskId]);
    const stats = await skillUsageStats(sql, { now: NOW + DAY, days: 30, libraryPacks: [] });
    expect(stats.totals.attaches).toBe(1);
    expect(stats.packs.find((row) => row.key === "community/marketingskills/")).toMatchObject({ attaches: 1, cards: 1 });
    // A done card can no longer take new attachments.
    expect((await act({ action: "attach_skills", prefixes: ["community/notfair-seo/"] })).status).toBe(409);
  });

  it("never fails a request when the log write fails", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    await sql.exec("DROP TABLE skill_events");
    const response = await libraryGet(new Request("https://hq.example/api/agent-skill-library", { headers: auth }));
    expect(response.status).toBe(200);
    await expect(writeSkillEvents(sql, [{ event: "list", actorKind: "agent", actorId: "x", source: "t", at: NOW }])).resolves.toBeUndefined();
  });

  it("defers the write through waitUntil when the Worker provides it", async () => {
    const pending: Promise<unknown>[] = [];
    (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, SKILLS: bucket }, ctx: { waitUntil: (p: Promise<unknown>) => pending.push(p) } };
    let ran = false;
    await afterResponse(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      ran = true;
    });
    expect(ran).toBe(false);
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(ran).toBe(true);
    await expect(afterResponse(async () => Promise.reject(new Error("boom")))).resolves.toBeUndefined();
  });
});

// ---------- Filings: skills_used ----------

describe("skills_used on filings", () => {
  it("parses and normalises skill paths, refusing org/ and non-skill paths", () => {
    expect(parseSkillsUsed(undefined)).toEqual({ ok: true, paths: [] });
    expect(parseSkillsUsed([".cursor/skills/community/marketingskills/copywriting/SKILL.md", "skills/community/marketingskills/copywriting/SKILL.md"])).toEqual({
      ok: true,
      paths: ["community/marketingskills/copywriting/SKILL.md"],
    });
    expect(parseSkillsUsed("community/x/SKILL.md")).toMatchObject({ ok: false });
    expect(parseSkillsUsed(["org/acme/secret/SKILL.md"])).toMatchObject({ ok: false });
    expect(parseSkillsUsed(["community/marketingskills/"])).toMatchObject({ ok: false });
    expect(parseSkillsUsed(Array.from({ length: 31 }, (_, i) => `a/b/s${i}/SKILL.md`))).toMatchObject({ ok: false });
    expect(parseWorkPayload({ external_id: "x", title: "t", summary: "s", skills_used: 3 })).toMatchObject({ ok: false });
  });

  it("stores known skills on the filing, logs one cite each on the card, and lists unknown ones back", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const response = await agentWorkPost(
      new Request("https://hq.example/api/agent-work", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          external_id: "run-1",
          title: "Landing page copy",
          content: "# Copy",
          task_id: taskId,
          skills_used: ["community/marketingskills/copywriting/SKILL.md", ".cursor/skills/community/notfair-seo/seo-audit/SKILL.md", "community/nope/x/SKILL.md"],
        }),
      }),
    );
    expect(response.status).toBe(201);
    const body = (await response.json()) as { work_item_id: string; skills_used: string[]; skills_unknown: string[] };
    expect(body.skills_used).toEqual(["community/marketingskills/copywriting/SKILL.md", "community/notfair-seo/seo-audit/SKILL.md"]);
    expect(body.skills_unknown).toEqual(["community/nope/x/SKILL.md"]);
    const row = await sql.get<{ skills_used_json: string }>("SELECT skills_used_json FROM agent_work_items WHERE id = ?", [body.work_item_id]);
    expect(JSON.parse(row!.skills_used_json)).toEqual(body.skills_used);
    const cites = (await events()).filter((event) => event.event === "cite");
    expect(cites).toHaveLength(2);
    expect(cites[0]).toMatchObject({ task_id: taskId, organization_id: org, work_item_id: body.work_item_id, source: "filing" });
  });

  it("a repeat filing records no second set of cites, and a bad skills_used is a 400", async () => {
    const { org, project } = await client();
    const { auth } = await agent(org);
    const taskId = await card(org, project);
    const post = (extra: Record<string, unknown>) =>
      agentWorkPost(
        new Request("https://hq.example/api/agent-work", {
          method: "POST",
          headers: auth,
          body: JSON.stringify({ external_id: "run-2", title: "Copy", content: "x", task_id: taskId, ...extra }),
        }),
      );
    await post({ skills_used: ["community/marketingskills/copywriting/SKILL.md"] });
    await post({ skills_used: ["community/marketingskills/copywriting/SKILL.md"] });
    expect((await events()).filter((event) => event.event === "cite")).toHaveLength(1);
    expect((await post({ external_id: "run-3", skills_used: ["../etc/passwd"] })).status).toBe(400);
  });

  it("filings without skills_used keep an empty list", async () => {
    const { org } = await client();
    const { auth } = await agent(org);
    const response = await agentWorkPost(
      new Request("https://hq.example/api/agent-work", { method: "POST", headers: auth, body: JSON.stringify({ external_id: "n1", title: "Note", summary: "s" }) }),
    );
    const body = (await response.json()) as { work_item_id: string; skills_used?: string[] };
    expect(body.skills_used).toBeUndefined();
    const row = await sql.get<{ skills_used_json: string }>("SELECT skills_used_json FROM agent_work_items WHERE id = ?", [body.work_item_id]);
    expect(row?.skills_used_json).toBe("[]");
  });
});

// ---------- Staff chat ----------

describe("staff chat skill tools", () => {
  it("records search and read events for signed-in staff and refuses anyone else", async () => {
    process.env.HQ_CHAT_SECRET = "chat-secret-for-tests";
    await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-staff', 'staff@abra.example', 0, ?, NULL)", [NOW]);
    const token = signHqChatToken("user-staff", "chat-secret-for-tests", Date.now());
    const post = (auth: string, body: unknown) =>
      chatSkillEventsPost(new Request("https://hq.example/api/hq-chat/skill-events", { method: "POST", headers: { authorization: auth, "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect((await post(`Bearer ${token}`, searchEvent("seo audit", { ok: true, skills: [1, 2] }))).status).toBe(202);
    expect((await post(`Bearer ${token}`, { ...readEvent("community/notfair-seo/seo-audit/SKILL.md", { ok: true, path: "community/notfair-seo/seo-audit/SKILL.md" }), organization_id: "org-1" })).status).toBe(202);
    expect((await post("Bearer forged", { event: "read" })).status).toBe(401);
    expect((await post(`Bearer ${token}`, { event: "delete" })).status).toBe(400);
    const rows = await events();
    expect(rows.map((row) => [row.event, row.actor_kind, row.actor_id, row.source])).toEqual([
      ["search", "staff", "user-staff", "staff-chat"],
      ["read", "staff", "user-staff", "staff-chat"],
    ]);
    expect(rows[1]).toMatchObject({ organization_id: "org-1", prefix: "community/notfair-seo/" });
  });

  it("the DO's poster sends the chat token and swallows network errors", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    await postSkillEvent("https://hq.example/", "tok", { event: "search", query: "q" }, (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response("{}");
    }) as unknown as typeof fetch);
    expect(calls[0].url).toBe("https://hq.example/api/hq-chat/skill-events");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    await expect(postSkillEvent("https://hq.example", "tok", { event: "read" }, (async () => Promise.reject(new Error("down"))) as unknown as typeof fetch)).resolves.toBeUndefined();
    await expect(postSkillEvent("", "tok", { event: "read" })).resolves.toBeUndefined();
  });
});

// ---------- Stats ----------

describe("usage stats", () => {
  it("counts reads, cites, cards, and joins Client Services approve and send-back outcomes", async () => {
    const { org, project } = await client();
    const { principal } = await agent(org);
    const good = await card(org, project, "Good card");
    const bounced = await card(org, project, "Bounced card");
    const copy = "community/marketingskills/copywriting/SKILL.md";
    const seo = "community/notfair-seo/seo-audit/SKILL.md";
    const base = { actorKind: "agent" as const, actorId: principal.agentId, organizationId: org, source: "test" };
    await writeSkillEvents(sql, [
      { ...base, event: "read", path: copy, taskId: good, status: 200, at: NOW - DAY },
      { ...base, event: "cite", path: copy, taskId: good, at: NOW - DAY },
      { ...base, event: "read", path: copy, taskId: bounced, status: 200, at: NOW - 2 * DAY },
      { ...base, event: "read", path: seo, taskId: bounced, status: 200, at: NOW - 3 * DAY },
      { ...base, event: "read", path: seo, status: 403, at: NOW - DAY },
      { ...base, event: "attach", prefix: "community/marketingskills/", taskId: good, at: NOW - DAY },
      { ...base, event: "search", query: "q=copy", at: NOW - DAY },
    ]);
    await review(good, "approve", NOW - DAY / 2);
    await review(bounced, "send_back", NOW - DAY / 2);
    const stats = await skillUsageStats(sql, {
      now: NOW,
      days: 30,
      libraryPacks: [
        { prefix: "community/marketingskills/", count: 2 },
        { prefix: "community/notfair-seo/", count: 1 },
        { prefix: "plugins/superpowers/", count: 1 },
      ],
    });
    expect(stats.totals).toMatchObject({ reads: 3, failedReads: 1, cites: 1, attaches: 1, searches: 1 });
    const copyRow = stats.skills.find((row) => row.key === copy)!;
    expect(copyRow).toMatchObject({ reads: 2, cites: 1, cards: 2, reviewed: 2, approved: 1, sentBack: 1, approvalRate: 0.5, agents: 1 });
    const marketing = stats.packs.find((row) => row.key === "community/marketingskills/")!;
    expect(marketing).toMatchObject({ attaches: 1, cards: 2, approved: 1, sentBack: 1 });
    const seoPack = stats.packs.find((row) => row.key === "community/notfair-seo/")!;
    expect(seoPack).toMatchObject({ reads: 1, approved: 0, sentBack: 1, approvalRate: 0 });
    expect(stats.neverUsedPacks).toEqual([{ prefix: "plugins/superpowers/", count: 1 }]);
    expect(copyRow.lastUsedAt).toBe(NOW - DAY);
  });

  it("a card sent back and then approved counts as approved and as sent back once", async () => {
    const { org, project } = await client();
    const taskId = await card(org, project);
    await writeSkillEvents(sql, [{ event: "cite", actorKind: "agent", actorId: "a", taskId, path: "community/marketingskills/copywriting/SKILL.md", source: "t", at: NOW - DAY }]);
    await review(taskId, "send_back", NOW - DAY / 2);
    await review(taskId, "approve", NOW - DAY / 4);
    const stats = await skillUsageStats(sql, { now: NOW, days: 7, libraryPacks: [] });
    expect(stats.skills[0]).toMatchObject({ reviewed: 1, approved: 1, sentBack: 1, approvalRate: 1 });
  });

  it("windows to 7/30/90 days, while never-used looks at all time", async () => {
    await writeSkillEvents(sql, [{ event: "read", actorKind: "agent", actorId: "a", path: "community/notfair-seo/seo-audit/SKILL.md", status: 200, source: "t", at: NOW - 40 * DAY }]);
    const week = await skillUsageStats(sql, { now: NOW, days: 7, libraryPacks: [{ prefix: "community/notfair-seo/", count: 1 }] });
    expect(week.skills).toEqual([]);
    expect(week.neverUsedPacks).toEqual([]);
    const quarter = await skillUsageStats(sql, { now: NOW, days: 90, libraryPacks: [{ prefix: "community/notfair-seo/", count: 1 }] });
    expect(quarter.skills).toHaveLength(1);
    expect(usageWindow("90")).toBe(90);
    expect(usageWindow("5")).toBe(30);
    expect(usageWindow(undefined)).toBe(30);
  });

  it("rolls deeper prefixes and single skills up to their pack", () => {
    expect(packOfPrefix("community/awesome-claude-corporate-skills/07-operations/")).toBe("community/awesome-claude-corporate-skills/");
    expect(packOfPrefix("community/marketingskills/")).toBe("community/marketingskills/");
    expect(packOfPrefix("context-engineering/")).toBe("context-engineering/");
    expect(packOfPrefix("community/openvid/SKILL.md")).toBe("community/openvid/");
  });

  it("is empty before anything is logged", async () => {
    const stats = await skillUsageStats(sql, { now: NOW, days: 30, libraryPacks: [{ prefix: "a/b/", count: 3 }] });
    expect(stats).toMatchObject({ packs: [], skills: [], trackingSince: null, neverUsedPacks: [{ prefix: "a/b/", count: 3 }] });
  });
});

// ---------- Suggestions ----------

describe("suggested packs per client", () => {
  const packs = [
    "community/marketingskills/",
    "community/notfair-seo/",
    "user/natural-human-voice/",
    "community/advertising-skills/",
    "integrations/google-ads/",
    "integrations/google-search-console/",
    "community/text-to-cad/",
    "plugins/superpowers/",
    "integrations/github/",
    "community/awesome-claude-corporate-skills/",
    "community/business-analysis-skills/",
  ].map((prefix) => ({ prefix, name: prefix.split("/").filter(Boolean).slice(-1)[0], description: "", count: 3 }));

  it("suggests clinic marketing packs for a dental implant client", () => {
    const picks = suggestPacksForClient({ id: "r", name: "Renew Implants", website: "https://www.renewimplants.ca/" }, packs).map((pick) => pick.prefix);
    expect(picks).toContain("community/marketingskills/");
    expect(picks).toContain("community/advertising-skills/");
    expect(picks).not.toContain("plugins/superpowers/");
  });

  it("suggests construction and build packs, skips granted ones, and only names library packs", () => {
    const picks = suggestPacksForClient(
      { id: "s", name: "Strong Foam Insulation Inc.", domain: "strongfoam.com", notes: "CRM and ERP app" },
      packs,
      8,
      ["community/marketingskills/"],
    );
    const prefixes = picks.map((pick) => pick.prefix);
    expect(prefixes).not.toContain("community/marketingskills/");
    expect(prefixes).toContain("plugins/superpowers/");
    expect(prefixes.every((prefix) => packs.some((pack) => pack.prefix === prefix))).toBe(true);
    expect(picks[0].reason).toMatch(/^Fits /);
  });

  it("reads the domain without its TLD, so abra-ca-dabra.app is not a software client", () => {
    const picks = suggestPacksForClient({ id: "a", name: "Abracadabra", domain: "abra-ca-dabra.app", website: "https://abra-ca-dabra.app", notes: "AI agency" }, packs).map((pick) => pick.prefix);
    expect(picks).toContain("community/marketingskills/");
    expect(picks).not.toContain("plugins/superpowers/");
  });

  it("suggests the corporate pack for a holding company and nothing for an empty client", () => {
    expect(suggestPacksForClient({ id: "l", name: "LioCorr Holdings Inc." }, packs).map((pick) => pick.prefix)).toContain("community/awesome-claude-corporate-skills/");
    expect(suggestPacksForClient({ id: "x", name: "Zq" }, packs)).toEqual([]);
  });
});
