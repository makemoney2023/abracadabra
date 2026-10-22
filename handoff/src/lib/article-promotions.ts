import type { Caller } from "@/lib/authz";
import { can } from "@/lib/authz";
import type { Sql } from "@/db/sql";
import { inspectCanonicalUrl } from "@/lib/library-artifacts";
import { flagEnabled } from "@/lib/worker-env";
import { isBlogPlatform } from "@/lib/zernio";

const BLOCKED = new Set(["wordpress", "wix", "pinterest"]);

export const ARTICLE_PROMO_PLATFORMS = ["linkedin", "facebook", "instagram", "twitter", "threads", "tiktok", "youtube", "bluesky", "googlebusiness"] as const;

export function articleSocialPromoEnabled(value?: string): boolean {
  return flagEnabled("ARTICLE_SOCIAL_PROMO", value);
}

export function articlePromotionAllowed(input: { itemStatus: string; articleStatus: string | null }): boolean {
  return input.itemStatus === "approved" || input.articleStatus === "published";
}

const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function promotionRequestId(input: { requested: string; sourceItemId: string; sourceVersion: number; platforms: string[] }): string {
  const requested = input.requested.trim();
  if (CAMPAIGN_ID.test(requested)) return requested;
  return `${input.sourceItemId}:${input.sourceVersion}:${[...input.platforms].sort().join(",")}`;
}

