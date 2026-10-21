import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getAccounts } from "@/app/api/agent-social/accounts/route";
import { GET as getAttention } from "@/app/api/agent-social/attention/route";
import { POST as postCadencePlan } from "@/app/api/agent-social/cadence-plan/route";
import { GET as getCadence } from "@/app/api/agent-social/cadence/route";
import { POST as postConnectPlan } from "@/app/api/agent-social/connect-plan/route";
import { POST as postDisconnectPlan } from "@/app/api/agent-social/disconnect-plan/route";
import { GET as getOverview } from "@/app/api/agent-social/overview/route";
import { GET as getPieces } from "@/app/api/agent-social/pieces/route";
import { PATCH as patchVariant } from "@/app/api/agent-social/pieces/[itemId]/variants/route";
import { POST as postExecute } from "@/app/api/agent-social/plans/[planId]/execute/route";
import { GET as getPlan } from "@/app/api/agent-social/plans/[planId]/route";
import { POST as postPlans } from "@/app/api/agent-social/plans/route";
import { GET as getPosts } from "@/app/api/agent-social/posts/route";
import { migrate } from "@/db/migrate";
import { d1Sql, type D1Like, type Sql } from "@/db/sql";
import { agentForToken, registerClientAgent } from "@/lib/agent-work-filing";
import { issueConfirmation } from "@/lib/social-commands";
import { agentActor } from "@/lib/social-actor";
import { setSocialRuntimeForTests } from "@/lib/social-runtime";
import type { ZernioClient } from "@/lib/zernio";

const NOW = 1_800_000_000_000;
const CTX = Symbol.for("__cloudflare-context__");
const BASE = "https://hq.example.test/api/agent-social";

let sql: Sql;
let d1: D1Like;

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
  (globalThis as Record<symbol, unknown>)[CTX] = { env: { DB: d1 } };
  process.env.AGENT_MODE = "agents";
  delete process.env.SOCIAL_AGENT_ACTIONS;
});

afterEach(() => {
  delete (globalThis as Record<symbol, unknown>)[CTX];
  delete process.env.AGENT_MODE;
  delete process.env.SOCIAL_AGENT_ACTIONS;
  setSocialRuntimeForTests(null);
});

async function org(id: string, name: string, domain: string) {
  await sql.run(
    "INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES (?, ?, ?, 'client', ?, ?)",
    [id, name, domain, NOW, NOW],
  );
}

async function workspace(id: string, slug: string, organizationId: string) {
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES (?, ?, ?, ?, NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?, ?)`,
    [id, slug, slug, slug, NOW, organizationId],
  );
}

async function agent(organizationId: string, agentId: string, role: "lead" | "hire", workspaceId: string) {
  const made = await registerClientAgent(sql, {
    agentId,
    label: agentId,
    organizationId,
    workspaceId,
    role,
    actor: "test",
    now: NOW,
  });
  if (!made.ok || !made.token) throw new Error(made.ok ? "missing token" : made.message);
  if (!(await agentForToken(sql, `Bearer ${made.token}`))) throw new Error("token failed");
  return made.token;
}

async function seed() {
  await org("org-1", "Acme", "acme.example");
  await org("org-2", "Other", "other.example");
  await workspace("ws-1", "acme", "org-1");
  await workspace("ws-2", "other", "org-2");
  const lead = await agent("org-1", "acme-lead", "lead", "ws-1");
  const hire = await agent("org-1", "acme-writer", "hire", "ws-1");
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('i-ready', 'd-1', 1, NULL, 'static', NULL, 'Ready', 'Caption', ?, NULL, 'approved', 0)`,
    [JSON.stringify([{ r2_key: "ready-pic", role: "main", content_type: "image/png" }])],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', 'Acme', 1, ?),
            ('pin', 'org-1', 'pinterest', 'pins', 'Pins', 1, ?),
            ('blog', 'org-1', 'wordpress', 'blog', 'Blog', 1, ?)`,
    [NOW, NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status,
       zernio_post_id, error, scheduled_for, created_at, updated_at
     ) VALUES
       ('post-1', 'org-1', 'd-1', 'i-ready', 1, '["ig"]', 'scheduled', 'feed', 'scheduled', 'zp-secret', ?, ?, ?, ?),
       ('post-2', 'org-1', 'd-1', 'i-ready', 1, '["ig"]', 'scheduled', 'feed', 'scheduled', 'zp-secret-2', ?, ?, ?, ?)`,
    [
      JSON.stringify({ access_token: "tok", provider: "raw" }),
      NOW + 86_400_000,
      NOW,
      NOW,
      JSON.stringify({ access_token: "tok-2" }),
      NOW + 2 * 86_400_000,
      NOW,
      NOW,
    ],
  );
  await sql.run(
    `INSERT INTO social_attention_items (
       id, organization_id, source_kind, source_id, target, kind, status, recovery_action, detail_json, created_at, updated_at
     ) VALUES ('att-1', 'org-1', 'post', 'post-1', 'ig', 'rejected_target', 'open', 'retry', ?, ?, ?)`,
    [JSON.stringify({ r2_key: "secret-object", access_token: "tok", sk_: "sk_secret" }), NOW, NOW],
  );
  await sql.run(
    `INSERT INTO social_publish_plans (
       id, organization_id, actor_kind, actor_id, action, request_json, rows_json, blocked_json, warnings_json,
       plan_hash, authorization, expires_at, created_at
     ) VALUES
       ('plan-1', 'org-1', 'agent', 'acme-lead', 'schedule', '{}', '[]', '[]', '[]', 'hash-1', 'allowed', ?, ?),
       ('plan-other', 'org-2', 'agent', 'other', 'schedule', '{}', '[]', '[]', '[]', 'hash-2', 'allowed', ?, ?)`,
    [NOW + 60_000, NOW, NOW + 60_000, NOW],
  );
  return { lead, hire };
}

