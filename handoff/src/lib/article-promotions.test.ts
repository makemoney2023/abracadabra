import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Caller } from "@/lib/authz";
import { migrate } from "@/db/migrate";
import { sqliteSql } from "@/db/sql";
import { articlePromotionAllowed, createArticlePromotionDraft, promotionRequestId } from "./article-promotions";

const NOW = 1_800_000_000_000;
const staff: Caller = { userId: "staff-1", staff: { superAdmin: true }, operatorOf: [], memberships: [] };
const member: Caller = { userId: "member-1", staff: null, operatorOf: [], memberships: [{ workspaceId: "ws-1", role: "client_member" }] };

function failed(result: { ok: true } | { ok: false; error: string }): string {
  if (result.ok) throw new Error("expected failure");
  return result.error;
}

async function database() {
  const sql = sqliteSql(new DatabaseSync(":memory:"));
  await migrate(sql);
  await sql.run("INSERT INTO organizations (id, name, domain, kind, created_at, updated_at) VALUES ('org-1', 'Acme', 'acme.example', 'client', ?, ?)", [NOW, NOW]);
  await sql.run(
    `INSERT INTO workspaces (
       id, slug, name, display_name, sender_name, policy_profile, quota_bytes, retention_days, request_digest, status, opened_at, organization_id
     ) VALUES ('ws-1', 'acme', 'Acme', 'Acme', 'Studio', 'standard', 1000, 30, 0, 'active', ?, 'org-1')`,
    [NOW],
  );
  await sql.run(
    `INSERT INTO deliverables (
       id, organization_id, workspace_id, title, kind, status, version, published_version, actor_kind, created_at, updated_at
     ) VALUES ('d-1', 'org-1', 'ws-1', 'Article', 'document', 'approved', 1, 1, 'staff', ?, ?)`,
    [NOW, NOW],
  );
  await sql.run(
    "INSERT INTO deliverable_items (id, deliverable_id, version, format, title, media_json, link_url, status, sort) VALUES ('item-1', 'd-1', 1, 'link', 'Q4 article', '[]', 'https://news.example/q4', 'approved', 0)",
  );
  return sql;
}