export async function createArticlePromotionDraft(
  sql: Sql,
  caller: Caller,
  input: {
    sourceItemId: string;
    sourceVersion: number;
    targetDeliverableId?: string | null;
    platforms: string[];
    selectedMediaKeys?: string[];
    externalId: string;
    tracking?: { source?: string; medium?: string; campaign?: string; content?: string };
  },
  now: number,
): Promise<{ ok: true; deliverableId: string; duplicate: boolean } | { ok: false; error: "disabled" | "forbidden" | "missing" | "invalid" }> {
  if (!articleSocialPromoEnabled()) return { ok: false, error: "disabled" };
  const source = await sql.get<{
    organization_id: string;
    workspace_id: string;
    status: string;
    title: string;
    media_json: string;
    article_status: string | null;
    canonical_url: string | null;
    link_url: string | null;
  }>(
    `SELECT d.organization_id, d.workspace_id, i.status, i.title, i.media_json, m.article_status, m.canonical_url, i.link_url
     FROM deliverable_items i
     JOIN deliverables d ON d.id = i.deliverable_id
     LEFT JOIN deliverable_artifact_metadata m ON m.item_id = i.id AND m.version = i.version
     WHERE i.id = ? AND i.version = ?`,
    [input.sourceItemId, input.sourceVersion],
  );
  if (!source) return { ok: false, error: "missing" };
  if (!can(caller, "article_promotion.create", { workspaceId: source.workspace_id })) return { ok: false, error: "forbidden" };
  if (!articlePromotionAllowed({ itemStatus: source.status, articleStatus: source.article_status })) return { ok: false, error: "invalid" };
  const canonical = inspectCanonicalUrl(source.canonical_url ?? source.link_url, "legacy");
  if (!canonical.ok) return { ok: false, error: "invalid" };
  const platforms = [...new Set(input.platforms.map((platform) => platform.toLowerCase()))].filter((platform) => !BLOCKED.has(platform) && !isBlogPlatform(platform));
  if (platforms.length === 0 || !input.externalId) return { ok: false, error: "invalid" };
  let sourceMedia: { r2_key: string; role: string; content_type: string; size?: number }[];
  try {
    const parsed = JSON.parse(source.media_json) as unknown;
    sourceMedia = Array.isArray(parsed)
      ? parsed.filter((entry): entry is (typeof sourceMedia)[number] =>
          Boolean(entry)
          && typeof (entry as { r2_key?: unknown }).r2_key === "string"
          && typeof (entry as { role?: unknown }).role === "string"
          && typeof (entry as { content_type?: unknown }).content_type === "string")
      : [];
  } catch {
    sourceMedia = [];
  }
  const selectedKeys = input.selectedMediaKeys;
  const selectedMedia = selectedKeys === undefined
    ? sourceMedia
    : sourceMedia.filter((entry) => selectedKeys.includes(entry.r2_key));
  if (selectedKeys && selectedMedia.length !== new Set(selectedKeys).size) return { ok: false, error: "invalid" };
  const mediaJson = JSON.stringify(selectedMedia);
  const actorId = caller.userId ?? "staff";
  const existing = await sql.get<{ response_json: string }>(
    "SELECT response_json FROM article_promotion_idempotency WHERE actor_kind = 'staff' AND actor_id = ? AND external_id = ?",
    [actorId, input.externalId],
  );
  if (existing) {
    const parsed = JSON.parse(existing.response_json) as { deliverableId: string };
    return { ok: true, deliverableId: parsed.deliverableId, duplicate: true };
  }
  let deliverableId = input.targetDeliverableId ?? "";
  let version = 1;
  const statements: { statement: string; params: unknown[] }[] = [];
  if (deliverableId) {
    const target = await sql.get<{ version: number; status: string; kind: string; workspace_id: string }>(
      "SELECT version, status, kind, workspace_id FROM deliverables WHERE id = ?",
      [deliverableId],
    );
    if (!target || target.workspace_id !== source.workspace_id || target.kind !== "social_pack" || target.status !== "draft") return { ok: false, error: "invalid" };
    version = target.version;
  } else {
    deliverableId = crypto.randomUUID();
    statements.push({
      statement: `INSERT INTO deliverables (
         id, organization_id, workspace_id, title, kind, status, version, actor_kind, actor_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'social_pack', 'draft', 1, 'staff', ?, ?, ?)`,
      params: [deliverableId, source.organization_id, source.workspace_id, `Promote ${source.title}`, actorId, now, now],
    });
  }
  const itemIds: string[] = [];
  platforms.forEach((platform, index) => {
    const outbound = trackedArticleUrl(canonical.url, { ...input.tracking, source: platform });
    const itemId = crypto.randomUUID();
    itemIds.push(itemId);
    statements.push({
      statement: `INSERT INTO deliverable_items (
         id, deliverable_id, version, format, channel, title, copy_text, media_json, link_url, status, sort
       ) VALUES (?, ?, ?, 'static', ?, ?, ?, ?, NULL, 'pending', ?)`,
      params: [itemId, deliverableId, version, platform, source.title, `${source.title}\n${outbound}`, mediaJson, index],
    });
    statements.push({
      statement: `INSERT INTO social_variants (
         id, item_id, version, platform, caption, options_json, updated_by_kind, updated_by_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'staff', ?, ?)`,
      params: [crypto.randomUUID(), itemId, version, platform, `${source.title}\n${outbound}`, JSON.stringify({ outbound_url: outbound }), actorId, now],
    });
    statements.push({
      statement: `INSERT INTO artifact_relations (
         id, organization_id, workspace_id, source_kind, source_id, source_version, target_kind, target_id, target_version,
         relation_kind, created_by_kind, created_by_id, created_at
       ) VALUES (?, ?, ?, 'deliverable_item', ?, ?, 'deliverable_item', ?, ?, 'promotes', 'staff', ?, ?)`,
      params: [crypto.randomUUID(), source.organization_id, source.workspace_id, itemId, version, input.sourceItemId, input.sourceVersion, actorId, now],
    });
  });
  statements.push({
    statement: `INSERT INTO social_collections (
       id, organization_id, deliverable_id, name, status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, 'draft', ?, ?)`,
    params: [crypto.randomUUID(), source.organization_id, deliverableId, `Promote ${source.title}`, now, now],
  });
  const response = { deliverableId, itemIds };
  statements.push({
    statement: `INSERT INTO article_promotion_idempotency (
       id, actor_kind, actor_id, external_id, source_item_id, source_version, response_json, created_at
     ) VALUES (?, 'staff', ?, ?, ?, ?, ?, ?)`,
    params: [crypto.randomUUID(), actorId, input.externalId, input.sourceItemId, input.sourceVersion, JSON.stringify(response), now],
  });
  await sql.batch(statements);
  return { ok: true, deliverableId, duplicate: false };
}

export function trackedArticleUrl(url: string, tracking: { source?: string; medium?: string; campaign?: string; content?: string } | undefined): string {
  if (!tracking) return url;
  const parsed = new URL(url);
  for (const [key, value] of Object.entries({ utm_source: tracking.source, utm_medium: tracking.medium, utm_campaign: tracking.campaign, utm_content: tracking.content })) {
    if (value) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}
