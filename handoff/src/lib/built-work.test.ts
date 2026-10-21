import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { GET as agentWorkGet, POST as agentWorkPost } from "@/app/api/agent-work/route";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { readPreviewFile } from "@/lib/preview";
import { agentForToken, fileAgentWork, registerClientAgent } from "./agent-work-filing";
import { withdrawFiling } from "./agent-filing-review";
import { clientServicesReview } from "./task-review";
import { parseFilingSummary } from "./filing-summary";
import { listClientAgentWork } from "./agent-admin";
import { builtWorkMarkdown, displayHost, listBuiltWork, parseBuiltWork } from "./built-work";

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
  root = mkdtempSync(path.join(tmpdir(), "built-work-"));
  store = localObjectStore(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.CLIENT_SERVICES_TOKEN;
  delete process.env.HANDOFF_OBJECT_PATH;
  delete process.env.AGENT_WORK_MAX_MB;
  delete process.env.HANDOFF_SIGNING_SECRET;
});


function routes() {
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, FILES: undefined } };
  process.env.CLIENT_SERVICES_TOKEN = "cs-built-token";
  process.env.HANDOFF_OBJECT_PATH = root;
}

type Ctx = Awaited<ReturnType<typeof setup>>;

async function setup() {
  const acme = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Acme', 'acme.example', 'client', ?, ?)", [acme, NOW, NOW]);
  const projectId = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Social media', 'active', ?, ?)", [projectId, acme, NOW, NOW]);
  const spaceId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, 'acme', 'acme', 'Acme', 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [spaceId, NOW, acme, projectId],
  );
  await sql.run("INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('user-staff', 'staff@abra.example', 1, ?, NULL)", [NOW]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('user-client', 'client@acme.example', ?)", [NOW]);
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('m1', ?, 'user-client', 'client@acme.example', 'client_owner', ?, NULL)",
    [spaceId, NOW],
  );
  await sql.run("INSERT INTO contacts (id, organization_id, name, email, created_at, updated_at) VALUES ('c1', ?, 'Pat', 'pat@acme.example', ?, ?)", [acme, NOW, NOW]).catch(() => undefined);
  const made = await registerClientAgent(sql, { agentId: "acme-lead", label: "Acme lead", organizationId: acme, role: "lead", actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const agent = (await agentForToken(sql, `Bearer ${made.token}`))!;
  const member: Caller = { userId: "user-client", staff: null, operatorOf: [], memberships: [{ workspaceId: spaceId, role: "client_owner" }] };
  const staff: Caller = { userId: "user-staff", staff: { superAdmin: true }, operatorOf: [], memberships: [] };
  return { acme, projectId, spaceId, agent, token: made.token, member, staff };
}

async function card(ctx: Ctx, title = "Social media", status = "doing"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [id, ctx.projectId, ctx.acme, title, status, NOW, NOW],
  );
  return id;
}

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const site = {
  title: "Strong Foam website",
  live_url: "https://strongfoam.example/",
  preview_url: "https://preview.strongfoam.example/",
  repo_url: "https://github.com/example/strongfoam-site",
  description: "Five-page site with a quote form.",
  status: "live",
  screenshot: PNG,
};

async function fileSite(ctx: Ctx, extra: Record<string, unknown>, now = NOW + 10) {
  const result = await fileAgentWork(sql, store, ctx.agent, {
    title: "Child company websites", kind: "code", summary: "Three sites are live.", built_work: [site], ...extra,
  }, now);
  if (!result.ok || result.state !== "filed") throw new Error(`not filed: ${JSON.stringify(result)}`);
  return result;
}

