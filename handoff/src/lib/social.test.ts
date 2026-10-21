import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import { runHqTool } from "./hq-tools";
import {
  cancelSocialPost,
  listSocialPosts,
  refreshDueSocialPosts,
  refreshSocialPosts,
  rescheduleSocialPost,
  savePieceSettings,
  sendPiece,
  sendPieces,
  syncSocialAccounts,
  zonedTimeToUtc,
} from "./social";
import { signIntakeBody } from "./intake/sign";
import { DEFAULT_AUTOPOST, autoScheduleApproved, getAutopost, nextSlots, parseTimes, saveAutopost } from "./social-autopost";
import { applyZernioEvent, verifyZernioSignature } from "./social-webhook";
import type { ObjectStore } from "./store/objects";
import type { ZernioAccount, ZernioClient, ZernioPostInput } from "./zernio";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: false }, operatorOf: [], memberships: [] };
const client: Caller = { userId: "c-1", staff: null, operatorOf: [], memberships: [] };

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
  const item = (id: string, sort: number, format: string, status: string, mediaJson: string, copy = "Caption") =>
    sql.run(
      `INSERT INTO deliverable_items (
         id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, 'd-1', 1, NULL, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
      [id, format, `Piece ${id}`, copy, mediaJson, status, sort],
    );
  await item("i-pic", 0, "static", "approved", JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]));
  await item(
    "i-vid",
    1,
    "video",
    "approved",
    JSON.stringify([
      { r2_key: "vid", role: "main", content_type: "video/mp4" },
      { r2_key: "cover", role: "poster", content_type: "image/jpeg" },
    ]),
  );
  await item("i-open", 2, "static", "pending", JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]));
  return sql;
}

function fakeZernio(accounts: ZernioAccount[], options: { failPost?: boolean } = {}) {
  const posts: ZernioPostInput[] = [];
  const uploads: string[] = [];
  const moves: string[] = [];
  const deletes: string[] = [];
  const zernio: ZernioClient = {
    findProfile: async () => null,
    createProfile: async (input) => ({ _id: "prof-1", name: input.name, externalId: input.externalId }),
    listAccounts: async () => accounts,
    connectUrl: async () => "https://example.com/oauth",
    disconnectAccount: async () => undefined,
    presign: async (filename) => ({ uploadUrl: `https://up/${filename}`, publicUrl: `https://media/${filename}` }),
    upload: async (url) => {
      uploads.push(url);
    },
    createPost: async (input) => {
      if (options.failPost) throw new Error("Instagram token expired");
      posts.push(input);
      return { _id: `zp-${posts.length}`, status: input.isDraft ? "draft" : input.publishNow ? "publishing" : "scheduled" };
    },
    getPost: async () => ({
      _id: "zp-1",
      status: "published",
      platforms: [{ platform: "instagram", accountId: "ig", status: "published", platformPostUrl: "https://instagram.com/p/1" }],
    }),
    reschedulePost: async (postId) => {
      moves.push(postId);
      return { _id: postId, status: "scheduled" };
    },
    deletePost: async (postId) => {
      deletes.push(postId);
    },
    listWebhooks: async () => [],
    saveWebhook: async (input) => ({ _id: "wh", name: input.name, url: input.url, events: input.events }),
  };
  return { zernio, posts, uploads, moves, deletes };
}

const store = { read: async (key: string) => new TextEncoder().encode(key) } as unknown as ObjectStore;

const ACCOUNTS: ZernioAccount[] = [
  { _id: "ig", platform: "instagram", profileId: "prof-1", username: "acme", displayName: null, isActive: true },
  { _id: "yt", platform: "youtube", profileId: "prof-1", username: "acme", displayName: null, isActive: true },
  { _id: "li", platform: "linkedin", profileId: "prof-1", username: "acme", displayName: null, isActive: true },
];

const base = { deliverableId: "d-1", postType: null, timezone: "UTC" };

