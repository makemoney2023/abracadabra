import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { SocialActor } from "./social-policy";
import { prepareCommandPlan } from "./social-plans";
import { executeSocialPlan } from "./social-commands";
import { recordOutcome, syncPostTargets } from "./social";
import { applyZernioEvent } from "./social-webhook";
import type { ObjectStore } from "./store/objects";
import type { ZernioClient, ZernioPostInput } from "./zernio";
import {
  assessSocialRetry,
  noteDisconnectedAccount,
  notePreflightAttention,
  listOpenSocialAttention,
  raiseSocialAttention,
  recoverSocialAttention,
} from "./social-attention";

const NOW = 1_800_000_000_000;
const staff: SocialActor = { kind: "staff", id: "staff-1" };
const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

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
    `INSERT INTO deliverables (
       id, organization_id, project_id, workspace_id, title, kind, status, version, published_version,
       actor_kind, actor_id, created_at, updated_at
     ) VALUES ('d-1', 'org-1', NULL, 'ws-1', 'October social', 'social_pack', 'in_review', 1, 1, 'staff', 'staff-1', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('i-pic', 'd-1', 1, NULL, 'static', NULL, 'Piece i-pic', 'Caption', ?, NULL, 'approved', 0)`,
    [JSON.stringify([{ r2_key: "i-pic-file", role: "main", content_type: "image/png" }])],
  );
  await sql.run(
    `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
     VALUES ('ig', 'org-1', 'instagram', 'acme', NULL, 1, ?)`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO social_profiles (organization_id, zernio_profile_id, created_at) VALUES ('org-1', 'prof-1', ?)`,
    [NOW],
  );
  return sql;
}

async function post(sql: Sql, id: string, status: string, zernioId: string | null): Promise<void> {
  await sql.run(
    `INSERT INTO social_posts (
       id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, status,
       zernio_post_id, error, created_at, updated_at
     ) VALUES (?, 'org-1', 'd-1', 'i-pic', 1, '["ig"]', 'now', 'feed', ?, ?, NULL, ?, ?)`,
    [id, status, zernioId, NOW, NOW],
  );
}

function fakeZernio(): { zernio: ZernioClient; posts: ZernioPostInput[] } {
  const posts: ZernioPostInput[] = [];
  const zernio = {
    findProfile: async () => ({ _id: "prof-1", name: "Acme", externalId: "org-1" }),
    createProfile: async () => ({ _id: "prof-1", name: "Acme", externalId: "org-1" }),
    listAccounts: async () => [],
    connectUrl: async () => "https://example.com/oauth",
    disconnectAccount: async () => undefined,
    presign: async (filename: string) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async () => undefined,
    createPost: async (input: ZernioPostInput) => {
      posts.push(input);
      return { _id: "zp-retry", status: "publishing" };
    },
    getPost: async () => ({ _id: "zp-1", status: "published", platforms: [] }),
    reschedulePost: async (postId: string) => ({ _id: postId, status: "scheduled" }),
    deletePost: async () => undefined,
    listWebhooks: async () => [],
    saveWebhook: async (input: { name: string; url: string; events: string[] }) => ({ _id: "wh", ...input }),
  } as ZernioClient;
  return { zernio, posts };
}

describe("social attention", () => {
  it("dedupes one issue per source and keeps provider text out of the record", async () => {
    const sql = await database();
    const first = await noteDisconnectedAccount(sql, "ig", NOW);
    const second = await noteDisconnectedAccount(sql, "ig", NOW + 1);
    expect(second.id).toBe(first.id);
    expect(await sql.get("SELECT COUNT(*) AS n FROM social_attention_items")).toEqual({ n: 1 });

    await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-1",
      target: "ig",
      kind: "rejected_target",
      now: NOW,
      detail: { outcome: "failed", platform: "instagram", error: "Token expired sk_secret" },
    });
    const stored = await sql.get<{ detail_json: string; recovery_action: string | null }>(
      "SELECT detail_json, recovery_action FROM social_attention_items WHERE source_id = 'post-1'",
    );
    expect(stored?.recovery_action).toBeNull();
    expect(stored?.detail_json ?? "").not.toMatch(/Token|sk_|secret|http/i);
    expect(JSON.parse(stored?.detail_json ?? "{}")).toEqual({ outcome: "failed", platform: "instagram" });
  });

  it("lists only open attention and reads the platform from the stored detail", async () => {
    const sql = await database();
    const open = await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-open",
      target: "ig",
      kind: "upload_failure",
      now: NOW,
      detail: { platform: "instagram", reason: "upload" },
    });
    const closed = await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-closed",
      target: "yt",
      kind: "rejected_target",
      now: NOW + 1,
      detail: { platform: "youtube" },
    });
    await sql.run("UPDATE social_attention_items SET status = 'resolved' WHERE id = ?", [closed.id]);
    await sql.run(
      `INSERT INTO organizations (id, name, kind, created_at, updated_at) VALUES ('org-other', 'Other', 'client', ?, ?)`,
      [NOW, NOW],
    );
    await raiseSocialAttention(sql, {
      organizationId: "org-other",
      sourceKind: "account",
      sourceId: "other",
      kind: "disconnected_account",
      now: NOW,
      detail: { platform: "tiktok" },
    });
    expect(await listOpenSocialAttention(sql, "org-1")).toEqual([
      { id: open.id, kind: "upload_failure", platform: "instagram" },
    ]);
  });

  it("lets webhook and cron settle the same target, then resolves attention only on a final success", async () => {
    const sql = await database();
    await post(sql, "post-1", "sending", "zp-1");
    await syncPostTargets(sql, "post-1", "org-1", [{ accountId: "ig", platform: "instagram" }], "uncertain", NOW);
    const opened = await sql.get<{ id: string; kind: string; status: string }>(
      "SELECT id, kind, status FROM social_attention_items",
    );
    expect(opened).toMatchObject({ kind: "uncertain_outcome", status: "open" });
    const targetId = (await sql.get<{ id: string }>("SELECT id FROM social_post_targets WHERE post_id = 'post-1' AND account_id = 'ig'"))?.id;

    expect(
      await applyZernioEvent(
        sql,
        {
          id: "evt-1",
          event: "post.partial",
          post: {
            id: "zp-1",
            status: "partial",
            platforms: [{ platform: "instagram", status: "failed", accountId: "ig", error: "Token expired" }],
          },
        },
        NOW + 1,
        null,
      ),
    ).toBe("updated");
    const afterWebhook = await sql.get<{ id: string; outcome: string }>(
      "SELECT id, outcome FROM social_post_targets WHERE post_id = 'post-1' AND account_id = 'ig'",
    );
    expect(afterWebhook).toEqual({ id: targetId, outcome: "failed" });
    expect(await sql.get<{ kind: string; status: string }>("SELECT kind, status FROM social_attention_items WHERE source_id = 'post-1'")).toMatchObject({
      kind: "rejected_target",
      status: "open",
    });

    await recordOutcome(sql, "post-1", { status: "published", error: null, urls: { ig: "https://instagram.com/p/abc" } }, NOW + 2);
    const afterCron = await sql.get<{ id: string; outcome: string }>(
      "SELECT id, outcome FROM social_post_targets WHERE post_id = 'post-1' AND account_id = 'ig'",
    );
    expect(afterCron).toEqual({ id: targetId, outcome: "succeeded" });
    expect(await sql.get<{ status: string }>("SELECT status FROM social_attention_items WHERE source_id = 'post-1'")).toEqual({ status: "resolved" });
    const activity = await sql.get<{ kind: string; data_json: string }>(
      "SELECT kind, data_json FROM activities WHERE kind = 'social.attention.resolved'",
    );
    expect(activity?.kind).toBe("social.attention.resolved");
    expect(activity?.data_json ?? "").not.toMatch(/Token|sk_|instagram.com/);
  });

  it("keeps an uncertain issue open until a definite outcome and refuses a second live post", async () => {
    const sql = await database();
    await post(sql, "post-uncertain", "sending", null);
    await syncPostTargets(sql, "post-uncertain", "org-1", [{ accountId: "ig", platform: "instagram" }], "uncertain", NOW);
    await syncPostTargets(sql, "post-uncertain", "org-1", [{ accountId: "ig", platform: "instagram" }], "publishing", NOW + 1);
    expect(await sql.get<{ status: string }>("SELECT status FROM social_attention_items WHERE source_id = 'post-uncertain'")).toEqual({
      status: "open",
    });

    await post(sql, "post-live", "published", "zp-live");
    const live = await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-live",
      target: "ig",
      kind: "upload_failure",
      now: NOW,
    });
    expect(await assessSocialRetry(sql, "org-1", live.id)).toMatchObject({ recoverable: false, reason: "live_post" });
    const { zernio, posts } = fakeZernio();
    const recovered = await recoverSocialAttention(sql, zernio, store, staff, "org-1", live.id, NOW);
    expect(recovered).toMatchObject({ outcome: "not_attempted", error: "live_post" });
    expect(posts).toEqual([]);
    expect(await sql.get("SELECT COUNT(*) AS n FROM social_posts")).toEqual({ n: 2 });

    await sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES ('i-upload', 'd-1', 1, NULL, 'static', NULL, 'Piece i-upload', 'Caption', ?, NULL, 'approved', 1)`,
      [JSON.stringify([{ r2_key: "i-upload-file", role: "main", content_type: "image/png" }])],
    );
    await post(sql, "post-upload", "failed", null);
    await sql.run("UPDATE social_posts SET item_id = 'i-upload' WHERE id = 'post-upload'");
    const upload = await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-upload",
      target: "ig",
      kind: "upload_failure",
      now: NOW,
    });
    expect(await assessSocialRetry(sql, "org-1", upload.id)).toMatchObject({ recoverable: true, postId: "post-upload" });
    const sent = await recoverSocialAttention(sql, zernio, store, staff, "org-1", upload.id, NOW);
    expect(sent.outcome).toBe("scheduled");
    expect(posts).toHaveLength(1);
    expect(await sql.get<{ status: string }>("SELECT status FROM social_attention_items WHERE id = ?", [upload.id])).toEqual({
      status: "resolved",
    });
    const again = await recoverSocialAttention(sql, zernio, store, staff, "org-1", upload.id, NOW + 5);
    expect(again).toMatchObject({ outcome: "not_attempted", error: "not_recoverable" });
    expect(posts).toHaveLength(1);

    await sql.run("UPDATE deliverable_items SET version = 2 WHERE id = 'i-pic'");
    await post(sql, "post-stale", "failed", null);
    await sql.run("UPDATE social_posts SET version = 1 WHERE id = 'post-stale'");
    const stale = await raiseSocialAttention(sql, {
      organizationId: "org-1",
      sourceKind: "post",
      sourceId: "post-stale",
      target: "ig",
      kind: "upload_failure",
      now: NOW,
    });
    expect(await assessSocialRetry(sql, "org-1", stale.id)).toMatchObject({ recoverable: false, reason: "stale_plan" });
  });

  it("opens missing-requirement and disconnected issues, and a rejected provider post is not retried", async () => {
    const sql = await database();
    await notePreflightAttention(
      sql,
      "org-1",
      [
        { itemId: "i-pic", accountId: "ig", reason: "missing_title" },
        { itemId: "i-pic", accountId: "ig", reason: "unapproved" },
        { itemId: "i-pic", accountId: "ig", reason: "disconnected" },
      ],
      NOW,
    );
    const kinds = await sql.all<{ kind: string }>("SELECT kind FROM social_attention_items ORDER BY kind");
    expect(kinds.map((row) => row.kind)).toEqual(["disconnected_account", "missing_requirement"]);

    await post(sql, "post-rejected", "failed", "zp-rejected");
    await syncPostTargets(sql, "post-rejected", "org-1", [{ accountId: "ig", platform: "instagram" }], "failed", NOW);
    const rejected = await sql.get<{ id: string; kind: string }>(
      "SELECT id, kind FROM social_attention_items WHERE source_id = 'post-rejected'",
    );
    expect(rejected?.kind).toBe("rejected_target");
    expect(await assessSocialRetry(sql, "org-1", rejected?.id ?? "")).toMatchObject({ recoverable: false, reason: "not_recoverable" });

    const prepared = await prepareCommandPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      action: "retry",
      now: NOW,
      attentionId: rejected?.id,
    });
    const { zernio, posts } = fakeZernio();
    const executed = await executeSocialPlan(sql, {
      organizationId: "org-1",
      actor: staff,
      planId: prepared.planId,
      planHash: prepared.planHash,
      externalId: "retry-1",
      now: NOW,
      zernio,
      store,
    });
    expect(executed.outcomes).toEqual([
      expect.objectContaining({ outcome: "not_attempted", error: "not_recoverable", postId: "post-rejected" }),
    ]);
    expect(posts).toEqual([]);
  });
});
