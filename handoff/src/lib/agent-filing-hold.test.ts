import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import type { Caller } from "@/lib/authz";
import { POST as agentWorkPost } from "@/app/api/agent-work/route";
import { POST as agentWorkItemPost } from "@/app/api/agent-work/[id]/route";
import { GET as filingsGet } from "@/app/api/client-services/filings/route";
import { POST as filingPost } from "@/app/api/client-services/filings/[id]/route";
import { POST as requestsPost } from "@/app/api/client-services/requests/route";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { issueDownload, listFolderFiles } from "@/lib/downloads";
import { readPreviewFile } from "@/lib/preview";
import { agentForToken, fileAgentWork, fileUnfiledWork, registerClientAgent } from "./agent-work-filing";
import { agentWorkLimits, storedBytes } from "./agent-work-limits";
import { listFilings, releaseHeldWork, withdrawFiling } from "./agent-filing-review";
import { clientServicesReview, listOpenReviews } from "./task-review";
import { listClientUpdates } from "./client-work";
import { createAgentTask } from "./agent-board";
import { setOrganizationUpdateMode } from "@/db/crm";
import { openDeliverable } from "@/db/deliverables";
import { clientDetails, clientLead, parseFilingSummary } from "./filing-summary";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const MB = 1024 * 1024;

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
  root = mkdtempSync(path.join(tmpdir(), "agent-hold-"));
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

const cs = { authorization: "Bearer cs-hold-token" };

function routes() {
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1, FILES: undefined } };
  process.env.CLIENT_SERVICES_TOKEN = "cs-hold-token";
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

const work = {
  title: "October social posts",
  kind: "copy",
  summary: "Twelve posts for October.",
  content: "## Post 1\n\nSmile this fall.",
};

async function file(ctx: Ctx, extra: Record<string, unknown>, now = NOW + 10) {
  const result = await fileAgentWork(sql, store, ctx.agent, { ...work, ...extra }, now);
  if (!result.ok || result.state !== "filed") throw new Error(`not filed: ${JSON.stringify(result)}`);
  return result;
}

async function batchOf(itemId: string) {
  return (await sql.get<{ id: string; held_at: number | null; released_at: number | null; hidden_at: number | null; work_item_id: string | null }>(
    "SELECT b.id, b.held_at, b.released_at, b.hidden_at, b.work_item_id FROM batches b JOIN agent_work_items i ON i.batch_id = b.id WHERE i.id = ?",
    [itemId],
  ))!;
}

/** A filing made before 0032: batch and item with no hold columns set, already visible to the client. */
async function preHoldFiling(ctx: Ctx, taskId: string) {
  const batchId = crypto.randomUUID();
  const itemId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO batches (id, workspace_id, request_id, created_by, label, note, created_at, last_activity_at, discarded_at, deleted_at)
     VALUES (?, ?, NULL, 'agent:acme-lead', 'Old social posts', NULL, ?, ?, NULL, NULL)`,
    [batchId, ctx.spaceId, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO files (id, batch_id, workspace_id, relative_path, extension, size_bytes, object_key, tag, status, scan_attempts, created_at)
     VALUES (?, ?, ?, 'old-posts.md', 'md', 10, ?, 'other', 'clean', 0, ?)`,
    [crypto.randomUUID(), batchId, ctx.spaceId, `${ctx.spaceId}/${batchId}/${crypto.randomUUID()}`, NOW],
  );
  await sql.run(
    `INSERT INTO agent_work_items (id, agent_id, external_id, title, kind, payload_json, state, organization_id, workspace_id, project_id, task_id,
                                   batch_id, paths_json, created_at, updated_at, filed_at, task_closed)
     VALUES (?, 'acme-lead', 'old-v1', 'Old social posts', 'copy', '{}', 'filed', ?, ?, ?, ?, ?, '["old-posts.md"]', ?, ?, ?, 1)`,
    [itemId, ctx.acme, ctx.spaceId, ctx.projectId, taskId, batchId, NOW, NOW, NOW],
  );
  return { batchId, itemId };
}