describe("social publishing", () => {
  it("syncs the client's accounts into one Zernio profile keyed by the client id", async () => {
    const sql = await database();
    const { zernio } = fakeZernio(ACCOUNTS);
    const rows = await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    expect(rows.map((row) => row.id)).toEqual(["ig", "li", "yt"]);
    const profile = await sql.get<{ zernio_profile_id: string }>("SELECT zernio_profile_id FROM social_profiles");
    expect(profile?.zernio_profile_id).toBe("prof-1");
    const fewer = fakeZernio([ACCOUNTS[0]]);
    expect((await syncSocialAccounts(sql, fewer.zernio, { id: "org-1", name: "Acme" }, NOW)).map((row) => row.id)).toEqual(["ig"]);
  });

  it("schedules an approved picture, copies its media to Zernio, and skips networks that cannot take it", async () => {
    const sql = await database();
    const { zernio, posts, uploads } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const sent = await sendPiece(
      sql,
      zernio,
      store,
      staff,
      { ...base, itemId: "i-pic", accountIds: ["ig", "yt", "li"], mode: "scheduled", scheduledFor: NOW + 3_600_000 },
      NOW,
    );
    expect(sent).toMatchObject({ ok: true, status: "scheduled", sentTo: 2 });
    expect(sent.skipped).toEqual(["YouTube acme: YouTube needs one video."]);
    expect(uploads).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      content: "Caption",
      profileId: "prof-1",
      scheduledFor: new Date(NOW + 3_600_000).toISOString(),
      mediaItems: [{ type: "image", url: expect.stringContaining("https://media/") }],
      platforms: [
        { platform: "instagram", accountId: "ig" },
        { platform: "linkedin", accountId: "li" },
      ],
    });
    const again = await sendPiece(
      sql,
      zernio,
      store,
      staff,
      { ...base, itemId: "i-pic", accountIds: ["ig"], mode: "now", scheduledFor: null },
      NOW,
    );
    expect(again).toMatchObject({ ok: false, skipped: ["Instagram acme: already has this piece."] });
  });

  it("sends a video as a reel with its poster as the cover, or as a YouTube Short", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const sent = await sendPiece(
      sql,
      zernio,
      store,
      staff,
      { ...base, itemId: "i-vid", postType: "short", accountIds: ["ig", "yt"], mode: "now", scheduledFor: null },
      NOW,
    );
    expect(sent).toMatchObject({ ok: true, sentTo: 2 });
    expect(posts[0].publishNow).toBe(true);
    expect(posts[0].mediaItems).toEqual([
      { type: "video", url: expect.stringContaining("main.mp4"), thumbnail: expect.stringContaining("poster.jpg") },
    ]);
    expect(posts[0].platforms[0].platformSpecificData).toMatchObject({ shareToFeed: true });
    expect(posts[0].platforms[1].platformSpecificData).toMatchObject({ title: "Piece i-vid" });
    const row = await sql.get<{ post_type: string }>("SELECT post_type FROM social_posts");
    expect(row?.post_type).toBe("short");
  });

  it("refuses to schedule a piece the client has not approved, but allows a draft", async () => {
    const sql = await database();
    const { zernio } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const input = { ...base, itemId: "i-open", accountIds: ["ig"], scheduledFor: null };
    expect(await sendPiece(sql, zernio, store, staff, { ...input, mode: "now" }, NOW)).toMatchObject({ ok: false });
    expect(await sendPiece(sql, zernio, store, staff, { ...input, mode: "draft" }, NOW)).toMatchObject({ ok: true, status: "draft" });
    expect(await sendPiece(sql, zernio, store, client, { ...input, mode: "draft" }, NOW)).toMatchObject({ ok: false });
  });

  it("keeps a failed send visible with the reason", async () => {
    const sql = await database();
    const { zernio } = fakeZernio(ACCOUNTS, { failPost: true });
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const sent = await sendPiece(sql, zernio, store, staff, { ...base, itemId: "i-pic", accountIds: ["ig"], mode: "now", scheduledFor: null }, NOW);
    expect(sent).toMatchObject({ ok: false });
    const posts = await listSocialPosts(sql, { organizationId: "org-1" });
    expect(posts[0]).toMatchObject({ status: "failed", error: "Instagram token expired", item_title: "Piece i-pic" });
  });

  it("select all schedules every picked piece, spaced from the start time, and reports what it could not send", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const result = await sendPieces(
      sql,
      zernio,
      store,
      staff,
      {
        ...base,
        itemIds: ["i-open", "i-vid", "i-pic"],
        accountIds: ["ig", "li"],
        mode: "scheduled",
        startAt: NOW + 3_600_000,
        gapMinutes: 24 * 60,
      },
      NOW,
    );
    expect(result.sent).toBe(2);
    expect(result.failed).toEqual([{ title: "Piece i-open", error: expect.stringContaining("not approved") }]);
    expect(posts.map((post) => post.scheduledFor)).toEqual([
      new Date(NOW + 3_600_000).toISOString(),
      new Date(NOW + 3_600_000 + 86_400_000).toISOString(),
    ]);
    expect(await refreshSocialPosts(sql, zernio, "org-1", NOW + 3 * 86_400_000)).toBe(2);
  });

  it("turns a wall-clock time in a time zone into an instant", () => {
    expect(zonedTimeToUtc("2026-11-02T09:30", "America/New_York")).toBe(Date.UTC(2026, 10, 2, 14, 30));
    expect(zonedTimeToUtc("2026-07-02T09:30", "America/New_York")).toBe(Date.UTC(2026, 6, 2, 13, 30));
    expect(zonedTimeToUtc("2026-07-02T09:30", "UTC")).toBe(Date.UTC(2026, 6, 2, 9, 30));
    expect(zonedTimeToUtc("bad", "UTC")).toBeNull();
    expect(zonedTimeToUtc("2026-07-02T09:30", "Not/AZone")).toBeNull();
  });
});

