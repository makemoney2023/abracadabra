import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as postPlans } from "@/app/api/agent-social/plans/route";
import { POST as postExecute } from "@/app/api/agent-social/plans/[planId]/execute/route";
import { GET as getPlan } from "@/app/api/agent-social/plans/[planId]/route";
import { PATCH as patchVariant } from "@/app/api/agent-social/pieces/[itemId]/variants/route";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { getAgentSocialPermission, setAgentSocialPermission } from "@/lib/agent-social-permissions";
import { agentForToken, registerClientAgent } from "@/lib/agent-work-filing";
import { approveAgentSocialPlan } from "@/lib/social-commands";
import { setSocialRuntimeForTests } from "@/lib/social-runtime";
import { runHqTool } from "@/lib/hq-tools";
import type { ObjectStore } from "@/lib/store/objects";
import type { ZernioClient, ZernioPostInput } from "@/lib/zernio";

const NOW = Date.now();
const CTX = Symbol.for("__cloudflare-context__");
const BASE = "https://hq.example.test/api/agent-social";
const FUTURE = NOW + 3 * 86_400_000;

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

async function seed() {
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-2', 'Other', 'other.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'acme', 'acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run("INSERT INTO social_agent_policies (organization_id, mode, capabilities_json, updated_at) VALUES ('org-1', 'managed', '{}', ?)", [NOW]);
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'approved', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-2', 'org-1', NULL, 'ws-1', 'Other pack', 'social_pack', 'approved', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  const media = JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]);
  for (const [id, deliverable, status] of [
    ["i-1", "d-1", "approved"],
    ["i-2", "d-2", "approved"],
    ["i-3", "d-1", "pending"],
  ] as const) {
    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, ?, 1, NULL, 'static', NULL, ?, 'Caption', ?, NULL, ?, 0)`,
      [id, deliverable, `Piece ${id}`, media, status],
    );
  }
  for (const [id, deliverable, status] of [
    ["t-1", "d-1", "done"],
    ["t-2", "d-2", "doing"],
  ] as const) {
    await sql.run(
      `INSERT INTO tasks (id, organization_id, title, status, deliverable_id, created_at, updated_at) VALUES (?, 'org-1', ?, ?, ?, ?, ?)`,
      [id, `Card ${id}`, status, deliverable, NOW, NOW],
    );
  }
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('li', 'org-1', 'linkedin', 'acme', 'Acme', 1, ?), ('ig', 'org-1', 'instagram', 'acme', 'Acme', 1, ?)`,
    [NOW, NOW],
  );
  await sql.run("INSERT INTO social_profiles (organization_id, zernio_profile_id, created_at) VALUES ('org-1', 'prof-1', ?)", [NOW]);
  const made = await registerClientAgent(sql, {
    agentId: "social-content-ops",
    label: "Social & Content Ops",
    organizationId: "org-1",
    workspaceId: "ws-1",
    role: "hire",
    actor: "test",
    now: NOW,
  });
  if (!made.ok || !made.token) throw new Error("agent");
  if (!(await agentForToken(sql, `Bearer ${made.token}`))) throw new Error("token");
  return made.token;
}

async function allow(options: { canSchedule?: boolean; canPublishNow?: boolean; platforms?: string[] } = {}) {
  const result = await setAgentSocialPermission(sql, {
    by: { kind: "staff", id: "staff-1" },
    agentId: "social-content-ops",
    organizationId: "org-1",
    canSchedule: options.canSchedule ?? true,
    canPublishNow: options.canPublishNow,
    platforms: options.platforms,
    now: NOW,
  });
  expect(result.ok).toBe(true);
}

