import type { Sql } from "@/db/sql";
import type { ItemFormat } from "./deliverable-manifest";
import { actorStorageKind, PlanError } from "./social-plans";
import { evaluateSocialPolicy, type SocialActor } from "./social-policy";
import { allowedSocialOptionKeys, unsupportedSocialOptionKeys } from "./social-preflight";
import { asPostType, defaultPostType, pieceMedia, planTarget, type PostType } from "./social-plan";
import { socialAgentActionsEnabled } from "./social-queries";
import { isEligibleSocialPlatform } from "./zernio";

export type SocialVariant = {
  id: string | null;
  itemId: string;
  version: number;
  platform: string;
  caption: string | null;
  firstComment: string | null;
  title: string | null;
  tags: string[];
  postType: PostType | null;
  options: Record<string, unknown>;
  mediaOrder: string[];
  revision: number;
  source: "variant" | "settings";
  updatedByKind: "staff" | "client" | "agent" | "system";
  updatedById: string | null;
  updatedAt: number | null;
  eligible: boolean;
};

export type SaveSocialVariantInput = {
  organizationId: string;
  actor: SocialActor;
  itemId: string;
  version: number;
  platform: string;
  caption: string | null;
  firstComment: string | null;
  title: string | null;
  tags: string[];
  postType: PostType | null;
  options: Record<string, unknown>;
  mediaOrder: string[];
  expectedRevision: number;
  now: number;
};

type ItemContext = {
  version: number;
  current_version: number;
  format: ItemFormat;
  title: string;
  media_json: string;
  organization_id: string;
};

type VariantRow = {
  id: string;
  item_id: string;
  version: number;
  platform: string;
  caption: string | null;
  first_comment: string | null;
  title: string | null;
  tags_json: string | null;
  post_type: string | null;
  options_json: string;
  revision: number;
  updated_by_kind: SocialVariant["updatedByKind"];
  updated_by_id: string | null;
  updated_at: number;
};

const ACTOR_KIND = new Set(["staff", "client", "agent", "system"]);

function cleanText(value: string | null, max: number): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed.slice(0, max) : null;
}

function cleanTags(tags: string[]): string[] {
  return tags.map((tag) => tag.trim().slice(0, 100)).filter(Boolean).slice(0, 30);
}

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0);
  } catch {
    return [];
  }
}

function splitStoredOptions(raw: string | null): { options: Record<string, unknown>; mediaOrder: string[] } {
  try {
    const parsed = JSON.parse(raw || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { options: {}, mediaOrder: [] };
    const record = parsed as Record<string, unknown>;
    const mediaOrder = Array.isArray(record.mediaOrder)
      ? record.mediaOrder.filter((key): key is string => typeof key === "string" && key.length > 0)
      : [];
    const options = Object.fromEntries(Object.entries(record).filter(([key]) => key !== "mediaOrder"));
    return { options, mediaOrder };
  } catch {
    return { options: {}, mediaOrder: [] };
  }
}

function activityKind(actor: SocialActor): "staff" | "agent" | "system" {
  const stored = actorStorageKind(actor);
  return stored === "client" ? "system" : stored;
}

function fromRow(row: VariantRow, itemVersion: number, currentVersion: number): SocialVariant {
  const stored = splitStoredOptions(row.options_json);
  const postType = row.post_type ? asPostType(row.post_type) : null;
  return {
    id: row.id,
    itemId: row.item_id,
    version: row.version,
    platform: row.platform,
    caption: row.caption,
    firstComment: row.first_comment,
    title: row.title,
    tags: parseTags(row.tags_json),
    postType,
    options: stored.options,
    mediaOrder: stored.mediaOrder,
    revision: row.revision,
    source: "variant",
    updatedByKind: ACTOR_KIND.has(row.updated_by_kind) ? row.updated_by_kind : "system",
    updatedById: row.updated_by_id,
    updatedAt: row.updated_at,
    eligible: row.version === itemVersion && itemVersion === currentVersion,
  };
}

async function itemContext(sql: Sql, itemId: string): Promise<ItemContext | undefined> {
  return sql.get<ItemContext>(
    `SELECT i.version, d.version AS current_version, i.format, i.title, i.media_json, d.organization_id
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE i.id = ?`,
    [itemId],
  );
}

function allowedOptions(platform: string, raw: Record<string, unknown>): Record<string, unknown> {
  const allowed = allowedSocialOptionKeys(platform);
  return Object.fromEntries(Object.entries(raw).filter(([key]) => allowed.has(key)));
}

function settingsTexts(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0),
    );
  } catch {
    return {};
  }
}