describe("social publishing, phase 2", () => {
  it("sends per-network text, a first comment, and YouTube tags kept with the piece", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    expect(
      await savePieceSettings(sql, staff, "i-vid", { texts: { linkedin: "A longer LinkedIn version.", instagram: " " }, firstComment: "Link in bio", tags: "baking, bread ," }, NOW),
    ).toBe(true);
    expect(await savePieceSettings(sql, client, "i-vid", { texts: {}, firstComment: "", tags: "" }, NOW)).toBe(false);
    await sendPiece(sql, zernio, store, staff, { ...base, itemId: "i-vid", accountIds: ["ig", "li", "yt"], mode: "now", scheduledFor: null }, NOW);
    expect(posts[0].tags).toEqual(["baking", "bread"]);
    const byPlatform = Object.fromEntries(posts[0].platforms.map((target) => [target.platform, target]));
    expect(byPlatform.linkedin).toMatchObject({ customContent: "A longer LinkedIn version.", platformSpecificData: { firstComment: "Link in bio" } });
    expect(byPlatform.instagram.customContent).toBeUndefined();
    expect(byPlatform.youtube.platformSpecificData).toMatchObject({ firstComment: "Link in bio", title: "Piece i-vid" });
  });

  it("moves and cancels a scheduled post, and keeps public links from a refresh", async () => {
    const sql = await database();
    const { zernio, moves, deletes } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const sent = await sendPiece(sql, zernio, store, staff, { ...base, itemId: "i-pic", accountIds: ["ig"], mode: "scheduled", scheduledFor: NOW + 3_600_000 }, NOW);
    if (!sent.ok) throw new Error(sent.error);
    expect(await rescheduleSocialPost(sql, zernio, staff, { postId: sent.postId, scheduledFor: NOW + 7_200_000, timezone: "UTC" }, NOW)).toEqual({ ok: true });
    expect(await rescheduleSocialPost(sql, zernio, staff, { postId: sent.postId, scheduledFor: NOW, timezone: "UTC" }, NOW)).toMatchObject({ ok: false });
    expect(moves).toEqual(["zp-1"]);
    expect((await refreshDueSocialPosts(sql, zernio, NOW + 7_300_000))).toBe(1);
    const [post] = await listSocialPosts(sql, { organizationId: "org-1" });
    expect(post).toMatchObject({ status: "published", scheduled_for: NOW + 7_200_000 });
    expect(JSON.parse(post.published_urls ?? "{}")).toEqual({ ig: "https://instagram.com/p/1" });
    expect(await cancelSocialPost(sql, zernio, staff, sent.postId, NOW)).toMatchObject({ ok: false });
    const second = await sendPiece(sql, zernio, store, staff, { ...base, itemId: "i-vid", accountIds: ["ig"], mode: "scheduled", scheduledFor: NOW + 3_600_000 }, NOW);
    if (!second.ok) throw new Error(second.error);
    expect(await cancelSocialPost(sql, zernio, staff, second.postId, NOW)).toEqual({ ok: true });
    expect(deletes).toEqual(["zp-2"]);
  });
});