function write(path: string, token: string, body: unknown, method = "POST") {
  return new Request(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

function scheduleBody(overrides: Record<string, unknown> = {}) {
  return {
    client: "acme.example",
    external_id: `plan-${Math.random()}`,
    action: "schedule",
    deliverable_id: "d-1",
    work_item_id: "t-1",
    selection: { mode: "explicit", item_ids: ["i-1"], account_ids: ["li"] },
    timing: { mode: "scheduled", start_at: FUTURE, gap_minutes: 60 },
    ...overrides,
  };
}

type PlanJson = {
  planId: string;
  planHash: string;
  authorization: string;
  reasonCode: string;
  rows: { itemId: string }[];
  blocked: { itemId: string; reason: string | null }[];
};

async function plan(token: string, body: Record<string, unknown>): Promise<{ status: number; json: PlanJson & Record<string, unknown> }> {
  const response = await postPlans(write("/plans", token, body));
  return { status: response.status, json: (await response.json()) as PlanJson & Record<string, unknown> };
}

async function run(token: string, planId: string, body: Record<string, unknown>) {
  const response = await postExecute(write(`/plans/${planId}/execute`, token, body), { params: Promise.resolve({ planId }) });
  return { status: response.status, json: (await response.json()) as Record<string, unknown> };
}

async function readPlan(token: string, planId: string) {
  const response = await getPlan(new Request(`${BASE}/plans/${planId}`, { headers: { authorization: `Bearer ${token}` } }), {
    params: Promise.resolve({ planId }),
  });
  return (await response.json()) as { approval: { status: string; confirmationToken?: string } };
}

describe("agent scheduling: permission model", () => {
  it("is off by default: a function agent in a managed client still cannot schedule or publish", async () => {
    const token = await seed();
    expect(await getAgentSocialPermission(sql, "social-content-ops", "org-1")).toBeNull();
    for (const action of ["schedule", "publish_now"]) {
      const denied = await plan(token, scheduleBody({ action }));
      expect(denied.status).toBe(403);
      expect(denied.json.reasonCode).toMatch(/^(capability_revoked|role_denied)$/);
    }
    expect(await sql.all("SELECT id FROM social_posts")).toHaveLength(0);
    expect(posts).toHaveLength(0);
  });

  it("stays off when the permission row says can_schedule = 0, and publish-now needs its own flag", async () => {
    const token = await seed();
    await allow({ canSchedule: false, canPublishNow: true });
    expect((await plan(token, scheduleBody())).status).toBe(403);
    await allow({ canSchedule: true, canPublishNow: false });
    expect((await plan(token, scheduleBody())).status).toBe(200);
    const now = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    expect(now.status).toBe(403);
    expect(now.json.reasonCode).toBe("role_denied");
    await allow({ canSchedule: true, canPublishNow: true });
    const allowed = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    expect(allowed.status).toBe(200);
    expect(allowed.json.authorization).toBe("allowed");
  });

  it("does not grant a permission to an agent that is not assigned to the client, and writes an audit row", async () => {
    await seed();
    const refused = await setAgentSocialPermission(sql, {
      by: { kind: "staff", id: "staff-1" },
      agentId: "social-content-ops",
      organizationId: "org-2",
      canSchedule: true,
      now: NOW,
    });
    expect(refused).toEqual({ ok: false, reasonCode: "not_assigned" });
    await allow({ platforms: ["linkedin"] });
    const audit = await sql.all<{ kind: string; data_json: string }>("SELECT kind, data_json FROM activities WHERE kind = 'social.agent.permission.updated'");
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.data_json)).toMatchObject({ agentId: "social-content-ops", canSchedule: true, canPublishNow: false });
  });

  it("is off entirely when SOCIAL_AGENT_ACTIONS is off", async () => {
    const token = await seed();
    await allow();
    delete process.env.SOCIAL_AGENT_ACTIONS;
    const response = await plan(token, scheduleBody());
    expect(response.status).toBe(403);
    expect(response.json.reasonCode).toBe("feature_disabled");
  });

  it("lets staff set the permission through the gated HQ tool, and only with approval", async () => {
    await seed();
    const caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
    const input = { organizationId: "org-1", agentId: "social-content-ops", canSchedule: true, canPublishNow: false, platforms: ["linkedin"] };
    const unapproved = await runHqTool(sql, caller as never, { tool: "set_agent_social_permission", input, idempotencyKey: "perm-1" }, NOW);
    expect(unapproved).toMatchObject({ needsApproval: true });
    expect(await getAgentSocialPermission(sql, "social-content-ops", "org-1")).toBeNull();
    const approved = await runHqTool(sql, caller as never, { tool: "set_agent_social_permission", input, idempotencyKey: "perm-2", approved: true }, NOW);
    expect(approved).toMatchObject({ ok: true });
    expect(await getAgentSocialPermission(sql, "social-content-ops", "org-1")).toMatchObject({ canSchedule: true, canPublishNow: false, platforms: ["linkedin"] });
  });
});