function request(path: string, token: string | null) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`${BASE}${path}`, { headers });
}

function write(path: string, token: string | null, body: unknown, method = "POST") {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request(`${BASE}${path}`, { method, headers, body: JSON.stringify(body) });
}

function enableWrites() {
  process.env.SOCIAL_AGENT_ACTIONS = "on";
}

async function freshPiece() {
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('i-fresh', 'd-1', 1, NULL, 'static', NULL, 'Fresh', 'Caption', ?, NULL, 'approved', 2)`,
    [JSON.stringify([{ r2_key: "fresh-pic", role: "main", content_type: "image/png" }])],
  );
}

describe("GET /api/agent-social reads", () => {
  it("rejects a missing token and an invalid token", async () => {
    expect((await getOverview(request("/overview", null))).status).toBe(401);
    expect((await getOverview(request("/overview", "not-a-token"))).status).toBe(401);
    const body = (await (await getOverview(request("/overview", null))).json()) as { error: string };
    expect(body.error).toBe("Unauthorized.");
  });

  it("lets a lead and a hire read overview, pieces, and cadence without secrets", async () => {
    const { lead, hire } = await seed();
    for (const token of [lead, hire]) {
      const overview = await getOverview(request("/overview?client=acme.example", token));
      expect(overview.status).toBe(200);
      const body = (await overview.json()) as {
        policy: { mode: string; authorization: string; capabilities: string[] };
        accountHealth: { id: string }[];
        readyCount: number;
        scheduledCount: number;
        attentionCount: number;
        nextSlots: unknown[];
      };
      expect(body.policy.authorization).toBe("allowed");
      expect(body.policy.capabilities).toContain("social.read");
      expect(body.readyCount).toBe(0);
      expect(body.scheduledCount).toBe(2);
      expect(body.attentionCount).toBe(1);
      expect(body.nextSlots.length).toBeGreaterThan(0);
      expect(body.accountHealth.map((row) => row.id)).toEqual(["ig"]);
      expect(JSON.stringify(body)).not.toMatch(/r2_key|access_token|sk_|zp-secret|pinterest|wordpress/);
    }
    const hireOverview = await getOverview(request("/overview?client=acme.example", hire));
    const hireBody = (await hireOverview.json()) as { policy: { capabilities: string[] } };
    expect(hireBody.policy.capabilities).not.toContain("social.cadence.manage");

    const pieces = await getPieces(request("/pieces?client=acme.example&state=scheduled", lead));
    expect(pieces.status).toBe(200);
    const pieceBody = (await pieces.json()) as { pieces: { itemId: string; media: { keys: string[] } }[] };
    expect(pieceBody.pieces[0]?.itemId).toBe("i-ready");
    expect(pieceBody.pieces[0]?.media.keys).toEqual(["ready-pic"]);
    expect(JSON.stringify(pieceBody)).not.toMatch(/r2_key|access_token|sk_|zp-secret/);

    const accounts = await getAccounts(request("/accounts?client=acme.example", lead));
    const accountBody = (await accounts.json()) as { accounts: { id: string }[] };
    expect(accountBody.accounts.map((row) => row.id)).toEqual(["ig"]);

    const attention = await getAttention(request("/attention?client=acme.example", lead));
    const attentionBody = (await attention.json()) as { items: { id: string }[] };
    expect(attentionBody.items.map((row) => row.id)).toEqual(["att-1"]);
    expect(JSON.stringify(attentionBody)).not.toMatch(/r2_key|access_token|sk_secret/);

    const cadence = await getCadence(request("/cadence?client=acme.example", lead));
    expect(cadence.status).toBe(200);
    const cadenceBody = (await cadence.json()) as { nextSlots: unknown[] };
    expect(cadenceBody.nextSlots.length).toBeGreaterThan(0);
  });

  it("refuses an unassigned client and hides another client's plan", async () => {
    const { lead } = await seed();
    const unassigned = await getOverview(request("/overview?client=other.example", lead));
    expect(unassigned.status).toBe(403);
    expect(await unassigned.json()).toMatchObject({ reasonCode: "not_assigned" });

    const foreign = await getPlan(request("/plans/plan-other", lead), { params: Promise.resolve({ planId: "plan-other" }) });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toMatchObject({ reasonCode: "not_found" });

    const own = await getPlan(request("/plans/plan-1", lead), { params: Promise.resolve({ planId: "plan-1" }) });
    expect(own.status).toBe(200);
    expect(await own.json()).toMatchObject({ planId: "plan-1", authorization: "allowed" });
  });

  it("paginates posts and filters by date", async () => {
    const { lead } = await seed();
    const page = await getPosts(request(`/posts?client=acme.example&status=scheduled&limit=1&offset=0&from=${NOW + 1_000}`, lead));
    expect(page.status).toBe(200);
    const body = (await page.json()) as { posts: { id: string }[]; nextOffset: number | null };
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0]?.id).toBe("post-2");
    expect(body.nextOffset).toBe(1);
    expect(JSON.stringify(body)).not.toMatch(/r2_key|access_token|sk_|zp-secret|provider/);

    const later = await getPosts(request(`/posts?client=acme.example&from=${NOW + 3 * 86_400_000}`, lead));
    const empty = (await later.json()) as { posts: unknown[]; nextOffset: number | null };
    expect(empty.posts).toEqual([]);
    expect(empty.nextOffset).toBeNull();

    const bad = await getPosts(request("/posts?client=acme.example&from=not-a-time", lead));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ reasonCode: "invalid_range" });
  });

  it("keeps reads available when agent writes are off", async () => {
    const { lead } = await seed();
    process.env.SOCIAL_AGENT_ACTIONS = "false";
    const overview = await getOverview(request("/overview?client=acme.example", lead));
    expect(overview.status).toBe(200);
  });
});

describe("POST /api/agent-social plans", () => {
  it("requires an external id and never treats an empty selection as every piece", async () => {
    const { lead } = await seed();
    enableWrites();
    const missing = await postPlans(write("/plans", lead, { client: "acme.example", action: "schedule", selection: { mode: "explicit", item_ids: ["i-ready"], account_ids: ["ig"] } }));
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ reasonCode: "external_id_required" });

    const empty = await postPlans(
      write("/plans", lead, {
        client: "acme.example",
        external_id: "empty-1",
        action: "schedule",
        selection: { mode: "eligible", item_ids: [], account_ids: [] },
        timing: { mode: "scheduled", start_at: Date.now() + 3_600_000, gap_minutes: 60 },
      }),
    );
    expect(empty.status).toBe(403);
    const body = (await empty.json()) as { reasonCode: string; rows: unknown[]; blocked: unknown[] };
    expect(body.reasonCode).toBe("selection_required");
    expect(body.rows).toEqual([]);
    expect(body.blocked).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/i-ready/);
    const posts = await sql.all<{ id: string }>("SELECT id FROM social_posts WHERE organization_id = 'org-1'");
    expect(posts.map((row) => row.id).sort()).toEqual(["post-1", "post-2"]);
  });

  it("denies a draft-mode schedule, and post-now without a confirmation", async () => {
    const { lead } = await seed();
    enableWrites();
    await freshPiece();
    const scheduled = await postPlans(
      write("/plans", lead, {
        client: "acme.example",
        external_id: "sched-1",
        action: "schedule",
        selection: { mode: "explicit", item_ids: ["i-fresh"], account_ids: ["ig"] },
        timing: { mode: "scheduled", start_at: Date.now() + 3_600_000, gap_minutes: 60 },
      }),
    );
    expect(scheduled.status).toBe(403);
    expect(await scheduled.json()).toMatchObject({ reasonCode: "policy_draft" });

    const nowPlan = await postPlans(
      write("/plans", lead, {
        client: "acme.example",
        external_id: "now-1",
        action: "publish_now",
        selection: { mode: "explicit", item_ids: ["i-fresh"], account_ids: ["ig"] },
        timing: { mode: "now" },
      }),
    );
    expect(nowPlan.status).toBe(200);
    const prepared = (await nowPlan.json()) as { planId: string; planHash: string; authorization: string; expiresAt: string; rows: { itemId: string }[] };
    expect(prepared.authorization).toBe("confirmation_required");
    expect(prepared.rows.map((row) => row.itemId)).toEqual(["i-fresh"]);
    expect(prepared.expiresAt).toMatch(/^\d{4}-/);
    const executed = await postExecute(write(`/plans/${prepared.planId}/execute`, lead, { external_id: "now-exec", plan_hash: prepared.planHash }), {
      params: Promise.resolve({ planId: prepared.planId }),
    });
    expect(executed.status).toBe(403);
    expect(await executed.json()).toMatchObject({ reasonCode: "confirmation_required" });
    const posts = await sql.all<{ id: string }>("SELECT id FROM social_posts");
    expect(posts).toHaveLength(2);
  });

  it("returns a human connect link only after confirmation, and keeps disconnect locked", async () => {
    const { lead, hire } = await seed();
    enableWrites();
    const cadence = await postCadencePlan(
      write(
        "/cadence-plan",
        hire,
        { client: "acme.example", external_id: "cad-1", enabled: true, account_ids: ["ig"], weekdays: [1], times: ["09:00"], timezone: "UTC" },
        "PUT",
      ),
    );
    expect(cadence.status).toBe(403);
    expect(await cadence.json()).toMatchObject({ reasonCode: "role_denied" });

    let connects = 0;
    const zernio = {
      findProfile: async () => null,
      createProfile: async () => ({ _id: "prof-1", name: "Acme", externalId: "org-1" }),
      listAccounts: async () => [],
      connectUrl: async (platform: string) => {
        connects += 1;
        return `https://connect.example/oauth?platform=${platform}`;
      },
      disconnectAccount: async () => undefined,
      presign: async () => ({ uploadUrl: "https://up/x", publicUrl: "https://media/x" }),
      upload: async () => undefined,
      createPost: async () => ({ _id: "zp-new", status: "scheduled" }),
      getPost: async () => ({ _id: "zp-new", status: "scheduled" }),
      reschedulePost: async (postId: string) => ({ _id: postId, status: "scheduled" }),
      deletePost: async () => undefined,
      listWebhooks: async () => [],
      saveWebhook: async () => ({ _id: "wh", name: "n", url: "https://example.test/hook", events: [] }),
    } as ZernioClient;
    setSocialRuntimeForTests({ zernio });

    const connect = await postConnectPlan(
      write("/connect-plan", lead, {
        client: "acme.example",
        external_id: "conn-1",
        platform: "instagram",
        redirect_url: "https://hq.example.test/done",
      }),
    );
    expect(connect.status).toBe(200);
    const prepared = (await connect.json()) as { planId: string; planHash: string; authorization: string };
    expect(prepared.authorization).toBe("confirmation_required");
    const blocked = await postExecute(
      write(`/plans/${prepared.planId}/execute`, lead, { external_id: "conn-exec", plan_hash: prepared.planHash }),
      { params: Promise.resolve({ planId: prepared.planId }) },
    );
    expect(blocked.status).toBe(403);
    expect(connects).toBe(0);

    const confirmation = await issueConfirmation(sql, {
      planId: prepared.planId,
      planHash: prepared.planHash,
      actor: agentActor({
        agentId: "acme-lead",
        assignment: { organizationId: "org-1", workspaceId: "ws-1", projectId: null, role: "lead" },
      }),
      now: Date.now(),
    });
    const opened = await postExecute(
      write(`/plans/${prepared.planId}/execute`, lead, {
        external_id: "conn-exec",
        plan_hash: prepared.planHash,
        confirmation_token: confirmation.id,
      }),
      { params: Promise.resolve({ planId: prepared.planId }) },
    );
    expect(opened.status).toBe(200);
    const openedBody = (await opened.json()) as { oauthUrl: string; duplicate: boolean };
    expect(openedBody.oauthUrl).toBe("https://connect.example/oauth?platform=instagram");
    expect(openedBody.duplicate).toBe(false);
    expect(JSON.stringify(openedBody)).not.toMatch(/sk_|access_token/);
    expect(connects).toBe(1);

    const disconnect = await postDisconnectPlan(
      write("/disconnect-plan", lead, { client: "acme.example", external_id: "disc-1", account_id: "ig" }),
    );
    expect(disconnect.status).toBe(200);
    const drop = (await disconnect.json()) as { planId: string; planHash: string; authorization: string };
    expect(drop.authorization).toBe("confirmation_required");
    const refused = await postExecute(
      write(`/plans/${drop.planId}/execute`, lead, { external_id: "disc-exec", plan_hash: drop.planHash }),
      { params: Promise.resolve({ planId: drop.planId }) },
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ reasonCode: "confirmation_required" });
    const account = await sql.get<{ id: string }>("SELECT id FROM social_accounts WHERE id = 'ig'");
    expect(account?.id).toBe("ig");
  });

  it("hides another client's plan and keeps writes off when the flag is off", async () => {
    const { lead } = await seed();
    enableWrites();
    const foreign = await postExecute(write("/plans/plan-other/execute", lead, { external_id: "x", plan_hash: "hash-2" }), {
      params: Promise.resolve({ planId: "plan-other" }),
    });
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toMatchObject({ reasonCode: "not_found" });

    process.env.SOCIAL_AGENT_ACTIONS = "false";
    const denied = await postPlans(
      write("/plans", lead, {
        client: "acme.example",
        external_id: "off-1",
        action: "schedule",
        selection: { mode: "explicit", item_ids: ["i-ready"], account_ids: ["ig"] },
      }),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ reasonCode: "feature_disabled" });
    const overview = await getOverview(request("/overview?client=acme.example", lead));
    expect(overview.status).toBe(200);
  });

  it("saves a platform variant without publishing and replays the same external id", async () => {
    const { hire } = await seed();
    enableWrites();
    await freshPiece();
    const body = {
      client: "acme.example",
      external_id: "var-1",
      platform: "instagram",
      version: 1,
      caption: "Fresh caption",
      post_type: "feed",
      expected_revision: 0,
      options: {},
    };
    const saved = await patchVariant(write("/pieces/i-fresh/variants", hire, body, "PATCH"), {
      params: Promise.resolve({ itemId: "i-fresh" }),
    });
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as { duplicate: boolean; variant: { caption: string; revision: number; platform: string } };
    expect(savedBody.duplicate).toBe(false);
    expect(savedBody.variant).toMatchObject({ caption: "Fresh caption", revision: 1, platform: "instagram" });
    const activity = await sql.get<{ data_json: string }>("SELECT data_json FROM activities WHERE kind = 'social.variant.updated'");
    expect(activity?.data_json ?? "").not.toContain("Fresh caption");
    const posts = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM social_posts WHERE item_id = 'i-fresh'");
    expect(posts?.n).toBe(0);

    const again = await patchVariant(write("/pieces/i-fresh/variants", hire, body, "PATCH"), {
      params: Promise.resolve({ itemId: "i-fresh" }),
    });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ duplicate: true, variant: { caption: "Fresh caption", revision: 1 } });
    const rows = await sql.get<{ n: number }>("SELECT COUNT(*) AS n FROM social_variants WHERE item_id = 'i-fresh'");
    expect(rows?.n).toBe(1);
  });
});
