import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrate, skippedMigrations } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { POST as agentWorkItemPost } from "@/app/api/agent-work/[id]/route";
import { POST as csAgentWorkPost } from "@/app/api/client-services/agent-work/[id]/route";
import { POST as reviewDecide } from "@/app/api/client-services/reviews/[taskId]/route";
import type { Caller } from "@/lib/authz";
import { listWorkspaceDeliverables } from "@/db/deliverables";
import { listFolderFiles } from "@/lib/downloads";
import { readPreviewFile } from "@/lib/preview";
import { localObjectStore, type ObjectStore } from "@/lib/store/objects";
import { readSpaceForReview, reviewDeliverable } from "./client-work";
import { moveTaskStage } from "./task-stage";
import { agentForToken, fileAgentWork, registerClientAgent } from "./agent-work-filing";

const NOW = 1_700_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

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
  root = mkdtempSync(path.join(tmpdir(), "agent-review-"));
  store = localObjectStore(root);
  process.env.HANDOFF_OBJECT_PATH = root;
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.CLIENT_SERVICES_TOKEN = "cs-review-token";
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.CLIENT_SERVICES_TOKEN;
  delete process.env.HANDOFF_OBJECT_PATH;
  delete process.env.HANDOFF_SKIP_MIGRATIONS;
});

const cs = { authorization: "Bearer cs-review-token", "content-type": "application/json" };

type World = { org: string; spaceId: string; projectId: string; member: Caller; operator: Caller };