describe("agent scheduling: card, deliverable and project guardrails", () => {
  it("requires a deliverable id and a work item id", async () => {
    const token = await seed();
    await allow();
    const noDeliverable = await plan(token, scheduleBody({ deliverable_id: undefined }));
    expect(noDeliverable.status).toBe(400);
    expect(noDeliverable.json.reasonCode).toBe("deliverable_required");
    const noCard = await plan(token, scheduleBody({ work_item_id: undefined }));
    expect(noCard.status).toBe(400);
    expect(noCard.json.reasonCode).toBe("work_item_required");
  });

  it("refuses a card that is not Done, a card for another deliverable, and pieces of another deliverable", async () => {
    const token = await seed();
    await allow();
    const notDone = await plan(token, scheduleBody({ deliverable_id: "d-2", work_item_id: "t-2", selection: { mode: "explicit", item_ids: ["i-2"], account_ids: ["li"] } }));
    expect(notDone.status).toBe(409);
    expect(notDone.json.reasonCode).toBe("card_not_done");
    const mismatch = await plan(token, scheduleBody({ work_item_id: "t-2" }));
    expect(mismatch.status).toBe(409);
    expect(mismatch.json.reasonCode).toBe("work_item_mismatch");
    const wrongPiece = await plan(token, scheduleBody({ selection: { mode: "explicit", item_ids: ["i-2"], account_ids: ["li"] } }));
    expect(wrongPiece.status).toBe(409);
    expect(wrongPiece.json.reasonCode).toBe("deliverable_mismatch");
    const missing = await plan(token, scheduleBody({ work_item_id: "t-nope" }));
    expect(missing.status).toBe(404);
    expect(await sql.all("SELECT id FROM social_publish_plans WHERE action = 'schedule'")).toHaveLength(0);
  });

  it("never sweeps: an eligible-mode request is refused", async () => {
    const token = await seed();
    await allow();
    const sweep = await plan(token, scheduleBody({ selection: { mode: "eligible", item_ids: [], account_ids: ["li"] } }));
    expect(sweep.status).toBe(403);
    expect(sweep.json.reasonCode).toBe("selection_required");
    expect(sweep.json.rows).toEqual([]);
    const named = await plan(token, scheduleBody({ selection: { mode: "eligible", item_ids: ["i-1"], account_ids: ["li"] } }));
    expect(named.status).toBe(400);
  });

  it("only posts approved pieces", async () => {
    const token = await seed();
    await allow();
    const pending = await plan(token, scheduleBody({ selection: { mode: "explicit", item_ids: ["i-3"], account_ids: ["li"] } }));
    expect(pending.json.rows).toHaveLength(0);
    expect(pending.json.blocked[0]?.reason).toBe("unapproved");
  });

  it("fails closed at plan time when the card is reopened after the binding check (prepare guard)", async () => {
    const token = await seed();
    await allow();
    const ok = await plan(token, scheduleBody());
    expect(ok.json.rows).toHaveLength(1);
    // A card that is Done but sits behind a second, open card on the same deliverable does not count as Done.
    await sql.run("INSERT INTO tasks (id, organization_id, title, status, deliverable_id, created_at, updated_at) VALUES ('t-extra', 'org-1', 'Fix', 'doing', 'd-1', ?, ?)", [NOW, NOW]);
    const again = await plan(token, scheduleBody());
    expect(again.json.rows).toHaveLength(0);
    expect(again.json.blocked[0]?.reason).toBe("card_not_done");
  });

  it("goes stale and posts nothing when the card is reopened between plan and execute", async () => {
    const token = await seed();
    await allow();
    const prepared = await plan(token, scheduleBody());
    await sql.run("UPDATE tasks SET status = 'doing' WHERE id = 't-1'");
    const done = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(done.status).toBe(409);
    expect(done.json.reasonCode).toBe("stale_plan");
    expect(posts).toHaveLength(0);
  });

  it("honours a project that opted out of the Library", async () => {
    const token = await seed();
    await allow();
    await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at, include_in_library) VALUES ('p-1', 'org-1', 'Print', 'active', ?, ?, 0)", [NOW, NOW]);
    await sql.run("UPDATE deliverables SET project_id = 'p-1' WHERE id = 'd-1'");
    const prepared = await plan(token, scheduleBody());
    expect(prepared.json.rows).toHaveLength(0);
    expect(prepared.json.blocked[0]?.reason).toBe("project_excluded");
    // Opting back in lets the same request through.
    await sql.run("UPDATE projects SET include_in_library = 1 WHERE id = 'p-1'");
    expect((await plan(token, scheduleBody())).json.rows).toHaveLength(1);
  });

  it("limits the networks to the permission's list (LinkedIn by default)", async () => {
    const token = await seed();
    await allow();
    const instagram = await plan(token, scheduleBody({ selection: { mode: "explicit", item_ids: ["i-1"], account_ids: ["ig"] } }));
    expect(instagram.json.rows).toHaveLength(0);
    expect(instagram.json.blocked[0]?.reason).toBe("platform_not_allowed");
    await allow({ platforms: ["linkedin", "instagram"] });
    expect((await plan(token, scheduleBody({ selection: { mode: "explicit", item_ids: ["i-1"], account_ids: ["ig"] } }))).json.rows).toHaveLength(1);
  });
});

