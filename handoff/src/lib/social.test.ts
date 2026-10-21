import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { Caller } from "./authz";
import {
  listSocialPosts,
  refreshSocialPosts,
  sendPiece,
  sendPieces,
  syncSocialAccounts,
  zonedTimeToUtc,
} from "./social";
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
    getPost: async () => ({ _id: "zp-1", status: "published" }),
  };
  return { zernio, posts, uploads };
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