async function world(): Promise<World> {
  const org = crypto.randomUUID();
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, 'Acme', 'acme.example', 'client', ?, ?)", [org, NOW, NOW]);
  const projectId = crypto.randomUUID();
  await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES (?, ?, 'Website', 'active', ?, ?)", [projectId, org, NOW, NOW]);
  const spaceId = crypto.randomUUID();
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id, project_id)
     VALUES (?, 'acme-example', 'acme', 'Acme', 'Abra-ca-dabra', 'standard', 1000000000, 365, 0, 'active', ?, ?, ?)`,
    [spaceId, NOW, org, projectId],
  );
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('u-member', 'client@acme.example', ?)", [NOW]);
  await sql.run("INSERT INTO users (id, email, created_at) VALUES ('u-op', 'op@studio.example', ?)", [NOW]);
  await sql.run(
    "INSERT INTO memberships (id, workspace_id, user_id, email, role, created_at, revoked_at) VALUES ('m1', ?, 'u-member', 'client@acme.example', 'client_owner', ?, NULL)",
    [spaceId, NOW],
  );
  await sql.run("INSERT INTO workspace_operators (id, workspace_id, user_id, assigned_by, assigned_at) VALUES ('o1', ?, 'u-op', 'test', ?)", [spaceId, NOW]);
  return {
    org,
    spaceId,
    projectId,
    member: { userId: "u-member", staff: null, operatorOf: [], memberships: [{ workspaceId: spaceId, role: "client_owner" }] },
    operator: { userId: "u-op", staff: { superAdmin: false }, operatorOf: [spaceId], memberships: [] },
  };
}

async function agent(org: string, agentId = "acme-lead") {
  const made = await registerClientAgent(sql, { agentId, label: "Acme lead", organizationId: org, actor: "test", now: NOW });
  if (!made.ok || !made.token) throw new Error("register failed");
  const principal = await agentForToken(sql, `Bearer ${made.token}`);
  if (!principal) throw new Error("token failed");
  return { token: made.token, principal };
}

async function card(org: string, projectId: string, title = "Social media"): Promise<string> {
  const id = crypto.randomUUID();
  await sql.run(
    "INSERT INTO tasks (id, project_id, organization_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'doing', ?, ?)",
    [id, projectId, org, title, NOW, NOW],
  );
  return id;
}

const posts = {
  external_id: "social-v1",
  title: "Social media drafts",
  kind: "document",
  summary: "Six posts and a banner.",
  content: "## Posts\n\nHook one.",
  folder: "Social/Facebook",
  attachments: [
    { name: "schema-1.png", body: PNG },
    { name: "facebook-posts.md", body: "# Posts\n\nHook one." },
    { name: "preview.html", body: "<!doctype html><p>Draft</p>" },
  ],
};

function filed<T extends { ok: boolean }>(result: T): Extract<T, { state: "filed" }> {
  if (!result.ok || (result as { state?: string }).state !== "filed") throw new Error(`not filed: ${JSON.stringify(result)}`);
  return result as Extract<T, { state: "filed" }>;
}

describe("folders", () => {
  it("files into the agent's folder with readable names, real image bytes, and kept text extensions", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const result = filed(await fileAgentWork(sql, store, principal, posts, NOW));
    expect(result.folder).toBe("Social/Facebook");
    expect(result.paths).toEqual([
      "Social/Facebook/Social media drafts - summary.md",
      "Social/Facebook/schema-1.png",
      "Social/Facebook/facebook-posts.md",
      "Social/Facebook/preview.html",
    ]);
    const png = await sql.get<{ declared_content_type: string; object_key: string }>(
      "SELECT declared_content_type, object_key FROM files WHERE relative_path = 'Social/Facebook/schema-1.png'",
    );
    expect(png?.declared_content_type).toBe("image/png");
    const bytes = await store.read(png!.object_key);
    expect([...(bytes ?? new Uint8Array()).slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const html = await sql.get<{ declared_content_type: string }>("SELECT declared_content_type FROM files WHERE relative_path LIKE '%preview.html'");
    expect(html?.declared_content_type).toBe("text/html");
  });

  it("defaults to Finished work/<date> <title> and numbers a name already in the folder", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const one = filed(await fileAgentWork(sql, store, principal, { ...posts, folder: undefined }, NOW));
    expect(one.folder).toBe("Finished work/2023-11-14 Social media drafts");
    expect(one.paths[0]).toBe("Finished work/2023-11-14 Social media drafts/summary.md");
    filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "a" }, NOW));
    const two = filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "b" }, NOW));
    expect(two.paths).toContain("Social/Facebook/schema-1 (2).png");
    expect(two.paths).toContain("Social/Facebook/Social media drafts - summary (2).md");
  });

  it("refuses a folder that climbs or is not text", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    expect(await fileAgentWork(sql, store, principal, { ...posts, folder: "Social/../secrets" }, NOW)).toMatchObject({ ok: false, error: "invalid" });
    expect(await fileAgentWork(sql, store, principal, { ...posts, folder: 7 }, NOW)).toMatchObject({ ok: false, error: "invalid" });
  });
});

describe("held until Client Services approves", () => {
  it("hides the batch from client members, shows it to staff, and links a deliverable to the card", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const taskId = await card(w.org, w.projectId);
    const result = filed(await fileAgentWork(sql, store, principal, { ...posts, task_id: taskId }, NOW));
    expect(result).toMatchObject({ reviewState: "held", awaitingReview: true, taskClosed: false });

    expect(await listFolderFiles(sql, w.member, w.spaceId)).toEqual([]);
    const staffView = await listFolderFiles(sql, w.operator, w.spaceId);
    expect(staffView).toHaveLength(4);
    expect(staffView.every((file) => file.held)).toBe(true);
    const fileId = (await sql.get<{ id: string }>("SELECT id FROM files WHERE relative_path LIKE '%schema-1.png'"))!.id;
    expect(await readPreviewFile({ sql, caller: w.member, fileId })).toEqual({ ok: false, status: 404 });
    expect((await readPreviewFile({ sql, caller: w.operator, fileId })).ok).toBe(true);

    const cardRow = await sql.get<{ deliverable_id: string; review_requested_at: number | null }>("SELECT deliverable_id, review_requested_at FROM tasks WHERE id = ?", [taskId]);
    expect(cardRow?.deliverable_id).toBe(result.deliverableId);
    expect(cardRow?.review_requested_at).not.toBeNull();
    const review = await readSpaceForReview(sql, w.spaceId);
    expect(review?.deliverables.map((d) => [d.id, d.status, d.published_version])).toEqual([[result.deliverableId, "in_review", null]]);
    expect(review?.deliverables[0].items).toHaveLength(4);
    expect(await listWorkspaceDeliverables(sql, w.member, w.spaceId)).toEqual([]);
  });

  it("approving the card publishes the work to the client and queues the ready email once (no send)", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const taskId = await card(w.org, w.projectId);
    const result = filed(await fileAgentWork(sql, store, principal, { ...posts, task_id: taskId }, NOW));
    const response = await reviewDecide(
      new Request(`https://hq.example/api/client-services/reviews/${taskId}`, { method: "POST", headers: cs, body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ taskId }) },
    );
    expect(response.status).toBe(200);
    const visible = await listFolderFiles(sql, w.member, w.spaceId);
    expect(visible.map((file) => file.name)).toContain("Social/Facebook/schema-1.png");
    expect(visible.every((file) => !file.held)).toBe(true);
    const cards = await listWorkspaceDeliverables(sql, w.member, w.spaceId);
    expect(cards.map((c) => c.id)).toEqual([result.deliverableId]);
    const mail = await sql.all<{ event: string; recipient_email: string; sent_at: number | null }>("SELECT event, recipient_email, sent_at FROM notifications");
    expect(mail).toEqual([{ event: "deliverable.published", recipient_email: "client@acme.example", sent_at: null }]);
    const item = await sql.get<{ review_state: string }>("SELECT review_state FROM agent_work_items WHERE id = ?", [result.workItemId]);
    expect(item?.review_state).toBe("approved");
    expect((await sql.get<{ status: string }>("SELECT status FROM tasks WHERE id = ?", [taskId]))?.status).toBe("done");
  });

  it("approving the deliverable in the space review, or through the agent-work route, publishes it too", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const one = filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "one" }, NOW));
    const two = filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "two", folder: "Blog" }, NOW));
    await reviewDeliverable(sql, { spaceId: w.spaceId, deliverableId: one.deliverableId!, decision: "approve", body: "", now: NOW + 1 });
    const response = await csAgentWorkPost(
      new Request(`https://hq.example/api/client-services/agent-work/${two.workItemId}`, { method: "POST", headers: cs, body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: two.workItemId }) },
    );
    expect(response.status).toBe(200);
    const names = (await listFolderFiles(sql, w.member, w.spaceId)).map((file) => file.name);
    expect(names.some((name) => name.startsWith("Social/Facebook/"))).toBe(true);
    expect(names.some((name) => name.startsWith("Blog/"))).toBe(true);
    expect((await sql.all("SELECT 1 FROM notifications WHERE event = 'deliverable.published'")).length).toBe(2);
    const noAuth = await csAgentWorkPost(
      new Request(`https://hq.example/api/client-services/agent-work/${two.workItemId}`, { method: "POST", body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: two.workItemId }) },
    );
    expect(noAuth.status).toBe(401);
  });
});

