import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { HQ_TOOL_HELP } from "./hq-tool-names";
import { HQ_CHAT_PLAYBOOK } from "./hq-chat-playbook";
import { runHqTool } from "./hq-tools";
import { syncSocialAccounts } from "./social";
import type { ObjectStore } from "./store/objects";
import type { ZernioAccount, ZernioClient, ZernioPostInput } from "./zernio";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };

async function database(): Promise<Sql> {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, logo_object_key, sender_name, policy_profile,
       quota_bytes, retention_days, request_digest, status, opened_at
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', NULL, 'Studio', 'standard', 1000, 30, 0, 'active', ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'client', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  const item = (id: string, sort: number, format: string, status: string, contentType = "image/png") =>
    sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, 'd-1', 1, NULL, ?, NULL, ?, 'Caption', ?, NULL, ?, ?)`,
      [id, format, `Piece ${id}`, JSON.stringify([{ r2_key: `${id}-file`, role: "main", content_type: contentType }]), status, sort],
    );
  await item("i-pic", 0, "static", "approved");
  await item("i-vid", 1, "video", "approved", "video/mp4");
  await item("i-open", 2, "static", "pending");
  return sql;
}

function fakeZernio(accounts: ZernioAccount[]) {
  const posts: ZernioPostInput[] = [];
  let connectCalls = 0;
  const zernio: ZernioClient = {
    findProfile: async () => null,
    createProfile: async (input) => ({ _id: "prof-1", name: input.name, externalId: input.externalId }),
    listAccounts: async () => accounts,
    connectUrl: async () => {
      connectCalls += 1;
      return "https://example.com/oauth";
    },
    disconnectAccount: async () => undefined,
    presign: async (filename) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async () => undefined,
    createPost: async (input) => {
      posts.push(input);
      return { _id: `zp-${posts.length}`, status: input.isDraft ? "draft" : input.publishNow ? "publishing" : "scheduled" };
    },
    getPost: async () => ({ _id: "zp-1", status: "published", platforms: [] }),
    reschedulePost: async (postId) => ({ _id: postId, status: "scheduled" }),
    deletePost: async () => undefined,
    listWebhooks: async () => [],
    saveWebhook: async (input) => ({ _id: "wh", name: input.name, url: input.url, events: input.events }),
  };
  return {
    zernio,
    posts,
    connectCalls: () => connectCalls,
  };
}

const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

const ACCOUNTS: ZernioAccount[] = [
  { _id: "ig", platform: "instagram", profileId: "prof-1", username: "acme", displayName: null, isActive: true },
  { _id: "yt", platform: "youtube", profileId: "prof-1", username: "acme", displayName: null, isActive: true },
];

async function withAccounts(sql: Sql, zernio: ZernioClient) {
  await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('wp', 'org-1', 'wordpress', 'blog', 'Blog', 1, ?), ('wix', 'org-1', 'wix', 'site', 'Site', 1, ?)`,
    [NOW, NOW],
  );
}