describe("article promotion drafts", () => {
  afterEach(() => {
    delete process.env.ARTICLE_SOCIAL_PROMO;
  });

  it("creates a local draft and does not publish or change the article URL", async () => {
    const sql = await database();
    expect(failed(await createArticlePromotionDraft(sql, staff, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["linkedin"], externalId: "promo-1" }, NOW))).toBe("disabled");
    process.env.ARTICLE_SOCIAL_PROMO = "on";
    expect(failed(await createArticlePromotionDraft(sql, member, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["linkedin"], externalId: "promo-1" }, NOW))).toBe("forbidden");
    expect(failed(await createArticlePromotionDraft(sql, staff, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["wordpress", "pinterest"], externalId: "promo-1" }, NOW))).toBe("invalid");
    const created = await createArticlePromotionDraft(sql, staff, {
      sourceItemId: "item-1",
      sourceVersion: 1,
      platforms: ["linkedin", "wordpress"],
      externalId: "promo-1",
      tracking: { source: "linkedin", medium: "social", campaign: "q4" },
    }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const again = await createArticlePromotionDraft(sql, staff, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["linkedin"], externalId: "promo-1" }, NOW + 1);
    expect(again).toMatchObject({ ok: true, deliverableId: created.deliverableId, duplicate: true });
    const draft = await sql.get<{ status: string; published_version: number | null }>("SELECT status, published_version FROM deliverables WHERE id = ?", [created.deliverableId]);
    expect(draft).toMatchObject({ status: "draft", published_version: null });
    const copy = await sql.get<{ copy_text: string; status: string }>("SELECT copy_text, status FROM deliverable_items WHERE deliverable_id = ?", [created.deliverableId]);
    expect(copy?.status).toBe("pending");
    expect(copy?.copy_text).toContain("https://news.example/q4");
    expect(copy?.copy_text).toContain("utm_source=linkedin");
    const article = await sql.get<{ link_url: string }>("SELECT link_url FROM deliverable_items WHERE id = 'item-1'");
    expect(article?.link_url).toBe("https://news.example/q4");
    expect(await sql.get("SELECT id FROM social_posts")).toBeUndefined();
    expect(await sql.get("SELECT relation_kind FROM artifact_relations")).toEqual({ relation_kind: "promotes" });
  });

  it("promotes a published article that is still pending, and keeps a fresh campaign id", async () => {
    const sql = await database();
    process.env.ARTICLE_SOCIAL_PROMO = "on";
    await sql.run("UPDATE deliverable_items SET status = 'pending' WHERE id = 'item-1'");
    expect(articlePromotionAllowed({ itemStatus: "pending", articleStatus: null })).toBe(false);
    expect(failed(await createArticlePromotionDraft(sql, staff, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["linkedin"], externalId: "promo-pending" }, NOW))).toBe("invalid");
    await sql.run(
      `INSERT INTO deliverable_artifact_metadata (
         id, organization_id, workspace_id, deliverable_id, item_id, version, artifact_type, canonical_url, article_status, created_at, updated_at
       ) VALUES ('meta-1', 'org-1', 'ws-1', 'd-1', 'item-1', 1, 'article', 'https://news.example/q4', 'published', ?, ?)`,
      [NOW, NOW],
    );
    expect(articlePromotionAllowed({ itemStatus: "pending", articleStatus: "published" })).toBe(true);
    const created = await createArticlePromotionDraft(sql, staff, { sourceItemId: "item-1", sourceVersion: 1, platforms: ["facebook"], externalId: "promo-published" }, NOW);
    expect(created.ok).toBe(true);
    const campaign = "11111111-1111-4111-8111-111111111111";
    expect(promotionRequestId({ requested: campaign, sourceItemId: "item-1", sourceVersion: 1, platforms: ["facebook"] })).toBe(campaign);
    expect(promotionRequestId({ requested: "retry", sourceItemId: "item-1", sourceVersion: 1, platforms: ["facebook", "linkedin"] })).toBe("item-1:1:facebook,linkedin");
  });

  it("builds platform-specific links and only copies selected source media", async () => {
    const sql = await database();
    process.env.ARTICLE_SOCIAL_PROMO = "on";
    const hero = { r2_key: "ws-1/articles/hero.jpg", role: "main", content_type: "image/jpeg" };
    const crop = { r2_key: "ws-1/articles/crop.jpg", role: "square", content_type: "image/jpeg" };
    await sql.run("UPDATE deliverable_items SET media_json = ? WHERE id = 'item-1'", [JSON.stringify([hero, crop])]);

    expect(failed(await createArticlePromotionDraft(sql, staff, {
      sourceItemId: "item-1",
      sourceVersion: 1,
      platforms: ["linkedin"],
      selectedMediaKeys: ["foreign/key.jpg"],
      externalId: "promo-invalid-media",
    }, NOW))).toBe("invalid");

    const created = await createArticlePromotionDraft(sql, staff, {
      sourceItemId: "item-1",
      sourceVersion: 1,
      platforms: ["linkedin", "facebook"],
      selectedMediaKeys: [crop.r2_key],
      externalId: "promo-platform-links",
      tracking: { medium: "social", campaign: "q4" },
    }, NOW);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const rows = await sql.all<{ channel: string; copy_text: string; media_json: string }>(
      "SELECT channel, copy_text, media_json FROM deliverable_items WHERE deliverable_id = ? ORDER BY channel",
      [created.deliverableId],
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.channel === "facebook")?.copy_text).toContain("utm_source=facebook");
    expect(rows.find((row) => row.channel === "linkedin")?.copy_text).toContain("utm_source=linkedin");
    expect(rows.every((row) => row.media_json === JSON.stringify([crop]))).toBe(true);
  });
});