describe("supersede and retract", () => {
  it("a new filing supersedes the agent's own held one: old batch gone, deliverable archived, card points at the new one", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const taskId = await card(w.org, w.projectId);
    const first = filed(await fileAgentWork(sql, store, principal, { ...posts, task_id: taskId }, NOW));
    const second = filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "social-v2", supersedes: "social-v1", task_id: taskId }, NOW + 1));
    expect(second.supersededId).toBe(first.workItemId);
    // The replacement keeps the names of what it replaces (no " (2)").
    expect(second.paths).toEqual(first.paths);
    const old = await sql.get<{ review_state: string; superseded_by: string }>("SELECT review_state, superseded_by FROM agent_work_items WHERE id = ?", [first.workItemId]);
    expect(old).toEqual({ review_state: "superseded", superseded_by: second.workItemId });
    expect((await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE id = ?", [first.deliverableId]))?.status).toBe("archived");
    expect((await sql.get<{ deliverable_id: string }>("SELECT deliverable_id FROM tasks WHERE id = ?", [taskId]))?.deliverable_id).toBe(second.deliverableId);
    const staffNames = (await listFolderFiles(sql, w.operator, w.spaceId)).map((file) => file.batchId);
    expect(new Set(staffNames).size).toBe(1);
  });

  it("refuses to supersede work that is approved, or someone else's", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const { principal: hire } = await agent(w.org, "acme-hire");
    const first = filed(await fileAgentWork(sql, store, principal, posts, NOW));
    expect(await fileAgentWork(sql, store, hire, { ...posts, external_id: "x", supersedes: "social-v1" }, NOW)).toMatchObject({ ok: false, error: "invalid" });
    await csAgentWorkPost(
      new Request(`https://hq.example/api/client-services/agent-work/${first.workItemId}`, { method: "POST", headers: cs, body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: first.workItemId }) },
    );
    expect(await fileAgentWork(sql, store, principal, { ...posts, external_id: "y", supersedes: "social-v1" }, NOW)).toMatchObject({ ok: false, error: "invalid" });
  });

  it("an agent retracts its own held filing; approved work stays", async () => {
    const w = await world();
    const { token, principal } = await agent(w.org);
    const held = filed(await fileAgentWork(sql, store, principal, posts, NOW));
    const retract = (id: string, auth = token) =>
      agentWorkItemPost(
        new Request(`https://hq.example/api/agent-work/${id}`, {
          method: "POST",
          headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
          body: JSON.stringify({ action: "retract", reason: "Wrong caption." }),
        }),
        { params: Promise.resolve({ id }) },
      );
    const response = await retract(held.workItemId);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ review_state: "retracted" });
    expect(await listFolderFiles(sql, w.operator, w.spaceId)).toEqual([]);
    expect((await retract(held.workItemId)).status).toBe(409);
    const approved = filed(await fileAgentWork(sql, store, principal, { ...posts, external_id: "kept" }, NOW));
    await csAgentWorkPost(
      new Request(`https://hq.example/api/client-services/agent-work/${approved.workItemId}`, { method: "POST", headers: cs, body: JSON.stringify({ action: "approve" }) }),
      { params: Promise.resolve({ id: approved.workItemId }) },
    );
    expect((await retract(approved.workItemId)).status).toBe(409);
    expect((await retract(approved.workItemId, "caw_not_a_token_value_000")).status).toBe(401);
  });
});