describe("held agent filings", () => {
  it("a held batch is hidden from client members in folder, download and preview, but staff see it", async () => {
    const ctx = await setup();
    const filed = await file(ctx, { external_id: "h1", task_id: await card(ctx) });
    expect(filed.held).toBe(true);
    const batch = await batchOf(filed.workItemId);
    expect(batch.held_at).toBe(NOW + 10);
    expect(batch.work_item_id).toBe(filed.workItemId);
    expect(await listFolderFiles(sql, ctx.member, ctx.spaceId)).toEqual([]);
    const staffFiles = await listFolderFiles(sql, ctx.staff, ctx.spaceId);
    expect(staffFiles.length).toBeGreaterThan(0);
    expect(staffFiles.every((row) => row.hold === "held")).toBe(true);
    const fileId = staffFiles[0]!.id;
    process.env.HANDOFF_SIGNING_SECRET = "s".repeat(40);
    const memberDownload = await issueDownload({ sql, caller: ctx.member, batchId: batch.id, fileId, origin: "https://hq.example", now: NOW + 20 });
    expect(memberDownload).toMatchObject({ ok: false, status: 404 });
    const staffDownload = await issueDownload({ sql, caller: ctx.staff, batchId: batch.id, fileId, origin: "https://hq.example", now: NOW + 20 });
    expect(staffDownload).not.toMatchObject({ status: 404 });
    expect(await readPreviewFile({ sql, caller: ctx.member, fileId })).toEqual({ ok: false, status: 404 });
  });

  it("batches filed before the hold stay visible to the client with no data rewrite", async () => {
    const ctx = await setup();
    await preHoldFiling(ctx, await card(ctx, "Old", "done"));
    const files = await listFolderFiles(sql, ctx.member, ctx.spaceId);
    expect(files.map((row) => row.name)).toEqual(["old-posts.md"]);
    expect(files[0]?.hold).toBeNull();
  });

  it("creates the card's deliverable on the first filing and links tasks.deliverable_id", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const filed = await file(ctx, { external_id: "d1", task_id: taskId });
    expect(filed.review).toMatchObject({ held: true, deliverableVersion: 1, awaitingReview: true });
    const deliverableId = filed.review!.deliverableId!;
    const task = await sql.get<{ deliverable_id: string }>("SELECT deliverable_id FROM tasks WHERE id = ?", [taskId]);
    expect(task?.deliverable_id).toBe(deliverableId);
    const deliverable = await sql.get<{ version: number; published_version: number | null; kind: string }>(
      "SELECT version, published_version, kind FROM deliverables WHERE id = ?",
      [deliverableId],
    );
    expect(deliverable).toMatchObject({ version: 1, published_version: null, kind: "social_pack" });
    const items = await sql.all<{ work_item_id: string }>("SELECT work_item_id FROM deliverable_items WHERE deliverable_id = ?", [deliverableId]);
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.work_item_id === filed.workItemId)).toBe(true);
  });

  it("two filings on one open card join the same version; after publish the next filing starts a new version", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const one = await file(ctx, { external_id: "p1", task_id: taskId });
    const two = await file(ctx, { external_id: "p2", task_id: taskId, title: "October posts part 2" }, NOW + 11);
    expect(two.review?.deliverableId).toBe(one.review?.deliverableId);
    expect(two.review?.deliverableVersion).toBe(1);
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    const three = await file(ctx, { external_id: "p3", task_id: taskId, title: "Fix typo" }, NOW + 30);
    expect(three.review).toMatchObject({ deliverableId: one.review?.deliverableId, deliverableVersion: 2, taskReopened: true });
  });

  it("filing on a Doing card sends it to review instead of closing it", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "Posts", "doing");
    const filed = await file(ctx, { external_id: "r1", task_id: taskId });
    expect(filed).toMatchObject({ taskClosed: false, awaitingReview: true });
    expect(await sql.get("SELECT status, review_requested_at AS review FROM tasks WHERE id = ?", [taskId])).toEqual({ status: "doing", review: NOW + 10 });
    const reviews = await listOpenReviews(sql, { organizationId: ctx.acme });
    expect(reviews[0]?.filed_work[0]).toMatchObject({ visibility: "held", deliverable_version: 1 });
  });

  it("filing on a Done card reopens it into review", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "Posts", "done");
    const filed = await file(ctx, { external_id: "r2", task_id: taskId });
    expect(filed.review).toMatchObject({ taskReopened: true, awaitingReview: true });
    const row = await sql.get<{ status: string; review: number | null }>("SELECT status, review_requested_at AS review FROM tasks WHERE id = ?", [taskId]);
    expect(row?.status).not.toBe("done");
    expect(row?.review).toBe(NOW + 10);
  });

  it("approval releases the batch, publishes the deliverable and posts a draft update; nothing is emailed", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const filed = await file(ctx, { external_id: "a1", task_id: taskId });
    const result = await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.release).toMatchObject({ released: [filed.workItemId], notice: "draft", publishedVersion: 1 });
    expect((await batchOf(filed.workItemId)).released_at).toBe(NOW + 20);
    expect((await listFolderFiles(sql, ctx.member, ctx.spaceId)).length).toBeGreaterThan(0);
    expect(await sql.get("SELECT published_version FROM deliverables WHERE id = ?", [filed.review!.deliverableId])).toEqual({ published_version: 1 });
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM notifications"))?.n).toBe(0);
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    const ready = Array.isArray(updates) ? updates.find((update) => update.kind === "client_work.update_ready") : undefined;
    expect(ready?.suggested_update).toMatchObject({ space_slug: "acme" });
    expect(ready?.suggested_update?.subject).toBeTruthy();
  });

  it("auto mode queues the client email on approval, once", async () => {
    const ctx = await setup();
    expect(await setOrganizationUpdateMode(sql, ctx.staff, { organizationId: ctx.acme, mode: "auto" }, NOW)).toMatchObject({ ok: true });
    const taskId = await card(ctx);
    const filed = await file(ctx, { external_id: "auto1", task_id: taskId });
    const result = await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    expect(result.ok && result.release?.notice).toBe("auto");
    const again = await releaseHeldWork(sql, { deliverableId: filed.review!.deliverableId, now: NOW + 30 });
    expect(again.released).toEqual([]);
    const notices = await sql.all("SELECT version FROM deliverable_notices WHERE deliverable_id = ?", [filed.review!.deliverableId]);
    expect(notices).toEqual([{ version: 1 }]);
    const events = await sql.all<{ event: string }>("SELECT event FROM notifications");
    expect(events.every((row) => row.event === "deliverable.published")).toBe(true);
  });

  it("the update mode is draft by default, and only staff can change it", async () => {
    const ctx = await setup();
    expect(await sql.get("SELECT client_update_mode FROM organizations WHERE id = ?", [ctx.acme])).toEqual({ client_update_mode: "draft" });
    expect(await setOrganizationUpdateMode(sql, ctx.member, { organizationId: ctx.acme, mode: "auto" }, NOW)).toMatchObject({ ok: false });
    expect(await setOrganizationUpdateMode(sql, ctx.staff, { organizationId: ctx.acme, mode: "loud" }, NOW)).toMatchObject({ ok: false });
  });

  it("send-back keeps everything held", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const filed = await file(ctx, { external_id: "s1", task_id: taskId });
    const back = await clientServicesReview(sql, { taskId, action: "send_back", note: "Fix the dates.", now: NOW + 20 });
    expect(back.ok).toBe(true);
    const batch = await batchOf(filed.workItemId);
    expect(batch).toMatchObject({ released_at: null, hidden_at: null });
    expect(await listFolderFiles(sql, ctx.member, ctx.spaceId)).toEqual([]);
    expect(await sql.get("SELECT published_version FROM deliverables WHERE id = ?", [filed.review!.deliverableId])).toEqual({ published_version: null });
    // The corrected filing after a send-back starts a new version.
    const fixed = await file(ctx, { external_id: "s2", task_id: taskId, title: "Fixed dates" }, NOW + 30);
    expect(fixed.review?.deliverableVersion).toBe(2);
  });
});