/** First-class rows for one source version, plus a settings bridge when that version is still the piece's version. */
export async function readSocialVariants(sql: Sql, itemId: string, version: number): Promise<SocialVariant[]> {
  const item = await itemContext(sql, itemId);
  if (!item) return [];
  const rows = await sql.all<VariantRow>(
    `SELECT id, item_id, version, platform, caption, first_comment, title, tags_json, post_type, options_json,
       revision, updated_by_kind, updated_by_id, updated_at
     FROM social_variants WHERE item_id = ? AND version = ?`,
    [itemId, version],
  );
  const variants = rows.map((row) => fromRow(row, item.version, item.current_version));
  if (version !== item.version) return variants;

  const settings = await sql.get<{ texts_json: string; first_comment: string | null; tags: string | null; updated_at: number }>(
    "SELECT texts_json, first_comment, tags, updated_at FROM social_piece_settings WHERE item_id = ?",
    [itemId],
  );
  if (!settings) return variants;
  const texts = settingsTexts(settings.texts_json);
  const tags = (settings.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean);
  const media = pieceMedia(item.media_json);
  const fallback = defaultPostType(item.format, media);
  const mediaOrder = media.items.map((file) => file.key);
  const platforms = new Set<string>();
  for (const key of Object.keys(texts)) {
    if (key !== "youtube_title" && isEligibleSocialPlatform(key)) platforms.add(key);
  }
  if (typeof texts.youtube_title === "string" || tags.length > 0) platforms.add("youtube");
  const covered = new Set(variants.map((row) => row.platform));
  const eligible = item.version === item.current_version;
  for (const platform of platforms) {
    if (covered.has(platform)) continue;
    const postType: PostType = platform === "youtube" && fallback === "reel" ? "short" : fallback;
    const title = platform === "youtube" ? texts.youtube_title?.trim() || item.title : item.title;
    const planned = planTarget(platform, postType, media.items, title);
    variants.push({
      id: null,
      itemId,
      version,
      platform,
      caption: texts[platform] ?? null,
      firstComment: settings.first_comment?.trim() || null,
      title: platform === "youtube" ? texts.youtube_title?.trim() || null : null,
      tags: platform === "youtube" ? tags : [],
      postType,
      options: planned.ok ? allowedOptions(platform, planned.platformSpecificData ?? {}) : {},
      mediaOrder,
      revision: 0,
      source: "settings",
      updatedByKind: "system",
      updatedById: null,
      updatedAt: settings.updated_at,
      eligible,
    });
  }
  return variants;
}

/** Stored rows only. Callers that already understand piece settings use this to overlay, not replace, them. */
export async function storedSocialVariants(sql: Sql, itemId: string, version: number): Promise<SocialVariant[]> {
  const item = await itemContext(sql, itemId);
  if (!item) return [];
  const rows = await sql.all<VariantRow>(
    `SELECT id, item_id, version, platform, caption, first_comment, title, tags_json, post_type, options_json,
       revision, updated_by_kind, updated_by_id, updated_at
     FROM social_variants WHERE item_id = ? AND version = ?`,
    [itemId, version],
  );
  return rows.map((row) => fromRow(row, item.version, item.current_version));
}

/**
 * Copies a staff piece-settings save into first-class variants when agent actions are on.
 * The settings row is already written by the caller and is left in place.
 */
export async function mirrorPieceSettingsVariants(
  sql: Sql,
  actor: SocialActor,
  itemId: string,
  input: { texts: Record<string, string>; firstComment: string | null; tags: string[] },
  now: number,
): Promise<void> {
  if (!socialAgentActionsEnabled()) return;
  const item = await itemContext(sql, itemId);
  if (!item || item.version !== item.current_version) return;
  const platforms = new Set<string>();
  for (const [key, value] of Object.entries(input.texts)) {
    if (key !== "youtube_title" && value.trim() && isEligibleSocialPlatform(key)) platforms.add(key);
  }
  if (input.texts.youtube_title?.trim() || input.tags.length > 0) platforms.add("youtube");
  if (platforms.size === 0) return;
  const media = pieceMedia(item.media_json);
  const fallback = defaultPostType(item.format, media);
  const mediaOrder = media.items.map((file) => file.key);
  const existing = await storedSocialVariants(sql, itemId, item.version);
  for (const platform of platforms) {
    const current = existing.find((row) => row.platform === platform);
    const postType: PostType = platform === "youtube" && fallback === "reel" ? "short" : fallback;
    const title = platform === "youtube" ? input.texts.youtube_title?.trim() || item.title : item.title;
    const planned = planTarget(platform, postType, media.items, title);
    await saveSocialVariant(sql, {
      organizationId: item.organization_id,
      actor,
      itemId,
      version: item.version,
      platform,
      caption: input.texts[platform]?.trim() || null,
      firstComment: input.firstComment,
      title: platform === "youtube" ? input.texts.youtube_title?.trim() || null : null,
      tags: platform === "youtube" ? input.tags : [],
      postType,
      options: planned.ok ? allowedOptions(platform, planned.platformSpecificData ?? {}) : {},
      mediaOrder,
      expectedRevision: current?.revision ?? 0,
      now,
    });
  }
}