describe("parseBuiltWork", () => {
  it("takes one object or a list, defaults status, and turns a screenshot data URL into an attachment", () => {
    const one = parseBuiltWork({ title: "Site", live_url: "https://a.example", screenshot: PNG }, []);
    expect(one).toMatchObject({ ok: true, items: [{ title: "Site", liveUrl: "https://a.example/", status: "live", screenshot: "site-screenshot.png" }] });
    expect(one.ok && one.added).toEqual([{ name: "site-screenshot.png", body: PNG }]);
    const preview = parseBuiltWork([{ title: "Draft", preview_url: "https://p.example" }], []);
    expect(preview).toMatchObject({ ok: true, items: [{ status: "preview", liveUrl: null, screenshot: null }] });
    const named = parseBuiltWork({ title: "Site", live_url: "https://a.example", screenshot: "Hero.png", status: "In progress" }, [{ name: "hero.png", body: PNG }]);
    expect(named).toMatchObject({ ok: true, items: [{ screenshot: "hero.png", status: "in_progress" }], added: [] });
    const twice = parseBuiltWork([{ title: "Site", live_url: "https://a.example", screenshot: PNG }, { title: "Site", live_url: "https://b.example", screenshot: PNG }], []);
    expect(twice.ok && twice.added.map((file) => file.name)).toEqual(["site-screenshot.png", "site-screenshot-2.png"]);
  });

  it("refuses bad items with a clear message", () => {
    const bad = (raw: unknown, attachments: { name: string; body: string }[] = []) => {
      const result = parseBuiltWork(raw, attachments);
      return result.ok ? null : result.message;
    };
    expect(bad({ live_url: "https://a.example" })).toMatch(/title is required/);
    expect(bad({ title: "x" })).toMatch(/live_url or a preview_url/);
    expect(bad({ title: "x", live_url: "http://a.example" })).toMatch(/live_url must be an https URL/);
    expect(bad({ title: "x", live_url: "javascript:alert(1)" })).toMatch(/https URL/);
    expect(bad({ title: "x", live_url: "https://a.example", repo_url: "ftp://x" })).toMatch(/repo_url/);
    expect(bad({ title: "x", live_url: "https://a.example", status: "done" })).toMatch(/status must be one of live, preview, in_progress, archived/);
    expect(bad({ title: "x", live_url: "https://a.example", screenshot: "missing.png" })).toMatch(/names no attachment/);
    expect(bad({ title: "x", live_url: "https://a.example", screenshot: "notes.md" }, [{ name: "notes.md", body: "# hi" }])).toMatch(/PNG, JPEG or WebP/);
    expect(bad({ title: "x", live_url: "https://a.example", screenshot: "data:image/svg+xml;base64,PHN2Zz4=" })).toMatch(/names no attachment/);
    expect(bad(Array.from({ length: 13 }, (_, i) => ({ title: `s${i}`, live_url: "https://a.example" })))).toMatch(/up to 12/);
    expect(bad(["nope"])).toMatch(/must be an object/);
  });

  it("writes a Built work section that the client summary card leaves out", () => {
    const parsed = parseBuiltWork(site, []);
    if (!parsed.ok) throw new Error(parsed.message);
    const text = ["# Sites", "", "- Agent: Lead (lead)", "- Ref: x", "", "## For the client", "", "Your sites are ready.", ...builtWorkMarkdown(parsed.items), "## Files", "", "- a.png"].join("\n");
    const summary = parseFilingSummary(text)!;
    expect(summary.clientSummary).toBe("Your sites are ready.");
    expect(summary.body).toBeNull();
    expect(summary.files).toEqual(["a.png"]);
    expect(text).toContain("- Live: https://strongfoam.example/");
    expect(displayHost("https://www.renewimplants.ca/about")).toBe("renewimplants.ca");
  });
});