describe("HQ social plan tools", () => {
  it("keeps schedule_social empty ids as every piece and every connected social account", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const social = { zernio: fake.zernio, store };
    const input = {
      organizationId: "org-1",
      deliverableId: "d-1",
      itemIds: [],
      accountIds: [],
      mode: "scheduled",
      startAt: "2027-03-01T09:00",
      timezone: "UTC",
    };
    const gated = await runHqTool(sql, staff, { tool: "schedule_social", input, idempotencyKey: "legacy-gate" }, NOW, { social });
    expect(gated).toMatchObject({ needsApproval: true });
    expect(fake.posts).toHaveLength(0);
    const done = await runHqTool(
      sql,
      staff,
      { tool: "schedule_social", input, idempotencyKey: "legacy-send", approved: true },
      NOW,
      { social },
    );
    expect(done).toMatchObject({
      ok: true,
      value: { sent: 2, failed: [expect.objectContaining({ title: "Piece i-open" })] },
    });
    const platforms = fake.posts.flatMap((post) => post.platforms.map((target) => target.platform));
    expect(platforms).toEqual(expect.arrayContaining(["instagram", "youtube"]));
    expect(platforms).not.toContain("wordpress");
    expect(platforms).not.toContain("wix");
  });

  it("refuses an empty prepare_social_publish selection and does not post", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const prepared = await runHqTool(
      sql,
      staff,
      {
        tool: "prepare_social_publish",
        input: { organizationId: "org-1", deliverableId: "d-1", itemIds: [], accountIds: ["ig"], mode: "scheduled", startAt: "2027-03-01T09:00", timezone: "UTC" },
        idempotencyKey: "empty-prepare",
      },
      NOW,
      { social: { zernio: fake.zernio, store } },
    );
    expect(prepared).toMatchObject({ ok: true, value: { authorization: "denied", reasonCode: "selection_required" } });
    expect(fake.posts).toHaveLength(0);
  });

  it("prepares the named rows and blocks an unapproved piece without posting", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const prepared = await runHqTool(
      sql,
      staff,
      {
        tool: "prepare_social_publish",
        input: {
          organizationId: "org-1",
          deliverableId: "d-1",
          itemIds: ["i-pic", "i-open"],
          accountIds: ["ig"],
          mode: "scheduled",
          startAt: "2027-03-01T09:00",
          timezone: "UTC",
        },
        idempotencyKey: "exact-prepare",
      },
      NOW,
      { social: { zernio: fake.zernio, store } },
    );
    expect(prepared).toMatchObject({
      ok: true,
      value: {
        authorization: "allowed",
        summary: { executable: 1, blocked: 1 },
        rows: [expect.objectContaining({ itemId: "i-pic", accountId: "ig" })],
        blocked: [expect.objectContaining({ itemId: "i-open", accountId: "ig", reason: "unapproved" })],
      },
    });
    expect(fake.posts).toHaveLength(0);
  });

  it("executes only the prepared rows after the approval card", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const social = { zernio: fake.zernio, store };
    const prepared = await runHqTool(
      sql,
      staff,
      {
        tool: "prepare_social_publish",
        input: {
          organizationId: "org-1",
          itemIds: ["i-pic", "i-open"],
          accountIds: ["ig"],
          mode: "scheduled",
          startAt: "2027-03-01T09:00",
          timezone: "UTC",
        },
        idempotencyKey: "exec-prepare",
      },
      NOW,
      { social },
    );
    const plan = (prepared as { value: { planId: string; planHash: string } }).value;
    const gated = await runHqTool(
      sql,
      staff,
      { tool: "execute_social_plan", input: { organizationId: "org-1", planId: plan.planId, planHash: plan.planHash, externalId: "exec-1" }, idempotencyKey: "exec-gate" },
      NOW,
      { social },
    );
    expect(gated).toMatchObject({ needsApproval: true });
    expect(fake.posts).toHaveLength(0);
    const done = await runHqTool(
      sql,
      staff,
      {
        tool: "execute_social_plan",
        input: { organizationId: "org-1", planId: plan.planId, planHash: plan.planHash, externalId: "exec-1" },
        idempotencyKey: "exec-go",
        approved: true,
      },
      NOW,
      { social },
    );
    expect(done).toMatchObject({
      ok: true,
      value: {
        executed: true,
        outcomes: expect.arrayContaining([
          expect.objectContaining({ itemId: "i-pic", accountId: "ig", outcome: "scheduled" }),
          expect.objectContaining({ itemId: "i-open", accountId: "ig", outcome: "not_attempted", error: "unapproved" }),
        ]),
      },
    });
    expect(fake.posts).toHaveLength(1);
    expect(fake.posts[0]?.platforms.map((target) => target.accountId)).toEqual(["ig"]);
  });

  it("returns an oauth url only after an approved connect plan", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const social = { zernio: fake.zernio, store };
    const prepared = await runHqTool(
      sql,
      staff,
      {
        tool: "prepare_social_connect",
        input: { organizationId: "org-1", platform: "instagram", redirectUrl: "https://studio.example/back" },
        idempotencyKey: "connect-prepare",
      },
      NOW,
      { social },
    );
    expect(prepared).toMatchObject({ ok: true, value: { authorization: "confirmation_required" } });
    expect(fake.connectCalls()).toBe(0);
    const plan = (prepared as { value: { planId: string; planHash: string } }).value;
    const gated = await runHqTool(
      sql,
      staff,
      {
        tool: "execute_social_plan",
        input: { organizationId: "org-1", planId: plan.planId, planHash: plan.planHash, externalId: "connect-1" },
        idempotencyKey: "connect-gate",
      },
      NOW,
      { social },
    );
    expect(gated).toMatchObject({ needsApproval: true });
    expect(fake.connectCalls()).toBe(0);
    const done = await runHqTool(
      sql,
      staff,
      {
        tool: "execute_social_plan",
        input: { organizationId: "org-1", planId: plan.planId, planHash: plan.planHash, externalId: "connect-1" },
        idempotencyKey: "connect-go",
        approved: true,
      },
      NOW,
      { social },
    );
    expect(done).toMatchObject({ ok: true, value: { executed: true, oauthUrl: "https://example.com/oauth" } });
    expect(fake.connectCalls()).toBe(1);
  });

  it("lists wordpress on the old account tool and hides it from the overview", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    const social = { zernio: fake.zernio, store };
    const listed = await runHqTool(sql, staff, { tool: "list_social_accounts", input: { organizationId: "org-1" } }, NOW, { social });
    const platforms = (listed as { value: { platform: string }[] }).value.map((row) => row.platform);
    expect(platforms).toContain("wordpress");
    const overview = await runHqTool(sql, staff, { tool: "social_overview", input: { organizationId: "org-1" } }, NOW, { social });
    const health = (overview as { value: { accountHealth: { platform: string }[] } }).value.accountHealth.map((row) => row.platform);
    expect(health).toEqual(expect.arrayContaining(["instagram", "youtube"]));
    expect(health).not.toContain("wordpress");
    expect(health).not.toContain("wix");
  });

  it("explains a partial post without copying the provider error", async () => {
    const sql = await database();
    const fake = fakeZernio(ACCOUNTS);
    await withAccounts(sql, fake.zernio);
    await sql.run(
      `INSERT INTO social_posts (
         id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, skipped, scheduled_for,
         timezone, status, zernio_post_id, error, created_by, created_at, updated_at
       ) VALUES ('post-part', 'org-1', 'd-1', 'i-pic', 1, '["ig","yt"]', 'now', 'feed', '[]', NULL, 'UTC', 'partial', 'zp-part', 'Token expired', 'staff-1', ?, ?)`,
      [NOW, NOW],
    );
    await sql.run(
      `INSERT INTO social_post_targets (id, post_id, organization_id, account_id, platform, outcome, public_url, provider_status, error, updated_at)
       VALUES ('t-ok', 'post-part', 'org-1', 'ig', 'instagram', 'succeeded', 'https://instagram.com/p/1', 'published', NULL, ?),
              ('t-bad', 'post-part', 'org-1', 'yt', 'youtube', 'failed', NULL, 'failed', 'Token expired', ?)`,
      [NOW, NOW],
    );
    const overview = await runHqTool(
      sql,
      staff,
      { tool: "social_overview", input: { organizationId: "org-1" } },
      NOW,
      { social: { zernio: fake.zernio, store } },
    );
    const value = (overview as { value: { partialPosts: { status: string; targets: { outcome: string }[] }[]; partialExplanation: string } }).value;
    expect(value.partialPosts[0]).toMatchObject({
      status: "partial",
      targets: expect.arrayContaining([
        expect.objectContaining({ outcome: "succeeded" }),
        expect.objectContaining({ outcome: "failed" }),
      ]),
    });
    expect(value.partialExplanation).toMatch(/not a full success/i);
    expect(JSON.stringify(value)).not.toContain("Token expired");
  });

  it("reports feature_disabled for save_social_variant when agent actions are off", async () => {
    const previous = process.env.SOCIAL_AGENT_ACTIONS;
    delete process.env.SOCIAL_AGENT_ACTIONS;
    try {
      const sql = await database();
      const fake = fakeZernio(ACCOUNTS);
      const saved = await runHqTool(
        sql,
        staff,
        {
          tool: "save_social_variant",
          input: { organizationId: "org-1", itemId: "i-pic", version: 1, platform: "instagram", caption: "Reel caption", expectedRevision: 0 },
          idempotencyKey: "variant-off",
        },
        NOW,
        { social: { zernio: fake.zernio, store } },
      );
      expect(saved).toMatchObject({ ok: true, value: { saved: false, reasonCode: "feature_disabled" } });
    } finally {
      if (previous == null) delete process.env.SOCIAL_AGENT_ACTIONS;
      else process.env.SOCIAL_AGENT_ACTIONS = previous;
    }
  });

  it("keeps the legacy schedule description and tells chat that empty lists are not every piece", () => {
    expect(HQ_TOOL_HELP.schedule_social.description).toContain("Empty itemIds means every piece");
    expect(HQ_TOOL_HELP.schedule_social.description).toContain("empty accountIds means every connected social account");
    expect(HQ_CHAT_PLAYBOOK).toContain("stage won");
    expect(HQ_CHAT_PLAYBOOK).toContain("file_actions");
    expect(HQ_CHAT_PLAYBOOK).toContain("execute_social_plan");
    expect(HQ_CHAT_PLAYBOOK).toContain("An empty list is not every piece");
    expect(HQ_CHAT_PLAYBOOK).toContain("schedule_social still sends every piece");
    expect(HQ_CHAT_PLAYBOOK).toContain("Do not call a partial post a full success");
  });
});