describe("agent scheduling: running a plan", () => {
  it("schedules on LinkedIn, replays the same idempotency key, and refuses a second plan for the same piece", async () => {
    const token = await seed();
    await allow();
    const prepared = await plan(token, scheduleBody());
    expect(prepared.json.authorization).toBe("allowed");
    const first = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(first.status).toBe(200);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.platforms?.[0]?.platform).toBe("linkedin");
    const replay = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(replay.json.duplicate).toBe(true);
    expect(posts).toHaveLength(1);
    const second = await plan(token, scheduleBody());
    expect(second.json.rows).toHaveLength(0);
    expect(second.json.blocked[0]?.reason).toBe("duplicate");
    const noKey = await run(token, second.json.planId, { plan_hash: second.json.planHash });
    expect(noKey.status).toBe(400);
    expect(noKey.json.reasonCode).toBe("external_id_required");
    const noKeyPlan = await plan(token, scheduleBody({ external_id: undefined }));
    expect(noKeyPlan.status).toBe(400);
    expect(noKeyPlan.json.reasonCode).toBe("external_id_required");
  });

  it("writes the client timeline: prepare, execute, and the permission change", async () => {
    const token = await seed();
    await allow();
    const prepared = await plan(token, scheduleBody());
    await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    const kinds = (await sql.all<{ kind: string }>("SELECT kind FROM activities WHERE organization_id = 'org-1'")).map((row) => row.kind);
    expect(kinds).toContain("social.agent.permission.updated");
    expect(kinds.filter((kind) => kind.startsWith("social.")).length).toBeGreaterThanOrEqual(3);
  });

  it("refuses to run a prepared plan after the permission is switched off", async () => {
    const token = await seed();
    await allow();
    const prepared = await plan(token, scheduleBody());
    await allow({ canSchedule: false });
    const done = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(done.status).toBe(403);
    expect(done.json.reasonCode).toMatch(/^(capability_revoked|role_denied)$/);
    expect(posts).toHaveLength(0);
    expect(await sql.all("SELECT id FROM social_posts")).toHaveLength(0);
  });

  it("publishes now without a per-post approval when the permission, a Done card and an approved piece line up", async () => {
    const token = await seed();
    await allow({ canPublishNow: true });
    const prepared = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    expect(prepared.status).toBe(200);
    expect(prepared.json.authorization).toBe("allowed");
    expect((await readPlan(token, prepared.json.planId)).approval.status).toBe("not_required");
    const done = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(done.status).toBe(200);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.publishNow).toBe(true);
    expect(posts[0]?.platforms?.[0]?.platform).toBe("linkedin");
    // Idempotent: the same key replays, a new plan for the same piece is blocked as a duplicate.
    const replay = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(replay.json.duplicate).toBe(true);
    expect(posts).toHaveLength(1);
    const second = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    expect(second.json.rows).toHaveLength(0);
    expect(second.json.blocked[0]?.reason).toBe("duplicate");
    const kinds = (await sql.all<{ kind: string }>("SELECT kind FROM activities")).map((row) => row.kind);
    expect(kinds.filter((kind) => kind.startsWith("social.")).length).toBeGreaterThanOrEqual(3);
  });

  it("fails closed for publish now: no permission, canPublishNow off, card not Done, piece unapproved, stale plan, project out", async () => {
    const token = await seed();
    const body = () => scheduleBody({ action: "publish_now", timing: undefined });
    expect((await plan(token, body())).status).toBe(403);
    await allow({ canPublishNow: false });
    expect((await plan(token, body())).status).toBe(403);
    await allow({ canPublishNow: true });
    const notDone = await plan(token, scheduleBody({ action: "publish_now", timing: undefined, deliverable_id: "d-2", work_item_id: "t-2", selection: { mode: "explicit", item_ids: ["i-2"], account_ids: ["li"] } }));
    expect(notDone.status).toBe(409);
    const unapproved = await plan(token, scheduleBody({ action: "publish_now", timing: undefined, selection: { mode: "explicit", item_ids: ["i-3"], account_ids: ["li"] } }));
    expect(unapproved.json.rows).toHaveLength(0);
    expect(unapproved.json.blocked[0]?.reason).toBe("unapproved");
    const prepared = await plan(token, body());
    expect(prepared.json.rows).toHaveLength(1);
    await sql.run("UPDATE tasks SET status = 'doing' WHERE id = 't-1'");
    const stale = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(stale.status).toBe(409);
    expect(stale.json.reasonCode).toBe("stale_plan");
    await sql.run("UPDATE tasks SET status = 'done' WHERE id = 't-1'");
    const again = await plan(token, body());
    await allow({ canSchedule: true, canPublishNow: false });
    const revoked = await run(token, again.json.planId, { external_id: "exec-2", plan_hash: again.json.planHash });
    expect(revoked.status).toBe(403);
    await allow({ canPublishNow: true });
    await sql.run("INSERT INTO projects (id, organization_id, name, status, created_at, updated_at, include_in_library) VALUES ('p-1', 'org-1', 'Print', 'active', ?, ?, 0)", [NOW, NOW]);
    await sql.run("UPDATE deliverables SET project_id = 'p-1' WHERE id = 'd-1'");
    const excluded = await plan(token, body());
    expect(excluded.json.blocked[0]?.reason).toBe("project_excluded");
    expect(posts).toHaveLength(0);
  });

  it("does not publish now in a client whose mode is still draft without a confirmation", async () => {
    const token = await seed();
    await allow({ canPublishNow: true });
    await sql.run("UPDATE social_agent_policies SET mode = 'draft' WHERE organization_id = 'org-1'");
    const prepared = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    expect(prepared.json.authorization).toBe("confirmation_required");
    const blocked = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(blocked.status).toBe(403);
    expect(posts).toHaveLength(0);
  });

  async function scheduledPost(token: string) {
    const prepared = await plan(token, scheduleBody());
    await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    const post = await sql.get<{ id: string }>("SELECT id FROM social_posts WHERE status = 'scheduled'");
    return post!.id;
  }

  it("cancel needs a staff approval bound to the plan hash, single use, and an agent cannot approve itself", async () => {
    const token = await seed();
    await allow();
    const postId = await scheduledPost(token);
    const { POST: postCancel } = await import("@/app/api/agent-social/posts/[postId]/cancel-plan/route");
    const cancel = await postCancel(write(`/posts/${postId}/cancel-plan`, token, { client: "acme.example", external_id: "cx-1" }), { params: Promise.resolve({ postId }) });
    expect(cancel.status).toBe(200);
    const prepared = (await cancel.json()) as PlanJson;
    expect(prepared.authorization).toBe("confirmation_required");
    expect((await readPlan(token, prepared.planId)).approval.status).toBe("awaiting_staff");
    expect((await run(token, prepared.planId, { external_id: "cx-run", plan_hash: prepared.planHash })).status).toBe(403);
    expect((await run(token, prepared.planId, { external_id: "cx-run2", plan_hash: prepared.planHash, confirmation_token: "made-up" })).status).toBe(403);

    const staff = { kind: "staff" as const, id: "staff-1" };
    await expect(approveAgentSocialPlan(sql, { organizationId: "org-1", planId: prepared.planId, planHash: "wrong", staff, now: Date.now() })).rejects.toMatchObject({ reasonCode: "stale_plan" });
    await expect(approveAgentSocialPlan(sql, { organizationId: "org-2", planId: prepared.planId, planHash: prepared.planHash, staff, now: Date.now() })).rejects.toMatchObject({ status: 404 });
    const agentSelf = { kind: "agent" as const, id: "social-content-ops", role: "hire" as const, assigned: true, mode: "managed" as const, grant: [], revoke: [] };
    await expect(approveAgentSocialPlan(sql, { organizationId: "org-1", planId: prepared.planId, planHash: prepared.planHash, staff: agentSelf, now: Date.now() })).rejects.toMatchObject({ reasonCode: "role_denied" });

    const approved = await approveAgentSocialPlan(sql, { organizationId: "org-1", planId: prepared.planId, planHash: prepared.planHash, staff, now: Date.now() });
    const again = await approveAgentSocialPlan(sql, { organizationId: "org-1", planId: prepared.planId, planHash: prepared.planHash, staff, now: Date.now() });
    expect(again.id).toBe(approved.id);
    expect((await readPlan(token, prepared.planId)).approval).toMatchObject({ status: "approved", confirmationToken: approved.id });
    const other = await registerClientAgent(sql, { agentId: "other-agent", label: "Other", organizationId: "org-1", workspaceId: "ws-1", role: "hire", actor: "test", now: NOW });
    if (!other.ok || !other.token) throw new Error("agent");
    const seen = await readPlan(other.token, prepared.planId);
    expect(seen.approval.confirmationToken).toBeUndefined();
    const done = await run(token, prepared.planId, { external_id: "cx-run3", plan_hash: prepared.planHash, confirmation_token: approved.id });
    expect(done.status).toBe(200);
    const reuse = await run(token, prepared.planId, { external_id: "cx-run4", plan_hash: prepared.planHash, confirmation_token: approved.id });
    expect(reuse.status).toBe(409);
    const kinds = (await sql.all<{ kind: string }>("SELECT kind FROM activities")).map((row) => row.kind);
    expect(kinds).toContain("social.plan.approved");
  });

  it("makes reschedule and cancel staff-approved for a function agent", async () => {
    const token = await seed();
    await allow();
    const prepared = await plan(token, scheduleBody());
    await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    const post = await sql.get<{ id: string }>("SELECT id FROM social_posts WHERE status = 'scheduled'");
    expect(post).toBeTruthy();
    const { POST: postMove } = await import("@/app/api/agent-social/posts/[postId]/move-plan/route");
    const { POST: postCancel } = await import("@/app/api/agent-social/posts/[postId]/cancel-plan/route");
    const moved = await postMove(write(`/posts/${post!.id}/move-plan`, token, { client: "acme.example", external_id: "mv-1", scheduled_for: FUTURE + 86_400_000 }), { params: Promise.resolve({ postId: post!.id }) });
    expect(moved.status).toBe(200);
    expect(((await moved.json()) as { authorization: string }).authorization).toBe("confirmation_required");
    const cancelled = await postCancel(write(`/posts/${post!.id}/cancel-plan`, token, { client: "acme.example", external_id: "cx-1" }), { params: Promise.resolve({ postId: post!.id }) });
    expect(cancelled.status).toBe(200);
    expect(((await cancelled.json()) as { authorization: string }).authorization).toBe("confirmation_required");
  });

  it("blocks a caption edit on an already-scheduled post, and allows it before scheduling", async () => {
    const token = await seed();
    await allow();
    const edit = (revision: number) =>
      patchVariant(write("/pieces/i-1/variants", token, { client: "acme.example", external_id: `v-${revision}-${Math.random()}`, platform: "linkedin", version: 1, expected_revision: revision, caption: `Caption ${revision}` }, "PATCH"), {
        params: Promise.resolve({ itemId: "i-1" }),
      });
    const before = await edit(0);
    expect(before.status).toBe(200);
    const prepared = await plan(token, scheduleBody());
    await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    const after = await edit(1);
    expect(after.status).toBe(409);
    expect(await after.json()).toMatchObject({ reasonCode: "post_scheduled" });
  });
});