describe("built work filings", () => {
  it("are held until Client Services approves, then show to the client with the screenshot", async () => {
    const ctx = await setup();
    routes();
    const taskId = await card(ctx, "Websites");
    const filed = await fileSite(ctx, { external_id: "b1", task_id: taskId });
    expect(filed).toMatchObject({ held: true, builtWork: 1, review: { awaitingReview: true } });
    const deliverable = await sql.get<{ kind: string }>("SELECT kind FROM deliverables WHERE id = ?", [filed.review!.deliverableId]);
    expect(deliverable?.kind).toBe("website");

    expect(await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: true })).toEqual([]);
    const staff = await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: false });
    expect(staff).toHaveLength(1);
    expect(staff[0]).toMatchObject({
      title: "Strong Foam website", liveUrl: "https://strongfoam.example/", previewUrl: "https://preview.strongfoam.example/",
      repoUrl: "https://github.com/example/strongfoam-site", status: "live", statusLabel: "Live", visibility: "held", agentLabel: "Acme lead",
    });
    const shot = staff[0]!.screenshotFileId!;
    expect(shot).toBeTruthy();
    const stored = await sql.get<{ relative_path: string; batch_id: string }>("SELECT relative_path, batch_id FROM files WHERE id = ?", [shot]);
    expect(stored?.relative_path).toMatch(/strong-foam-website-screenshot\.png$/);
    expect(await readPreviewFile({ sql, caller: ctx.member, fileId: shot })).toEqual({ ok: false, status: 404 });
    expect(await readPreviewFile({ sql, caller: ctx.staff, fileId: shot })).toMatchObject({ ok: true });

    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    const client = await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: true });
    expect(client).toHaveLength(1);
    expect(client[0]).toMatchObject({ visibility: "client", agentLabel: null, screenshotFileId: shot });
    expect(await readPreviewFile({ sql, caller: ctx.member, fileId: shot })).toMatchObject({ ok: true, file: { contentType: "image/png" } });
  });

  it("a replacement hides the old card once approved; a withdrawn filing's card goes away", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "Websites");
    const first = await fileSite(ctx, { external_id: "v1", task_id: taskId });
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    const second = await fileSite(ctx, {
      external_id: "v2", task_id: taskId, supersedes: "v1",
      built_work: { ...site, title: "Strong Foam website v2", description: "Now with a gallery." },
    }, NOW + 30);
    expect(second.review?.superseded).toEqual([first.workItemId]);
    // Until the replacement is approved the client keeps seeing the first card.
    expect((await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: true })).map((row) => row.title)).toEqual(["Strong Foam website"]);
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 40 });
    expect((await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: true })).map((row) => row.title)).toEqual(["Strong Foam website v2"]);
    const all = await listBuiltWork(sql, { organizationId: ctx.acme, clientView: false, includeHidden: true });
    expect(all.map((row) => [row.title, row.visibility])).toEqual([["Strong Foam website v2", "client"], ["Strong Foam website", "hidden"]]);

    const third = await fileSite(ctx, { external_id: "v3", task_id: taskId, built_work: { ...site, title: "Wrong site" } }, NOW + 50);
    expect((await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: false })).map((row) => row.title)).toContain("Wrong site");
    const withdrawn = await withdrawFiling(sql, { id: third.workItemId, by: { kind: "agent", agent: ctx.agent }, reason: "Wrong link", now: NOW + 60 });
    expect(withdrawn).toMatchObject({ ok: true });
    expect((await listBuiltWork(sql, { workspaceId: ctx.spaceId, clientView: false })).map((row) => row.title)).toEqual(["Strong Foam website v2"]);
  });

  it("shows on the HQ client page with its visibility", async () => {
    const ctx = await setup();
    await fileSite(ctx, { external_id: "hq1", task_id: await card(ctx, "Websites") });
    const work = await listClientAgentWork(sql, ctx.staff, ctx.acme);
    expect(work.built?.map((row) => [row.title, row.visibility, row.spaceSlug])).toEqual([["Strong Foam website", "held", "acme"]]);
  });

  it("through the API: 201 with a built_work count, 400 on a bad item, 413 over the limit, and read back for agents", async () => {
    const ctx = await setup();
    routes();
    const taskId = await card(ctx, "Websites");
    const post = (body: unknown) => agentWorkPost(new Request("https://hq.example/api/agent-work", {
      method: "POST", headers: { authorization: `Bearer ${ctx.token}`, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    const ok = await post({ external_id: "api1", title: "Sites", built_work: [site, { title: "Square Assembly", preview_url: "https://sa.example" }], task_id: taskId });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toMatchObject({ held: true, built_work: 2 });
    const bad = await post({ external_id: "api2", title: "Sites", built_work: { title: "No link" } });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toMatch(/live_url or a preview_url/);
    process.env.AGENT_WORK_MAX_MB = "1";
    const big = Buffer.alloc(1100 * 1024, 1);
    big.write("\x89PNG\r\n\x1a\n", 0, "latin1");
    const tooBig = await post({ external_id: "api3", title: "Sites", built_work: { ...site, screenshot: `data:image/png;base64,${big.toString("base64")}` } });
    expect(tooBig.status).toBe(413);
    delete process.env.AGENT_WORK_MAX_MB;
    const read = await agentWorkGet(new Request("https://hq.example/api/agent-work", { headers: { authorization: `Bearer ${ctx.token}` } }));
    const body = (await read.json()) as { items: { built_work?: { title: string; status: string }[] }[] };
    expect(body.items[0]?.built_work?.map((row) => [row.title, row.status])).toEqual([["Strong Foam website", "live"], ["Square Assembly", "preview"]]);
  });

  it("a filing with only built_work (no summary, content or links) is accepted", async () => {
    const ctx = await setup();
    const result = await fileAgentWork(sql, store, ctx.agent, { external_id: "only", title: "Sites", built_work: { title: "Site", live_url: "https://a.example" } }, NOW + 10);
    expect(result).toMatchObject({ ok: true, state: "filed" });
  });
});