/** Writes one platform variant. Piece settings stay in place until that older store is retired. */
export async function saveSocialVariant(sql: Sql, input: SaveSocialVariantInput): Promise<SocialVariant> {
  if (!socialAgentActionsEnabled()) throw new PlanError(403, "feature_disabled");
  const policy = evaluateSocialPolicy(input.actor, "variant_write");
  if (policy.authorization === "denied") throw new PlanError(403, policy.reasonCode);
  if (!isEligibleSocialPlatform(input.platform)) throw new PlanError(400, "invalid_platform");
  if (input.postType && !asPostType(input.postType)) throw new PlanError(400, "invalid_post_type");
  const rejected = unsupportedSocialOptionKeys(input.platform, input.options);
  if (rejected.length > 0) throw new PlanError(400, "unsupported_options");

  const item = await itemContext(sql, input.itemId);
  if (!item || item.organization_id !== input.organizationId) throw new PlanError(404, "not_found");
  if (item.version !== input.version || item.current_version !== input.version) throw new PlanError(409, "stale_source");

  const existing = await sql.get<{ id: string; revision: number }>(
    "SELECT id, revision FROM social_variants WHERE item_id = ? AND version = ? AND platform = ?",
    [input.itemId, input.version, input.platform],
  );
  if (input.expectedRevision === 0 ? existing != null : !existing || existing.revision !== input.expectedRevision) {
    throw new PlanError(409, "conflict");
  }

  const revision = input.expectedRevision === 0 ? 1 : input.expectedRevision + 1;
  const caption = cleanText(input.caption, 5000);
  const firstComment = cleanText(input.firstComment, 2000);
  const title = cleanText(input.title, 200);
  const tags = cleanTags(input.tags);
  const mediaOrder = input.mediaOrder.map((key) => key.trim()).filter(Boolean);
  const options = {
    ...allowedOptions(input.platform, input.options),
    ...(mediaOrder.length > 0 ? { mediaOrder } : {}),
  };
  const storedKind = actorStorageKind(input.actor);
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await sql.run(
      `UPDATE social_variants
       SET caption = ?, first_comment = ?, title = ?, tags_json = ?, post_type = ?, options_json = ?,
         revision = ?, updated_by_kind = ?, updated_by_id = ?, updated_at = ?
       WHERE id = ?`,
      [
        caption,
        firstComment,
        title,
        JSON.stringify(tags),
        input.postType,
        JSON.stringify(options),
        revision,
        storedKind,
        input.actor.id,
        input.now,
        id,
      ],
    );
  } else {
    await sql.run(
      `INSERT INTO social_variants (
         id, item_id, version, platform, caption, first_comment, title, tags_json, post_type, options_json,
         revision, updated_by_kind, updated_by_id, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.itemId,
        input.version,
        input.platform,
        caption,
        firstComment,
        title,
        JSON.stringify(tags),
        input.postType,
        JSON.stringify(options),
        revision,
        storedKind,
        input.actor.id,
        input.now,
      ],
    );
  }
  await sql.run(
    `INSERT INTO activities (id, organization_id, kind, actor_kind, actor_id, body, data_json, created_at)
     VALUES (?, ?, 'social.variant.updated', ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.organizationId,
      activityKind(input.actor),
      input.actor.id,
      "Updated a social variant.",
      JSON.stringify({
        itemId: input.itemId,
        version: input.version,
        platform: input.platform,
        revision,
        actorKind: storedKind,
        actorId: input.actor.id,
      }),
      input.now,
    ],
  );
  const saved = (await readSocialVariants(sql, input.itemId, input.version)).find((row) => row.id === id);
  if (!saved) throw new PlanError(500, "not_stored");
  return saved;
}
