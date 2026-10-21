import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "@/db/migrate";
import { sqliteSql, type Sql } from "@/db/sql";
import type { SocialActor } from "./social-policy";
import { pieceSettings } from "./social";
import { readSocialVariants, saveSocialVariant } from "./social-variants";

const NOW = 1_800_000_000_000;
const hire: SocialActor = {
  kind: "agent",
  id: "acme-writer",
  role: "hire",
  assigned: true,
  mode: "draft",
  grant: [],
  revoke: [],
};
const member: SocialActor = { kind: "client_member", id: "member-1" };

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
     ) VALUES ('i-slides', 'd-1', 1, NULL, 'carousel', NULL, 'Slides', 'Caption', ?, NULL, 'approved', 0)`,
    [
      JSON.stringify([
        { r2_key: "slide-b", role: "slide", content_type: "image/jpeg" },
        { r2_key: "slide-a", role: "slide", content_type: "image/jpeg" },
        { r2_key: "cover", role: "main", content_type: "image/jpeg" },
      ]),
    ],
  );
  await sql.run(
    `INSERT INTO deliverable_items (
       id, deliverable_id, version, section, format, channel, title, copy_text, media_json, link_url, status, sort
     ) VALUES ('i-clip', 'd-1', 1, NULL, 'video', NULL, 'Clip', 'Watch', ?, NULL, 'approved', 1)`,
    [
      JSON.stringify([
        { r2_key: "clip", role: "main", content_type: "video/mp4" },
        { r2_key: "poster", role: "poster", content_type: "image/jpeg" },
      ]),
    ],
  );
  return sql;
}

afterEach(() => {
  delete process.env.SOCIAL_AGENT_ACTIONS;
});

describe("social variant bridge", () => {
  it("reads piece settings as a variant and keeps carousel order and reel metadata", async () => {
    const sql = await database();
    await sql.run(
      `INSERT INTO social_piece_settings (item_id, texts_json, first_comment, tags, updated_at)
       VALUES ('i-slides', ?, 'See the last slide', NULL, ?)`,
      [JSON.stringify({ instagram: "Slide caption" }), NOW],
    );
    await sql.run(
      `INSERT INTO social_piece_settings (item_id, texts_json, first_comment, tags, updated_at)
       VALUES ('i-clip', ?, 'Watch first', 'bread, oven', ?)`,
      [JSON.stringify({ instagram: "Watch this", youtube_title: "Short title" }), NOW],
    );

    const slides = await readSocialVariants(sql, "i-slides", 1);
    const instagramSlides = slides.find((row) => row.platform === "instagram");
    expect(instagramSlides).toMatchObject({
      source: "settings",
      revision: 0,
      eligible: true,
      caption: "Slide caption",
      firstComment: "See the last slide",
      postType: "carousel",
      mediaOrder: ["cover", "slide-b", "slide-a"],
    });
    expect(await sql.get("SELECT id FROM social_variants WHERE item_id = 'i-slides'")).toBeUndefined();

    const clip = await readSocialVariants(sql, "i-clip", 1);
    expect(clip.find((row) => row.platform === "instagram")).toMatchObject({
      source: "settings",
      postType: "reel",
      caption: "Watch this",
      options: { shareToFeed: true },
      mediaOrder: ["clip"],
    });
    expect(clip.find((row) => row.platform === "youtube")).toMatchObject({
      source: "settings",
      postType: "short",
      title: "Short title",
      tags: ["bread", "oven"],
      options: { title: "Short title", visibility: "public", madeForKids: false },
    });
    await expect(pieceSettings(sql, "i-clip")).resolves.toMatchObject({
      texts: { instagram: "Watch this", youtube_title: "Short title" },
      firstComment: "Watch first",
      tags: ["bread", "oven"],
    });
    expect(await sql.get("SELECT id FROM social_variants WHERE item_id = 'i-clip'")).toBeUndefined();
  });
});

describe("saveSocialVariant", () => {
  it("records version, actor, revision, and allowed options without touching piece settings", async () => {
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    const sql = await database();
    await sql.run(
      `INSERT INTO social_piece_settings (item_id, texts_json, first_comment, tags, updated_at)
       VALUES ('i-clip', '{}', 'keep me', 'bread', ?)`,
      [NOW],
    );
    const saved = await saveSocialVariant(sql, {
      organizationId: "org-1",
      actor: hire,
      itemId: "i-clip",
      version: 1,
      platform: "instagram",
      caption: "Reel caption",
      firstComment: "First",
      title: null,
      tags: [],
      postType: "reel",
      options: { shareToFeed: true },
      mediaOrder: ["clip"],
      expectedRevision: 0,
      now: NOW,
    });
    expect(saved).toMatchObject({
      source: "variant",
      version: 1,
      platform: "instagram",
      revision: 1,
      caption: "Reel caption",
      postType: "reel",
      options: { shareToFeed: true },
      mediaOrder: ["clip"],
      updatedByKind: "agent",
      updatedById: "acme-writer",
      eligible: true,
    });
    const settings = await sql.get<{ first_comment: string }>(
      "SELECT first_comment FROM social_piece_settings WHERE item_id = 'i-clip'",
    );
    expect(settings?.first_comment).toBe("keep me");
    await expect(pieceSettings(sql, "i-clip")).resolves.toMatchObject({
      texts: { instagram: "Reel caption" },
      firstComment: "First",
      tags: ["bread"],
    });
    const activity = await sql.get<{ data_json: string }>(
      "SELECT data_json FROM activities WHERE kind = 'social.variant.updated'",
    );
    expect(activity?.data_json).not.toContain("Reel caption");
    expect(JSON.parse(activity?.data_json ?? "{}")).toMatchObject({ itemId: "i-clip", version: 1, platform: "instagram", revision: 1 });
  });

  it("rejects unsupported fields and a stale revision without writing", async () => {
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    const sql = await database();
    await saveSocialVariant(sql, {
      organizationId: "org-1",
      actor: hire,
      itemId: "i-clip",
      version: 1,
      platform: "tiktok",
      caption: "Draft",
      firstComment: null,
      title: null,
      tags: [],
      postType: "reel",
      options: { draft: true, mediaType: "video" },
      mediaOrder: ["clip"],
      expectedRevision: 0,
      now: NOW,
    });
    await expect(
      saveSocialVariant(sql, {
        organizationId: "org-1",
        actor: hire,
        itemId: "i-clip",
        version: 1,
        platform: "tiktok",
        caption: "Nope",
        firstComment: null,
        title: null,
        tags: [],
        postType: "reel",
        options: { watermark: true },
        mediaOrder: [],
        expectedRevision: 1,
        now: NOW + 1,
      }),
    ).rejects.toMatchObject({ status: 400, reasonCode: "unsupported_options" });
    await expect(
      saveSocialVariant(sql, {
        organizationId: "org-1",
        actor: hire,
        itemId: "i-clip",
        version: 1,
        platform: "tiktok",
        caption: "Stale",
        firstComment: null,
        title: null,
        tags: [],
        postType: "reel",
        options: { draft: true },
        mediaOrder: ["clip"],
        expectedRevision: 0,
        now: NOW + 2,
      }),
    ).rejects.toMatchObject({ status: 409, reasonCode: "conflict" });
    const row = await sql.get<{ caption: string; revision: number }>(
      "SELECT caption, revision FROM social_variants WHERE item_id = 'i-clip' AND platform = 'tiktok'",
    );
    expect(row).toEqual({ caption: "Draft", revision: 1 });
  });

  it("keeps the old variant auditable and ineligible after the source version changes", async () => {
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    const sql = await database();
    const saved = await saveSocialVariant(sql, {
      organizationId: "org-1",
      actor: hire,
      itemId: "i-slides",
      version: 1,
      platform: "instagram",
      caption: "Version one",
      firstComment: null,
      title: null,
      tags: [],
      postType: "carousel",
      options: {},
      mediaOrder: ["cover", "slide-b", "slide-a"],
      expectedRevision: 0,
      now: NOW,
    });
    await sql.run("UPDATE deliverables SET version = 2 WHERE id = 'd-1'");
    await sql.run("UPDATE deliverable_items SET version = 2 WHERE id = 'i-slides'");
    const historical = await readSocialVariants(sql, "i-slides", 1);
    expect(historical.find((row) => row.id === saved.id)).toMatchObject({
      source: "variant",
      version: 1,
      caption: "Version one",
      eligible: false,
      mediaOrder: ["cover", "slide-b", "slide-a"],
    });
    const current = await readSocialVariants(sql, "i-slides", 2);
    expect(current.find((row) => row.id === saved.id)).toBeUndefined();
    expect(current.every((row) => row.version === 2)).toBe(true);
  });

  it("denies a client member and stays off when the feature flag is off", async () => {
    const sql = await database();
    await expect(
      saveSocialVariant(sql, {
        organizationId: "org-1",
        actor: hire,
        itemId: "i-clip",
        version: 1,
        platform: "instagram",
        caption: "Hidden",
        firstComment: null,
        title: null,
        tags: [],
        postType: "reel",
        options: {},
        mediaOrder: [],
        expectedRevision: 0,
        now: NOW,
      }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "feature_disabled" });
    process.env.SOCIAL_AGENT_ACTIONS = "on";
    await expect(
      saveSocialVariant(sql, {
        organizationId: "org-1",
        actor: member,
        itemId: "i-clip",
        version: 1,
        platform: "instagram",
        caption: "Member",
        firstComment: null,
        title: null,
        tags: [],
        postType: "reel",
        options: {},
        mediaOrder: [],
        expectedRevision: 0,
        now: NOW,
      }),
    ).rejects.toMatchObject({ status: 403, reasonCode: "role_denied" });
    expect(await sql.get("SELECT id FROM social_variants")).toBeUndefined();
  });
});