describe("supersede and withdraw", () => {
  it("a held filing that supersedes another hides the old held batch at once", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const v1 = await file(ctx, { external_id: "v1", task_id: taskId });
    const v2 = await file(ctx, { external_id: "v2", task_id: taskId, supersedes: v1.workItemId }, NOW + 11);
    expect(v2.review?.superseded).toEqual([v1.workItemId]);
    expect((await batchOf(v1.workItemId)).hidden_at).toBe(NOW + 11);
    expect(await sql.get("SELECT superseded_by FROM agent_work_items WHERE id = ?", [v1.workItemId])).toEqual({ superseded_by: v2.workItemId });
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    expect((await batchOf(v1.workItemId)).released_at).toBeNull();
    const visible = await listFolderFiles(sql, ctx.member, ctx.spaceId);
    expect(new Set(visible.map((row) => row.batchId))).toEqual(new Set([(await batchOf(v2.workItemId)).id]));
  });

  it("superseding a filing made before the hold (like a7a482bd / 14649f3a) hides it once the fix is approved", async () => {
    const ctx = await setup();
    const taskId = await card(ctx, "Social media", "done");
    const old = await preHoldFiling(ctx, taskId);
    const fix = await file(ctx, { external_id: "fix", task_id: taskId, supersedes: [old.itemId] });
    expect(fix.review).toMatchObject({ taskReopened: true, superseded: [old.itemId] });
    // Until approval the client still sees the old version, and not the fix.
    expect((await listFolderFiles(sql, ctx.member, ctx.spaceId)).map((row) => row.batchId)).toEqual([old.batchId]);
    const approved = await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    expect(approved.ok && approved.release?.hidden).toContain(old.itemId);
    const visible = await listFolderFiles(sql, ctx.member, ctx.spaceId);
    expect(visible.some((row) => row.batchId === old.batchId)).toBe(false);
    expect(visible.length).toBeGreaterThan(0);
    // Staff still see the retired batch, labelled.
    expect((await listFolderFiles(sql, ctx.staff, ctx.spaceId)).find((row) => row.batchId === old.batchId)?.hold).toBe("hidden");
  });

  it("supersedes also takes the agent's own external_id", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const v1 = await file(ctx, { external_id: "social-v1", task_id: taskId });
    const v2 = await file(ctx, { external_id: "social-v2", task_id: taskId, supersedes: "social-v1" }, NOW + 11);
    expect(v2.review?.superseded).toEqual([v1.workItemId]);
  });

  it("refuses to supersede another client's filing or an unknown id", async () => {
    const ctx = await setup();
    const result = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "bad", task_id: await card(ctx), supersedes: crypto.randomUUID() }, NOW);
    expect(result).toMatchObject({ ok: false, error: "invalid" });
  });

  it("the agent withdraws a held filing; after release it gets 409", async () => {
    const ctx = await setup();
    routes();
    const taskId = await card(ctx);
    const one = await file(ctx, { external_id: "w1", task_id: taskId });
    const withdraw = (id: string) =>
      agentWorkItemPost(
        new Request(`https://hq.example/api/agent-work/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${ctx.token}` },
          body: JSON.stringify({ action: "withdraw", reason: "Wrong client logo." }),
        }),
        { params: Promise.resolve({ id }) },
      );
    expect((await withdraw(one.workItemId)).status).toBe(200);
    const row = await sql.get<{ retracted_at: number | null; retract_reason: string | null }>("SELECT retracted_at, retract_reason FROM agent_work_items WHERE id = ?", [one.workItemId]);
    expect(row?.retract_reason).toBe("Wrong client logo.");
    expect(row?.retracted_at).toBeTruthy();
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM deliverable_items WHERE work_item_id = ?", [one.workItemId]))?.n).toBe(0);
    const two = await file(ctx, { external_id: "w2", task_id: taskId }, NOW + 30);
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 40 });
    const late = await withdraw(two.workItemId);
    expect(late.status).toBe(409);
  });

  it("Client Services withdraws a filing made before the hold (the a7a482bd case); the client stops seeing it", async () => {
    const ctx = await setup();
    routes();
    const old = await preHoldFiling(ctx, await card(ctx, "Social media", "done"));
    const unauthorized = await filingPost(
      new Request(`https://hq.example/api/client-services/filings/${old.itemId}`, { method: "POST", body: JSON.stringify({ action: "withdraw" }) }),
      { params: Promise.resolve({ id: old.itemId }) },
    );
    expect(unauthorized.status).toBe(401);
    const res = await filingPost(
      new Request(`https://hq.example/api/client-services/filings/${old.itemId}`, {
        method: "POST",
        headers: cs,
        body: JSON.stringify({ action: "withdraw", reason: "Superseded by the corrected v2." }),
      }),
      { params: Promise.resolve({ id: old.itemId }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, batch_id: old.batchId, was_released: true });
    expect(await listFolderFiles(sql, ctx.member, ctx.spaceId)).toEqual([]);
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM files WHERE batch_id = ?", [old.batchId]))?.n).toBe(1);
    const filings = await listFilings(sql, { organizationId: ctx.acme });
    expect(filings.find((row) => row.id === old.itemId)?.visibility).toBe("withdrawn");
  });

  it("an agent may not withdraw a filing made before the hold", async () => {
    const ctx = await setup();
    const old = await preHoldFiling(ctx, await card(ctx, "Social media", "done"));
    const result = await withdrawFiling(sql, { id: old.itemId, by: { kind: "agent", agent: ctx.agent }, reason: null, now: NOW });
    expect(result).toMatchObject({ ok: false, status: 409 });
  });

  it("filings with no card stay held and are listed as loose for Client Services", async () => {
    const ctx = await setup();
    routes();
    const loose = await file(ctx, { external_id: "loose" });
    expect(loose.review?.awaitingReview).toBe(false);
    const res = await filingsGet(new Request(`https://hq.example/api/client-services/filings?client=acme.example&loose=1`, { headers: cs }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { filings: { id: string; visibility: string }[] };
    expect(body.filings.map((row) => row.id)).toEqual([loose.workItemId]);
    expect(body.filings[0]?.visibility).toBe("held");
  });
});

describe("request links", () => {
  it("Client Services records a handoff request; the same thread returns the same record", async () => {
    const ctx = await setup();
    routes();
    const post = (body: unknown) => requestsPost(new Request("https://hq.example/api/client-services/requests", { method: "POST", headers: cs, body: JSON.stringify(body) }));
    const first = await post({ client: { domain: "acme.example" }, subject: "Fix the October posts", thread_id: "thread-abc", client_email: "pat@acme.example" });
    expect(first.status).toBe(201);
    const made = (await first.json()) as { work_request_id: string };
    const again = await post({ client: { domain: "acme.example" }, subject: "Fix the October posts", thread_id: "thread-abc" });
    expect(again.status).toBe(200);
    expect(((await again.json()) as { work_request_id: string }).work_request_id).toBe(made.work_request_id);
    const updates = await listClientUpdates(sql, { since: null, now: Date.now() + 1000, origin: "https://hq.example" });
    expect(Array.isArray(updates) && updates.some((update) => update.kind === "client_work.handoff")).toBe(true);
    expect(ctx.acme).toBeTruthy();
  });

  it("a card made with thread_id and a filing with work_request_id point at the same request", async () => {
    const ctx = await setup();
    const made = await createAgentTask(sql, ctx.agent, { title: "Fix posts", projectId: ctx.projectId, threadId: "thread-xyz", now: NOW });
    expect(made).toMatchObject({ ok: true });
    if (!made.ok) return;
    const taskId = made.task.id;
    const requestId = made.workRequestId!;
    expect(requestId).toBeTruthy();
    expect(await sql.get("SELECT work_request_id FROM tasks WHERE id = ?", [taskId])).toEqual({ work_request_id: requestId });
    const filed = await file(ctx, { external_id: "req1", task_id: taskId, work_request_id: requestId });
    expect(filed.review?.workRequestId).toBe(requestId);
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 20 });
    const updates = await listClientUpdates(sql, { since: null, now: NOW + 10_000, origin: "https://hq.example" });
    const ready = Array.isArray(updates) ? updates.find((update) => update.kind === "client_work.update_ready") : undefined;
    expect(ready?.suggested_update?.thread_id).toBe("thread-xyz");
  });

  it("refuses a work_request_id from another client", async () => {
    const ctx = await setup();
    const result = await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "x", work_request_id: crypto.randomUUID() }, NOW);
    expect(result).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("file names", () => {
  it("keeps .html and other allowed text extensions; data: images stay as they are", async () => {
    const ctx = await setup();
    const png = `data:image/png;base64,${Buffer.from("\x89PNG fake").toString("base64")}`;
    const filed = await file(ctx, {
      external_id: "ext",
      task_id: await card(ctx),
      attachments: [
        { name: "landing.html", body: "<!doctype html><h1>Hi</h1>" },
        { name: "posts.csv", body: "day,post\n1,Hello" },
        { name: "hero.png", body: png },
      ],
    });
    const names = filed.paths.map((p) => p.split("/").pop());
    expect(names).toEqual(expect.arrayContaining(["landing.html", "posts.csv", "hero.png"]));
    expect(names.some((name) => name?.endsWith(".html.txt") || name?.endsWith(".csv.txt"))).toBe(false);
  });
});

describe("size limits", () => {
  function post(token: string, body: string, headers: Record<string, string> = {}) {
    return agentWorkPost(new Request("https://hq.example/api/agent-work", { method: "POST", headers: { authorization: `Bearer ${token}`, ...headers }, body }));
  }

  function dataUrl(bytes: number): string {
    const pdf = Buffer.alloc(bytes, 7);
    pdf.write("%PDF-1.4\n", 0, "latin1");
    return `data:application/pdf;base64,${pdf.toString("base64")}`;
  }

  it("defaults to 10 MB of files, about 14.3 MB of JSON, and reads AGENT_WORK_MAX_MB", () => {
    expect(agentWorkLimits()).toMatchObject({ maxMb: 10, maxFileBytes: 10 * MB });
    expect(agentWorkLimits().maxBodyBytes).toBe(Math.ceil((10 * MB * 4) / 3) + MB);
    expect(agentWorkLimits({ AGENT_WORK_MAX_MB: "25" }).maxMb).toBe(25);
    expect(agentWorkLimits({ AGENT_WORK_MAX_MB: "500" }).maxMb).toBe(50);
    expect(agentWorkLimits({ AGENT_WORK_MAX_MB: "nope" }).maxMb).toBe(10);
    expect(storedBytes(dataUrl(3000))).toBe(3000);
  });

  it("accepts a 5 MB base64 attachment; the file goes to R2, not D1", async () => {
    const ctx = await setup();
    routes();
    const body = JSON.stringify({ ...work, external_id: "five", task_id: await card(ctx), attachments: [{ name: "deck.pdf", body: dataUrl(5 * MB) }] });
    const res = await post(ctx.token, body);
    expect(res.status).toBe(201);
    const json = (await res.json()) as { work_item_id: string; held: boolean };
    expect(json.held).toBe(true);
    const row = await sql.get<{ n: number; key: string | null }>("SELECT length(payload_json) AS n, payload_key AS key FROM agent_work_items WHERE id = ?", [json.work_item_id]);
    expect(row!.n ?? 0).toBeLessThan(300_000);
    expect(row!.key).toBeNull();
    const pdf = await sql.get<{ size_bytes: number }>("SELECT size_bytes FROM files WHERE relative_path LIKE '%deck%'");
    expect(pdf?.size_bytes).toBe(5 * MB);
  });

  it("accepts a 10 MB filing at the default limit", async () => {
    const ctx = await setup();
    routes();
    const body = JSON.stringify({
      ...work,
      content: undefined,
      external_id: "ten",
      task_id: await card(ctx),
      attachments: [{ name: "a.pdf", body: dataUrl(5 * MB) }, { name: "b.pdf", body: dataUrl(5 * MB) }],
    });
    expect(body.length).toBeGreaterThan(13 * MB);
    const res = await post(ctx.token, body);
    expect(res.status).toBe(201);
  });

  it("rejects more than 10 MB of files with a clear 413", async () => {
    const ctx = await setup();
    routes();
    const res = await post(ctx.token, JSON.stringify({ ...work, external_id: "eleven", attachments: [{ name: "big.pdf", body: dataUrl(10 * MB + 1) }] }));
    expect(res.status).toBe(413);
    const json = (await res.json()) as { error: string; code: string; limit_mb: number };
    expect(json).toMatchObject({ code: "too_big", limit_mb: 10 });
    expect(json.error).toContain("one filing takes up to 10 MB");
    expect(json.error).toContain("Split it");
    expect((await sql.get<{ n: number }>("SELECT count(*) AS n FROM agent_work_items"))?.n).toBe(0);
  });

  it("rejects an oversized body from content-length before reading it", async () => {
    const ctx = await setup();
    routes();
    const res = await post(ctx.token, JSON.stringify({ ...work, external_id: "cl" }), { "content-length": String(20 * MB) });
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toContain("of JSON");
  });

  it("honours a raised AGENT_WORK_MAX_MB", async () => {
    const ctx = await setup();
    routes();
    process.env.AGENT_WORK_MAX_MB = "12";
    const res = await post(ctx.token, JSON.stringify({ ...work, external_id: "eleven-ok", attachments: [{ name: "big.pdf", body: dataUrl(11 * MB) }] }));
    expect(res.status).toBe(201);
  });

  it("keeps a large unfiled payload in R2 (payload_key), not in the D1 row, and files it later", async () => {
    const ctx = await setup();
    const made = await registerClientAgent(sql, { agentId: "drifter", label: "Drifter", organizationId: null, actor: "test", now: NOW });
    const drifter = (await agentForToken(sql, `Bearer ${made.ok ? made.token : ""}`))!;
    const result = await fileAgentWork(sql, store, drifter, { ...work, external_id: "u1", attachments: [{ name: "deck.pdf", body: dataUrl(3 * MB) }] }, NOW);
    expect(result).toMatchObject({ ok: true, state: "unfiled" });
    const row = await sql.get<{ id: string; n: number; key: string | null }>("SELECT id, length(payload_json) AS n, payload_key AS key FROM agent_work_items");
    expect(row!.key).toMatch(/^a9e7f11e-0000-4000-8000-000000000000\//);
    expect(row!.n).toBeLessThan(100_000);
    const filed = await fileUnfiledWork(sql, store, { id: row!.id, organizationId: ctx.acme, workspaceId: ctx.spaceId, taskId: null, actor: "staff", now: NOW + 5 } as never);
    expect(filed).toMatchObject({ ok: true });
    expect((await sql.get<{ key: string | null }>("SELECT payload_key AS key FROM agent_work_items WHERE id = ?", [row!.id]))?.key).toBeNull();
    expect(await sql.get<{ size_bytes: number }>("SELECT size_bytes FROM files WHERE relative_path LIKE '%deck%'")).toEqual({ size_bytes: 3 * MB });
  });

  it("rejects more than 50 attachments instead of dropping them", async () => {
    const ctx = await setup();
    const attachments = Array.from({ length: 51 }, (_, index) => ({ name: `f${index}.txt`, body: "x" }));
    expect(await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "many", attachments }, NOW)).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("migration 0032", () => {
  it("is additive: no DROP, no UPDATE of existing rows, no table rebuild", () => {
    const text = readFileSync(path.join(process.cwd(), "migrations", "0032_agent_filing_hold.sql"), "utf8");
    const statements = text.replace(/--.*$/gm, "").split(";").map((s) => s.trim()).filter(Boolean);
    for (const statement of statements) expect(statement).toMatch(/^(ALTER TABLE \w+ ADD COLUMN|CREATE (UNIQUE )?INDEX)/i);
  });
});

describe("folders", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const posts = {
    folder: "Social/Facebook",
    attachments: [
      { name: "schema-1.png", body: PNG },
      { name: "facebook-posts.md", body: "# Posts" },
      { name: "preview.html", body: "<!doctype html><p>Draft</p>" },
      { name: "preview.md", body: "# Draft" },
    ],
  };

  it("files into the agent's folder with readable names, real image bytes and kept .html", async () => {
    const ctx = await setup();
    const result = await file(ctx, { external_id: "f1", ...posts });
    expect(result.folder).toBe("Social/Facebook");
    expect(result.paths).toEqual([
      "Social/Facebook/October social posts - summary.md",
      "Social/Facebook/schema-1.png",
      "Social/Facebook/facebook-posts.md",
      "Social/Facebook/preview.html",
      "Social/Facebook/preview.md",
    ]);
    const png = await sql.get<{ object_key: string }>("SELECT object_key FROM files WHERE relative_path = 'Social/Facebook/schema-1.png'");
    expect([...((await store.read(png!.object_key)) ?? new Uint8Array()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect((await sql.get<{ folder: string }>("SELECT folder FROM agent_work_items WHERE id = ?", [result.workItemId]))?.folder).toBe("Social/Facebook");
  });

  it("defaults to Finished work/<date> <title> and numbers a name already in the folder", async () => {
    const ctx = await setup();
    const one = await file(ctx, { external_id: "d1" });
    expect(one.folder).toBe("Finished work/2023-11-14 October social posts");
    expect(one.paths).toEqual(["Finished work/2023-11-14 October social posts/summary.md"]);
    await file(ctx, { external_id: "a", ...posts });
    const two = await file(ctx, { external_id: "b", ...posts });
    expect(two.paths).toContain("Social/Facebook/schema-1 (2).png");
    expect(two.paths).toContain("Social/Facebook/October social posts - summary (2).md");
  });

  it("a filing that supersedes another keeps its names", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const first = await file(ctx, { external_id: "v1", task_id: taskId, ...posts });
    const second = await file(ctx, { external_id: "v2", task_id: taskId, supersedes: first.workItemId, ...posts }, NOW + 20);
    expect(second.paths).toEqual(first.paths);
  });

  it("held filings in a folder stay out of the client's tree until approval", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    await file(ctx, { external_id: "h1", task_id: taskId, ...posts });
    expect(await listFolderFiles(sql, ctx.member, ctx.spaceId)).toEqual([]);
    expect((await listFolderFiles(sql, ctx.staff, ctx.spaceId)).map((f) => [f.name, f.hold])).toContainEqual(["Social/Facebook/schema-1.png", "held"]);
    await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 30 });
    expect((await listFolderFiles(sql, ctx.member, ctx.spaceId)).map((f) => f.name)).toContain("Social/Facebook/schema-1.png");
  });

  it("refuses a folder that climbs or is not text", async () => {
    const ctx = await setup();
    expect(await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "x", folder: "Social/../up" }, NOW)).toMatchObject({ ok: false, error: "invalid" });
    expect(await fileAgentWork(sql, store, ctx.agent, { ...work, external_id: "y", folder: 7 }, NOW)).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("client-facing filing summary", () => {
  it("client_summary is stored on the summary page and is what a client member reads first, with no internal ids", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    await file(ctx, {
      external_id: "cs-1", task_id: taskId, finished_at: "2026-10-21T00:48:33.083Z",
      client_summary: "Your October posts are ready. Nothing is posted yet.",
      attachments: [{ name: "posts.md", body: "# Posts" }],
    });
    expect((await clientServicesReview(sql, { taskId, action: "approve", now: NOW + 100 })).ok).toBe(true);
    const deliverableId = (await sql.get<{ id: string }>("SELECT deliverable_id AS id FROM tasks WHERE id = ?", [taskId]))!.id;
    const opened = (await openDeliverable(sql, ctx.member, deliverableId, "published"))!;
    const page = opened.items.find((item) => item.format === "page" && item.copy_text?.startsWith("# "))!;
    expect(page.copy_text).toContain("## For the client");
    const summary = parseFilingSummary(page.copy_text)!;
    expect(clientLead(summary)).toBe("Your October posts are ready. Nothing is posted yet.");
    expect(clientDetails(summary)).toContain("Twelve posts for October.");
    expect(summary.meta.find((entry) => entry.key === "Task")?.value).toBe(taskId);
    expect(`${clientLead(summary)} ${clientDetails(summary)}`).not.toContain(taskId);
    expect(`${clientLead(summary)} ${clientDetails(summary)}`).not.toContain("acme-lead");
  });

  it("a summary in a named folder is the page item only, not a second piece", async () => {
    const ctx = await setup();
    const taskId = await card(ctx);
    const filed = await file(ctx, {
      external_id: "cs-2", task_id: taskId, folder: "Social media",
      attachments: [{ name: "posts.md", body: "# Posts" }, { name: "my - summary.md", body: "an attachment that only looks like one" }],
    });
    expect(filed.paths).toContain("Social media/October social posts - summary.md");
    const items = await sql.all<{ title: string; format: string }>(
      "SELECT title, format FROM deliverable_items WHERE work_item_id = ? ORDER BY sort", [filed.workItemId],
    );
    expect(items.map((item) => item.title)).toEqual(["October social posts", "my - summary.md", "posts.md"]);
  });
});