describe("zernio webhooks", () => {
  it("checks the signature over the raw body", async () => {
    const body = JSON.stringify({ id: "e1", event: "post.published" });
    const signature = await signIntakeBody("whsec", body);
    expect(await verifyZernioSignature("whsec", body, signature)).toBe(true);
    expect(await verifyZernioSignature("whsec", body, signature.toUpperCase())).toBe(true);
    expect(await verifyZernioSignature("whsec", `${body} `, signature)).toBe(false);
    expect(await verifyZernioSignature("", body, signature)).toBe(false);
  });

  it("updates the post from post and platform events once, and marks a disconnected account", async () => {
    const sql = await database();
    const { zernio } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    await sendPiece(sql, zernio, store, staff, { ...base, itemId: "i-pic", accountIds: ["ig", "li"], mode: "now", scheduledFor: null }, NOW);
    const platformEvent = {
      id: "evt-1",
      event: "post.platform.published",
      post: { id: "zp-1", status: "publishing", platforms: [] },
      platform: { name: "instagram", status: "published", publishedUrl: "https://instagram.com/p/abc" },
      account: { accountId: "ig" },
    };
    expect(await applyZernioEvent(sql, platformEvent, NOW, zernio)).toBe("updated");
    expect(await applyZernioEvent(sql, platformEvent, NOW, zernio)).toBe("duplicate");
    const partial = {
      id: "evt-2",
      event: "post.partial",
      post: {
        id: "zp-1",
        status: "partial",
        platforms: [
          { platform: "instagram", status: "published", accountId: "ig", publishedUrl: "https://instagram.com/p/abc" },
          { platform: "linkedin", status: "failed", accountId: "li", error: "Token expired" },
        ],
      },
    };
    expect(await applyZernioEvent(sql, partial, NOW, zernio)).toBe("updated");
    const [post] = await listSocialPosts(sql, { organizationId: "org-1" });
    expect(post).toMatchObject({ status: "partial", error: "LinkedIn: Token expired" });
    expect(JSON.parse(post.published_urls ?? "{}")).toEqual({ ig: "https://instagram.com/p/abc" });
    expect(await applyZernioEvent(sql, { id: "evt-3", event: "post.published", post: { id: "nope" } }, NOW, zernio)).toBe("unknown_post");
    expect(await applyZernioEvent(sql, { id: "evt-4", event: "account.disconnected", account: { accountId: "li" } }, NOW, zernio)).toBe("updated");
    const li = await sql.get<{ is_active: number }>("SELECT is_active FROM social_accounts WHERE id = 'li'");
    expect(li?.is_active).toBe(0);
    expect(await applyZernioEvent(sql, { id: "evt-5", event: "webhook.test", test: true }, NOW, zernio)).toBe("ignored");
  });
});

