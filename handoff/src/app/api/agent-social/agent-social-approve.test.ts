import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postPlans } from "@/app/api/agent-social/plans/route";
import { POST as postApprove } from "@/app/api/agent-social/items/[itemId]/approve/route";
import { POST as postUnapprove } from "@/app/api/agent-social/items/[itemId]/unapprove/route";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { getAgentSocialPermission, setAgentSocialPermission } from "@/lib/agent-social-permissions";
import { registerClientAgent } from "@/lib/agent-work-filing";
import { setSocialRuntimeForTests } from "@/lib/social-runtime";
import type { ObjectStore } from "@/lib/store/objects";
import type { ZernioClient, ZernioPostInput } from "@/lib/zernio";

const NOW = Date.now();
const CTX = Symbol.for("__cloudflare-context__");
const BASE = "https://hq.example.test/api/agent-social";
const FUTURE = NOW + 3 * 86_400_000;
const HOUR = 60 * 60 * 1000;

let sql: Sql;
let d1: D1Like;
let posts: ZernioPostInput[];

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

function fakeZernio(): ZernioClient {
  return {
    findProfile: async () => null,
    createProfile: async () => ({ _id: "prof-1", name: "Acme", externalId: "org-1" }),
    listAccounts: async () => [],
    connectUrl: async () => "https://example.com/oauth",
    disconnectAccount: async () => undefined,
    presign: async (filename: string) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async () => undefined,
    createPost: async (input: ZernioPostInput) => {
      posts.push(input);
      return { _id: `zp-${posts.length}`, status: input.publishNow ? "publishing" : "scheduled" };
    },
    getPost: async () => ({ _id: "zp-1", status: "published", platforms: [] }),
    reschedulePost: async (postId: string) => ({ _id: postId, status: "scheduled" }),
    deletePost: async () => undefined,
    listWebhooks: async () => [],
    saveWebhook: async () => ({ _id: "wh", name: "n", url: "https://example.test/hook", events: [] }),
  } as ZernioClient;
}

const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

beforeEach(async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  d1 = d1Over(db);
  sql = d1Sql(d1);
  await migrate(sql);
  posts = [];
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.AGENT_MODE = "agents";
  process.env.SOCIAL_AGENT_ACTIONS = "on";
  setSocialRuntimeForTests({ zernio: fakeZernio(), store });
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  delete process.env.SOCIAL_AGENT_ACTIONS;
  setSocialRuntimeForTests(null);
});

const VIDEO = JSON.stringify([
  { r2_key: "clip", role: "main", content_type: "video/mp4" },
  { r2_key: "clip-poster", role: "poster", content_type: "image/png" },
]);
const PICTURE = JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]);
const PDF = JSON.stringify([{ r2_key: "doc", role: "main", content_type: "application/pdf" }]);

async function addItem(id: string, deliverable: string, format: string, status: string, media: string, version = 1) {
  await sql.run(
    `INSERT INTO deliverable_items (id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort)
     VALUES (?, ?, ?, NULL, ?, NULL, ?, 'Caption', ?, NULL, ?, 0)`,
    [id, deliverable, version, format, `Piece ${id}`, media, status],
  );
}

async function addDeliverable(id: string, status: string, options: { kind?: string; version?: number; published?: number | null; org?: string } = {}) {
  await sql.run(
    `INSERT INTO deliverables (id, organization_id, project_id, workspace_id, title, kind, status, version, published_version, actor_kind, actor_id, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, 'staff', 'staff-1', ?, ?)`,
    [id, options.org ?? "org-1", (options.org ?? "org-1") === "org-1" ? "ws-1" : "ws-2", `Pack ${id}`, options.kind ?? "social_pack", status, options.version ?? 1, options.published === undefined ? 1 : options.published, NOW, NOW],
  );
}