describe("agent scheduling: rate limits", () => {
  async function fillPlans(count: number, action: string, executed: boolean) {
    for (let i = 0; i < count; i += 1) {
      await sql.run(
        `INSERT INTO social_publish_plans (
           id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
           plan_hash, authorization, expires_at, created_at, executed_at
         ) VALUES (?, 'org-1', 'agent', 'social-content-ops', ?, '{}', '[]', '[]', '[]', ?, 'allowed', ?, ?, ?)`,
        [`fill-${action}-${executed}-${i}`, action, `h-${i}`, NOW + 60_000, NOW - 1000, executed ? NOW - 1000 : null],
      );
    }
  }

  it("returns 429 when an agent prepares too many plans in an hour", async () => {
    const token = await seed();
    await allow();
    await fillPlans(20, "schedule", false);
    const limited = await plan(token, scheduleBody());
    expect(limited.status).toBe(429);
    expect(limited.json.reasonCode).toBe("rate_limited");
  });

  it("returns 429 when an agent executes too many posts in a day, and caps publish-now lower", async () => {
    const token = await seed();
    await allow({ canPublishNow: true });
    const prepared = await plan(token, scheduleBody());
    await fillPlans(10, "schedule", true);
    const limited = await run(token, prepared.json.planId, { external_id: "exec-1", plan_hash: prepared.json.planHash });
    expect(limited.status).toBe(429);
    expect(posts).toHaveLength(0);
    await sql.run("DELETE FROM social_publish_plans WHERE id LIKE 'fill-%'");
    await fillPlans(3, "publish_now", true);
    const nowPlan = await plan(token, scheduleBody({ action: "publish_now", timing: undefined }));
    const capped = await run(token, nowPlan.json.planId, { external_id: "exec-2", plan_hash: nowPlan.json.planHash });
    expect(capped.status).toBe(429);
    expect(posts).toHaveLength(0);
  });
});