describe("auto-schedule on approval", () => {
  it("finds open slots on the picked days and times in the client's time zone", () => {
    const monday = Date.UTC(2026, 10, 2, 12, 0);
    const settings = { ...DEFAULT_AUTOPOST, weekdays: [1, 3], times: ["09:00", "17:00"], timezone: "America/New_York" };
    const taken = [Date.UTC(2026, 10, 2, 22, 0)];
    expect(nextSlots(settings, taken, monday, 3)).toEqual([
      Date.UTC(2026, 10, 2, 14, 0),
      Date.UTC(2026, 10, 4, 14, 0),
      Date.UTC(2026, 10, 4, 22, 0),
    ]);
    expect(nextSlots({ ...settings, times: [] }, [], monday, 2)).toEqual([]);
    expect(parseTimes("17:00, 9:00 09:00 25:00")).toEqual(["09:00", "17:00"]);
  });

  it("schedules each approved piece into the next free slot when the client has it on", async () => {
    const sql = await database();
    const { zernio, posts } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    expect(await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: null }, NOW)).toEqual({ scheduled: 0, failed: [] });
    expect(
      await saveAutopost(sql, client, "org-1", { enabled: true, accountIds: ["ig"], weekdays: [0, 1, 2, 3, 4, 5, 6], times: ["09:00"], timezone: "UTC" }, NOW),
    ).toMatchObject({ ok: false });
    expect(
      await saveAutopost(sql, staff, "org-1", { enabled: true, accountIds: ["ig", "other-client"], weekdays: [0, 1, 2, 3, 4, 5, 6], times: ["09:00"], timezone: "UTC" }, NOW),
    ).toEqual({ ok: true });
    expect((await getAutopost(sql, "org-1")).accountIds).toEqual(["ig"]);
    const result = await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: null }, NOW);
    expect(result).toEqual({ scheduled: 2, failed: [] });
    const times = posts.map((post) => Date.parse(post.scheduledFor ?? ""));
    expect(times[1] - times[0]).toBe(86_400_000);
    expect(new Date(times[0]).getUTCHours()).toBe(9);
    expect(await autoScheduleApproved(sql, zernio, store, { deliverableId: "d-1", itemIds: null }, NOW)).toEqual({ scheduled: 0, failed: [] });
    const activity = await sql.get<{ actor_kind: string }>("SELECT actor_kind FROM activities WHERE kind = 'social.post'");
    expect(activity?.actor_kind).toBe("system");
  });
});

describe("HQ chat social tools", () => {
  it("lists accounts and posts, and schedule_social waits for approval then schedules every approved piece", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO staff (user_id, email, is_super_admin, created_at, revoked_at) VALUES ('staff-1', 'staff@example.com', 0, ?, NULL)`,
      [NOW],
    );
    const { zernio, posts } = fakeZernio(ACCOUNTS);
    await syncSocialAccounts(sql, zernio, { id: "org-1", name: "Acme" }, NOW);
    const social = { zernio, store };
    const accounts = await runHqTool(sql, staff, { tool: "list_social_accounts", input: { organizationId: "org-1" } }, NOW, { social });
    expect(accounts).toMatchObject({ ok: true, value: expect.arrayContaining([expect.objectContaining({ id: "ig", platform: "instagram" })]) });
    const input = { organizationId: "org-1", deliverableId: "d-1", accountIds: ["ig"], mode: "scheduled", startAt: "2027-03-01T09:00", timezone: "UTC", gapMinutes: 60 };
    const gated = await runHqTool(sql, staff, { tool: "schedule_social", input, idempotencyKey: "k1" }, NOW, { social });
    expect(gated).toMatchObject({ needsApproval: true });
    expect(posts).toHaveLength(0);
    const done = await runHqTool(sql, staff, { tool: "schedule_social", input, idempotencyKey: "k2", approved: true }, NOW, { social });
    expect(done).toMatchObject({ ok: true, value: { sent: 2, failed: [expect.objectContaining({ title: "Piece i-open" })] } });
    expect(posts.map((post) => post.scheduledFor)).toEqual(["2027-03-01T09:00:00.000Z", "2027-03-01T10:00:00.000Z"]);
    const listed = await runHqTool(sql, staff, { tool: "list_social_posts", input: { organizationId: "org-1" } }, NOW, { social });
    expect((listed as { value: unknown[] }).value).toHaveLength(2);
  });
});