describe("older filings", () => {
  it("stay visible, and Client Services can discard one", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const item = filed(await fileAgentWork(sql, store, principal, posts, NOW));
    // What a filing from before review looks like: no review state, batch never held.
    await sql.run("UPDATE agent_work_items SET review_state = NULL WHERE id = ?", [item.workItemId]);
    await sql.run("UPDATE batches SET held_at = NULL");
    expect(await listFolderFiles(sql, w.member, w.spaceId)).toHaveLength(4);
    const discard = await csAgentWorkPost(
      new Request(`https://hq.example/api/client-services/agent-work/${item.workItemId}`, {
        method: "POST",
        headers: cs,
        body: JSON.stringify({ action: "discard", reason: "Old caption." }),
      }),
      { params: Promise.resolve({ id: item.workItemId }) },
    );
    expect(discard.status).toBe(200);
    expect(await listFolderFiles(sql, w.member, w.spaceId)).toEqual([]);
    const row = await sql.get<{ state: string; review_state: string }>("SELECT state, review_state FROM agent_work_items WHERE id = ?", [item.workItemId]);
    expect(row).toEqual({ state: "discarded", review_state: "discarded" });
    const logged = await sql.get<{ body: string }>("SELECT body FROM activities WHERE kind = 'client_services.agent_work_discarded'");
    expect(logged?.body).toContain("Old caption.");
  });
});

describe("migration switch", () => {
  it("HANDOFF_SKIP_MIGRATIONS holds a step back so a preview never changes the live schema", async () => {
    expect([...skippedMigrations(" 0032_agent_work_review.sql , ")]).toEqual(["0032_agent_work_review.sql"]);
    expect(skippedMigrations(undefined).size).toBe(0);
    const db = new DatabaseSync(":memory:");
    const fresh = d1Sql(d1Over(db));
    process.env.HANDOFF_SKIP_MIGRATIONS = "0032_agent_work_review.sql";
    await migrate(fresh);
    const columns = db.prepare("PRAGMA table_info(batches)").all() as { name: string }[];
    expect(columns.some((column) => column.name === "held_at")).toBe(false);
    delete process.env.HANDOFF_SKIP_MIGRATIONS;
    await migrate(fresh);
    const after = db.prepare("PRAGMA table_info(batches)").all() as { name: string }[];
    expect(after.some((column) => column.name === "held_at")).toBe(true);
  });
});

describe("moving a card", () => {
  it("still works for a card whose filing is held", async () => {
    const w = await world();
    const { principal } = await agent(w.org);
    const taskId = await card(w.org, w.projectId);
    filed(await fileAgentWork(sql, store, principal, { ...posts, task_id: taskId }, NOW));
    const moved = await moveTaskStage(sql, { taskId, to: "review", now: NOW + 5, actor: { kind: "agent", id: "acme-lead" } });
    expect(moved.ok).toBe(true);
  });
});