async function seed() {
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'other.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, logo_object_key, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id)
     VALUES ('ws-1', 'acme', 'acme', 'acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO workspaces (id, slug, name, display_name, logo_object_key, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id)
     VALUES ('ws-2', 'other', 'other', 'other', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-2')`,
    [NOW],
  );
  await sql.run("INSERT INTO social_agent_policies (organization_id, mode, capabilities_json, updated_at) VALUES ('org-1', 'managed', '{}', ?)", [NOW]);
  // The v5 shape: a social pack in review with a clip filed as `file` and a loose poster picture that must stay unapproved.
  await addDeliverable("d-1", "in_review");
  await addItem("v-1", "d-1", "file", "pending", VIDEO);
  await addItem("p-1", "d-1", "static", "pending", PICTURE);
  await sql.run("INSERT INTO tasks (id, organization_id, title, status, deliverable_id, created_at, updated_at) VALUES ('t-1', 'org-1', 'Card', 'done', 'd-1', ?, ?)", [NOW, NOW]);
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at) VALUES ('li', 'org-1', 'linkedin', 'acme', 'Acme', 1, ?)`,
    [NOW],
  );
  await sql.run("INSERT INTO social_profiles (organization_id, zernio_profile_id, created_at) VALUES ('org-1', 'prof-1', ?)", [NOW]);
  const hire = await registerClientAgent(sql, { agentId: "social-content-ops", label: "Social", organizationId: "org-1", workspaceId: "ws-1", role: "hire", actor: "test", now: NOW });
  const lead = await registerClientAgent(sql, { agentId: "acme-client", label: "Acme Client", organizationId: "org-1", workspaceId: "ws-1", role: "lead", actor: "test", now: NOW });
  if (!hire.ok || !hire.token || !lead.ok || !lead.token) throw new Error("agent");
  return { hire: hire.token, lead: lead.token };
}

async function allow(options: { canSchedule?: boolean; canApprove?: boolean } = {}) {
  const result = await setAgentSocialPermission(sql, {
    by: { kind: "staff", id: "staff-1" },
    agentId: "social-content-ops",
    organizationId: "org-1",
    canSchedule: options.canSchedule ?? false,
    canApprove: options.canApprove,
    now: NOW,
  });
  expect(result.ok).toBe(true);
}

function request(path: string, token: string | null, body: unknown) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

type Json = Record<string, unknown> & { reasonCode?: string; changed?: boolean; status?: string; warnings?: string[] };

async function approve(token: string | null, itemId: string, body: Record<string, unknown> = {}, which: "approve" | "unapprove" = "approve") {
  const handler = which === "approve" ? postApprove : postUnapprove;
  const response = await handler(request(`/items/${itemId}/${which}`, token, { client: "acme.example", external_id: `ext-${Math.random()}`, ...body }), {
    params: Promise.resolve({ itemId }),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

async function statusOf(id: string): Promise<string> {
  return (await sql.get<{ status: string }>("SELECT status FROM deliverable_items WHERE id = ?", [id]))!.status;
}

async function deliverableStatus(id: string): Promise<string> {
  return (await sql.get<{ status: string }>("SELECT status FROM deliverables WHERE id = ?", [id]))!.status;
}

const approvals = () => sql.all<{ kind: string; actor_kind: string; actor_id: string; data_json: string; body: string }>(
  "SELECT kind, actor_kind, actor_id, data_json, body FROM activities WHERE kind IN ('social.item.approved', 'social.item.unapproved')",
);

describe("agent approval of one social piece: who may", () => {
  it("is off for a hire by default, and nothing changes", async () => {
    const { hire } = await seed();
    const denied = await approve(hire, "v-1");
    expect(denied.status).toBe(403);
    expect(denied.json.reasonCode).toBe("role_denied");
    await allow({ canSchedule: true });
    expect((await approve(hire, "v-1")).status).toBe(403);
    expect(await statusOf("v-1")).toBe("pending");
    expect(await approvals()).toHaveLength(0);
  });

  it("lets a hire with can_approve approve one piece, without can_schedule", async () => {
    const { hire } = await seed();
    await allow({ canSchedule: false, canApprove: true });
    const done = await approve(hire, "v-1", { reason: "Christopher approved the video in chat" });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ itemId: "v-1", changed: true, status: "approved", scheduled: false, approvedBy: "agent:social-content-ops" });
    // It still cannot schedule.
    const plan = await postPlans(request("/plans", hire, { client: "acme.example", external_id: "p", action: "schedule", deliverable_id: "d-1", work_item_id: "t-1", selection: { mode: "explicit", item_ids: ["v-1"], account_ids: ["li"] }, timing: { mode: "scheduled", start_at: FUTURE } }));
    expect(plan.status).toBe(403);
  });

  it("keeps can_approve when staff later set the other flags without naming it, and can switch it off", async () => {
    await seed();
    await allow({ canSchedule: false, canApprove: true });
    await allow({ canSchedule: true });
    expect(await getAgentSocialPermission(sql, "social-content-ops", "org-1")).toMatchObject({ canSchedule: true, canApprove: true });
    await allow({ canSchedule: true, canApprove: false });
    expect(await getAgentSocialPermission(sql, "social-content-ops", "org-1")).toMatchObject({ canApprove: false });
  });

  it("lets a client lead approve in managed and schedule_approved mode, not in draft or observe", async () => {
    const { lead } = await seed();
    await sql.run("UPDATE social_agent_policies SET mode = 'draft'");
    const draft = await approve(lead, "v-1");
    expect(draft.status).toBe(403);
    expect(draft.json.reasonCode).toBe("policy_draft");
    await sql.run("UPDATE social_agent_policies SET mode = 'observe'");
    const observe = await approve(lead, "v-1");
    expect(observe.status).toBe(403);
    expect(observe.json.reasonCode).toBe("policy_observe");
    expect(await statusOf("v-1")).toBe("pending");
    await sql.run("UPDATE social_agent_policies SET mode = 'schedule_approved'");
    expect((await approve(lead, "v-1")).status).toBe(200);
    await sql.run("UPDATE social_agent_policies SET mode = 'managed'");
    expect((await approve(lead, "p-1")).status).toBe(200);
  });

  it("answers 401 without a token, 400 without an external id, and 403 when agent social actions are off", async () => {
    const { lead } = await seed();
    expect((await approve(null, "v-1")).status).toBe(401);
    const noExternal = await postApprove(request("/items/v-1/approve", lead, { client: "acme.example" }), { params: Promise.resolve({ itemId: "v-1" }) });
    expect(noExternal.status).toBe(400);
    delete process.env.SOCIAL_AGENT_ACTIONS;
    const off = await approve(lead, "v-1");
    expect(off.status).toBe(403);
    expect(off.json.reasonCode).toBe("feature_disabled");
    expect(await statusOf("v-1")).toBe("pending");
  });

  it("is limited to the agent's own client", async () => {
    const { lead } = await seed();
    await addDeliverable("d-x", "in_review", { org: "org-2" });
    await addItem("x-1", "d-x", "static", "pending", PICTURE);
    expect((await approve(lead, "x-1")).status).toBe(404);
    const other = await postApprove(request("/items/v-1/approve", lead, { client: "other.example", external_id: "e" }), { params: Promise.resolve({ itemId: "v-1" }) });
    expect(other.status).toBe(403);
    expect(await statusOf("x-1")).toBe("pending");
  });
});

describe("agent approval of one social piece: safety", () => {
  it("approves only the named piece: the poster, the deliverable's other pieces and everything else stay pending, and nothing posts", async () => {
    const { lead } = await seed();
    await sql.run("INSERT INTO social_autopost (organization_id, enabled, account_ids, weekdays, times, timezone, updated_at) VALUES ('org-1', 1, '[\"li\"]', '1,2,3,4,5', '09:00', 'UTC', ?)", [NOW]);
    const done = await approve(lead, "v-1", { deliverable_id: "d-1" });
    expect(done.status).toBe(200);
    expect(done.json).toMatchObject({ status: "approved", deliverableStatus: "in_review", scheduled: false });
    expect(done.json.warnings?.[0]).toMatch(/Auto-post is on/);
    expect(await statusOf("v-1")).toBe("approved");
    expect(await statusOf("p-1")).toBe("pending");
    expect(await deliverableStatus("d-1")).toBe("in_review");
    expect(await sql.all("SELECT id FROM social_posts")).toHaveLength(0);
    expect(await sql.all("SELECT id FROM social_publish_plans")).toHaveLength(0);
    expect(posts).toHaveLength(0);
  });

  it("follows the deliverable status the way a staff item approval does, and un-approving puts it back", async () => {
    const { lead } = await seed();
    await approve(lead, "v-1");
    const last = await approve(lead, "p-1");
    expect(last.json.deliverableStatus).toBe("approved");
    expect(await deliverableStatus("d-1")).toBe("approved");
    const back = await approve(lead, "p-1", {}, "unapprove");
    expect(back.status).toBe(200);
    expect(await statusOf("p-1")).toBe("pending");
    expect(await deliverableStatus("d-1")).toBe("in_review");
    expect(await statusOf("v-1")).toBe("approved");
  });

  it("is idempotent: a second approval changes nothing and logs nothing", async () => {
    const { lead } = await seed();
    expect((await approve(lead, "v-1")).json.changed).toBe(true);
    const again = await approve(lead, "v-1");
    expect(again.status).toBe(200);
    expect(again.json.changed).toBe(false);
    expect(await approvals()).toHaveLength(1);
    expect((await approve(lead, "p-1", {}, "unapprove")).json.changed).toBe(false);
  });

  it("leaves an audit trail naming the agent, the external id and the reason", async () => {
    const { hire } = await seed();
    await allow({ canApprove: true });
    await approve(hire, "v-1", { external_id: "approve-v-1-v1", reason: "Christopher said so" });
    const rows = await approvals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "social.item.approved", actor_kind: "agent", actor_id: "social-content-ops" });
    expect(rows[0]!.body).toContain("Christopher said so");
    expect(JSON.parse(rows[0]!.data_json)).toMatchObject({
      item_id: "v-1", deliverable_id: "d-1", version: 1, previous_status: "pending", status: "approved",
      agent_id: "social-content-ops", role: "hire", external_id: "approve-v-1-v1", reason: "Christopher said so", auto_scheduled: false,
    });
    await approve(hire, "v-1", { external_id: "undo-1" }, "unapprove");
    expect((await approvals()).map((row) => row.kind)).toEqual(["social.item.approved", "social.item.unapproved"]);
  });

  it("refuses pieces that are not postable social pieces at the published version", async () => {
    const { lead } = await seed();
    await addItem("f-pdf", "d-1", "file", "pending", PDF);
    await addItem("pg", "d-1", "page", "pending", "[]");
    await addItem("lk", "d-1", "link", "pending", "[]");
    await addItem("cr", "d-1", "static", "changes_requested", PICTURE);
    await addItem("old", "d-1", "static", "pending", PICTURE, 0);
    await addItem("gone", "d-1", "static", "pending", PICTURE);
    await sql.run("UPDATE deliverable_items SET removed_at = ? WHERE id = 'gone'", [NOW]);
    await addDeliverable("d-brief", "in_review", { kind: "brief" });
    await addItem("br", "d-brief", "static", "pending", PICTURE);
    await addDeliverable("d-draft", "draft");
    await addItem("dr", "d-draft", "static", "pending", PICTURE);
    await addDeliverable("d-ch", "changes_requested");
    await addItem("dc", "d-ch", "static", "pending", PICTURE);
    await addDeliverable("d-held", "in_review", { version: 2, published: null });
    await addItem("hd", "d-held", "static", "pending", PICTURE, 2);
    const expected: [string, number, string][] = [
      ["f-pdf", 409, "not_social_piece"],
      ["pg", 409, "not_social_piece"],
      ["lk", 409, "not_social_piece"],
      ["cr", 409, "changes_requested"],
      ["old", 409, "stale_version"],
      ["gone", 409, "piece_removed"],
      ["br", 409, "not_social_piece"],
      ["dr", 409, "deliverable_not_reviewable"],
      ["dc", 409, "deliverable_not_reviewable"],
      ["hd", 409, "stale_version"],
      ["missing", 404, "not_found"],
    ];
    for (const [id, status, reasonCode] of expected) {
      const result = await approve(lead, id);
      expect([id, result.status, result.json.reasonCode]).toEqual([id, status, reasonCode]);
    }
    const wrongPack = await approve(lead, "v-1", { deliverable_id: "d-brief" });
    expect(wrongPack.json.reasonCode).toBe("deliverable_mismatch");
    expect(await sql.all("SELECT id FROM deliverable_items WHERE status = 'approved'")).toHaveLength(0);
    expect(await approvals()).toHaveLength(0);
  });

  it("refuses a project that opted out of the Library", async () => {
    const { lead } = await seed();
    await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at) VALUES ('pr-1', 'org-1', 'Print', 'active', ?, ?)", [NOW, NOW]);
    await sql.run("UPDATE projects SET include_in_library = 0 WHERE id = 'pr-1'");
    await sql.run("UPDATE deliverables SET project_id = 'pr-1' WHERE id = 'd-1'");
    const result = await approve(lead, "v-1");
    expect(result.status).toBe(409);
    expect(result.json.reasonCode).toBe("project_excluded");
  });

  it("will not un-approve a piece that is already scheduled or posted", async () => {
    const { lead } = await seed();
    await approve(lead, "v-1");
    await sql.run(
      `INSERT INTO social_posts (id, organization_id, deliverable_id, item_id, version, status, post_type, mode, scheduled_for, created_at, updated_at, account_ids)
       VALUES ('sp-1', 'org-1', 'd-1', 'v-1', 1, 'scheduled', 'reel', 'scheduled', ?, ?, ?, '["li"]')`,
      [FUTURE, NOW, NOW],
    );
    const result = await approve(lead, "v-1", {}, "unapprove");
    expect(result.status).toBe(409);
    expect(result.json.reasonCode).toBe("post_scheduled");
    expect(await statusOf("v-1")).toBe("approved");
  });

  it("rate limits approvals per agent and client", async () => {
    const { lead } = await seed();
    for (let index = 0; index < 30; index += 1) {
      await sql.run(
        "INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, created_at) VALUES (?, 'org-1', 'social.item.approved', 'agent', 'acme-client', 'x', ?)",
        [`a-${index}`, NOW - 10 * 60 * 1000],
      );
    }
    const limited = await approve(lead, "v-1");
    expect(limited.status).toBe(429);
    expect(limited.json.reasonCode).toBe("rate_limited");
    expect(await statusOf("v-1")).toBe("pending");
    await sql.run("UPDATE activities SET created_at = ?", [NOW - 2 * HOUR]);
    expect((await approve(lead, "v-1")).status).toBe(200);
  });
});

describe("agent approval then an explicit schedule plan (the v5 video flow)", () => {
  it("a schedule plan is denied as unapproved until the lead approves the video, then is prepared for the video only", async () => {
    const { lead } = await seed();
    const planBody = (external: string) => ({
      client: "acme.example", external_id: external, action: "schedule", deliverable_id: "d-1", work_item_id: "t-1",
      selection: { mode: "explicit", item_ids: ["v-1"], account_ids: ["li"] }, timing: { mode: "scheduled", start_at: FUTURE },
    });
    const before = await postPlans(request("/plans", lead, planBody("plan-1")));
    expect(before.status).toBe(403);
    expect(((await before.json()) as Json).reasonCode).toBe("unapproved");
    expect((await approve(lead, "v-1", { deliverable_id: "d-1" })).status).toBe(200);
    const after = await postPlans(request("/plans", lead, planBody("plan-2")));
    const planned = (await after.json()) as { authorization: string; rows: { itemId: string }[]; blocked: unknown[] };
    expect(after.status).toBe(200);
    expect(planned.authorization).toBe("allowed");
    expect(planned.rows.map((row) => row.itemId)).toEqual(["v-1"]);
    expect(posts).toHaveLength(0);
    expect(await statusOf("p-1")).toBe("pending");
  });
});
