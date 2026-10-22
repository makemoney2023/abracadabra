import type { Caller } from "./authz";
import type { ItemFormat } from "./deliverable-manifest";
import type { Sql } from "@/db/sql";
import { reconcilePostedTargets } from "./social-attention";
import { commandAuthorized, readCommandGate } from "./social-commands";
import { allowedSocialOptionKeys } from "./social-preflight";
import { storedSocialVariants, type SocialVariant } from "./social-variants";
import type { ObjectStore } from "./store/objects";
import {
  POST_TYPE_LABEL,
  defaultPostType,
  pieceMedia,
  planTarget,
  spacedTimes,
  type PlannedMedia,
  type PostType,
} from "./social-plan";
import {
  PLATFORM_LABEL,
  ZernioError,
  type ConnectPlatform,
  type ZernioClient,
  type ZernioMediaItem,
  type ZernioPostPlatform,
  type ZernioPostTarget,
} from "./zernio";

export type SocialAccount = {
  id: string;
  organization_id: string;
  platform: string;
  username: string | null;
  display_name: string | null;
  is_active: number;
  synced_at: number;
};

export type PostStatus = "sending" | "draft" | "scheduled" | "published" | "partial" | "failed";
export type SendMode = "draft" | "scheduled" | "now";

export type SocialPost = {
  id: string;
  organization_id: string;
  deliverable_id: string;
  item_id: string;
  version: number;
  account_ids: string;
  mode: SendMode;
  post_type: PostType;
  skipped: string | null;
  scheduled_for: number | null;
  timezone: string | null;
  status: PostStatus;
  zernio_post_id: string | null;
  error: string | null;
  published_urls: string | null;
  created_at: number;
  updated_at: number;
  item_title?: string;
  deliverable_title?: string;
};

export type SendResult =
  | { ok: true; postId: string; status: PostStatus; sentTo: number; skipped: string[] }
  | { ok: false; error: string; skipped: string[]; postId?: string; uncertain?: boolean };

export type TargetOutcome = "succeeded" | "failed" | "uncertain" | "not_attempted" | "scheduled" | "publishing";

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  sending: "Sending",
  draft: "Draft in Zernio",
  scheduled: "Scheduled",
  published: "Posted",
  partial: "Posted to some",
  failed: "Failed",
};

const LIVE_STATUSES = ["sending", "scheduled", "published", "partial"] as const;

function errorText(error: unknown): string {
  if (error instanceof ZernioError) return error.message;
  if (error instanceof Error) return error.message;
  return "Zernio did not answer.";
}

/** A timeout after the local row exists may have reached the provider. Leave the row sending. */
function providerUncertain(error: unknown): boolean {
  return error instanceof ZernioError && (error.status === 408 || error.status === 504 || error.status === 0);
}

/** The client's Zernio profile id, made on first use. externalId is the organization id. */
export async function ensureProfile(
  sql: Sql,
  zernio: ZernioClient,
  organization: { id: string; name: string },
  now: number,
): Promise<string> {
  const stored = await sql.get<{ zernio_profile_id: string }>(
    "SELECT zernio_profile_id FROM social_profiles WHERE organization_id = ?",
    [organization.id],
  );
  if (stored) return stored.zernio_profile_id;
  const found = (await zernio.findProfile(organization.id)) ??
    (await zernio.createProfile({ name: organization.name, externalId: organization.id }));
  await sql.run(
    `INSERT INTO social_profiles (organization_id, zernio_profile_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT (organization_id) DO NOTHING`,
    [organization.id, found._id, now],
  );
  return found._id;
}

export async function listSocialAccounts(sql: Sql, organizationId: string): Promise<SocialAccount[]> {
  return sql.all<SocialAccount>(
    `SELECT id, organization_id, platform, username, display_name, is_active, synced_at
     FROM social_accounts WHERE organization_id = ? ORDER BY platform, username`,
    [organizationId],
  );
}

/** Copies Zernio's account list for this client into social_accounts. Accounts no longer on Zernio are removed. */
export async function syncSocialAccounts(
  sql: Sql,
  zernio: ZernioClient,
  organization: { id: string; name: string },
  now: number,
): Promise<SocialAccount[]> {
  const profileId = await ensureProfile(sql, zernio, organization, now);
  const accounts = await zernio.listAccounts(profileId);
  const keep = accounts.map((row) => row._id);
  const statements = [
    {
      statement:
        keep.length > 0
          ? `DELETE FROM social_accounts WHERE organization_id = ? AND id NOT IN (${keep.map(() => "?").join(", ")})`
          : "DELETE FROM social_accounts WHERE organization_id = ?",
      params: [organization.id, ...keep],
    },
    ...accounts.map((row) => ({
      statement: `INSERT INTO social_accounts (id, organization_id, platform, username, display_name, is_active, synced_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET organization_id = excluded.organization_id, platform = excluded.platform,
          username = excluded.username, display_name = excluded.display_name, is_active = excluded.is_active,
          synced_at = excluded.synced_at`,
      params: [row._id, organization.id, row.platform, row.username, row.displayName, row.isActive ? 1 : 0, now],
    })),
  ];
  await sql.batch(statements);
  return listSocialAccounts(sql, organization.id);
}

export async function connectLink(
  sql: Sql,
  zernio: ZernioClient,
  organization: { id: string; name: string },
  platform: ConnectPlatform,
  redirectUrl: string,
  now: number,
): Promise<string> {
  const profileId = await ensureProfile(sql, zernio, organization, now);
  return zernio.connectUrl(platform, profileId, redirectUrl);
}

export async function disconnectSocialAccount(
  sql: Sql,
  zernio: ZernioClient,
  organizationId: string,
  accountId: string,
): Promise<boolean> {
  const row = await sql.get<{ id: string }>("SELECT id FROM social_accounts WHERE id = ? AND organization_id = ?", [
    accountId,
    organizationId,
  ]);
  if (!row) return false;
  await zernio.disconnectAccount(accountId);
  await sql.run("DELETE FROM social_accounts WHERE id = ?", [accountId]);
  return true;
}

/** Wall-clock time in an IANA zone ("2026-11-02T09:30") as a unix ms instant. Null when either part is bad. */
export function zonedTimeToUtc(local: string, timeZone: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!match) return null;
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return null;
  }
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (instant: number): number => {
    const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
    const asUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    return asUtc - instant;
  };
  const first = wall - offsetAt(wall);
  return wall - offsetAt(first);
}

type ItemRow = {
  id: string;
  deliverable_id: string;
  version: number;
  format: ItemFormat;
  title: string;
  copy_text: string | null;
  media_json: string;
  channel: string | null;
  status: "pending" | "approved" | "changes_requested";
  sort: number;
  organization_id: string;
  project_id: string | null;
  workspace_id: string;
  deliverable_title: string;
};

async function loadItem(sql: Sql, deliverableId: string, itemId: string): Promise<ItemRow | undefined> {
  return sql.get<ItemRow>(
    `SELECT i.id, i.deliverable_id, i.version, i.format, i.title, i.copy_text, i.media_json, i.channel, i.status, i.sort,
       d.organization_id, d.project_id, d.workspace_id, d.title AS deliverable_title
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE i.id = ? AND i.deliverable_id = ?`,
    [itemId, deliverableId],
  );
}

async function hasPieceText(sql: Sql, itemId: string): Promise<boolean> {
  return Object.keys((await pieceSettings(sql, itemId)).texts).length > 0;
}

async function uploadMedia(
  zernio: ZernioClient,
  store: ObjectStore,
  media: PlannedMedia,
  name: string,
): Promise<string> {
  const stream = media.kind === "video" && store.readStream ? await store.readStream(media.key) : null;
  const bytes = stream ?? (await store.read(media.key));
  if (!bytes) throw new Error(`The ${media.role} file is missing from storage.`);
  const extension = media.contentType.split("/")[1]?.split(";")[0]?.replace("jpeg", "jpg") ?? "bin";
  const presigned = await zernio.presign(`${name}-${media.role}.${extension}`, media.contentType);
  await zernio.upload(presigned.uploadUrl, bytes, media.contentType);
  return presigned.publicUrl;
}

export function statusFrom(zernioStatus: string | undefined, mode: SendMode): PostStatus {
  switch ((zernioStatus ?? "").toLowerCase()) {
    case "draft":
      return "draft";
    case "scheduled":
      return "scheduled";
    case "published":
      return "published";
    case "partial":
      return "partial";
    case "failed":
    case "cancelled":
      return "failed";
    default:
      return mode === "draft" ? "draft" : mode === "scheduled" ? "scheduled" : "sending";
  }
}

/** Networks where Zernio posts a first comment right after the post. */
const FIRST_COMMENT_PLATFORMS = new Set(["instagram", "facebook", "linkedin", "youtube", "threads", "twitter"]);

export type PieceSettings = { texts: Record<string, string>; firstComment: string | null; tags: string[] };

export const EMPTY_PIECE_SETTINGS: PieceSettings = { texts: {}, firstComment: null, tags: [] };

async function storedPieceSettings(sql: Sql, itemId: string): Promise<PieceSettings> {
  const row = await sql.get<{ texts_json: string; first_comment: string | null; tags: string | null }>(
    "SELECT texts_json, first_comment, tags FROM social_piece_settings WHERE item_id = ?",
    [itemId],
  );
  if (!row) return EMPTY_PIECE_SETTINGS;
  let texts: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.texts_json) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      texts = Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0,
        ),
      );
    }
  } catch {
    texts = {};
  }
  return {
    texts,
    firstComment: row.first_comment?.trim() || null,
    tags: (row.tags ?? "").split(",").map((tag) => tag.trim()).filter(Boolean),
  };
}

function sharedMediaOrder(variants: SocialVariant[]): string[] | null {
  const orders = variants.map((row) => row.mediaOrder).filter((order) => order.length > 0);
  if (orders.length === 0) return null;
  const signature = orders[0].join("\0");
  if (orders.some((order) => order.join("\0") !== signature)) return null;
  return orders[0];
}

function orderedMedia(items: PlannedMedia[], order: string[] | null): PlannedMedia[] {
  if (!order || order.length !== items.length) return items;
  const byKey = new Map(items.map((item) => [item.key, item]));
  if (!order.every((key) => byKey.has(key))) return items;
  return order.map((key) => byKey.get(key)!);
}

function overlayPieceSettings(base: PieceSettings, variants: SocialVariant[]): PieceSettings {
  const texts = { ...base.texts };
  for (const variant of variants) {
    if (variant.caption) texts[variant.platform] = variant.caption;
    if (variant.platform === "youtube" && variant.title) texts.youtube_title = variant.title;
  }
  const youtube = variants.find((row) => row.platform === "youtube");
  const comments = variants.map((row) => row.firstComment?.trim() || "").filter(Boolean);
  const agreed = comments.length > 0 && comments.every((comment) => comment === comments[0]) ? comments[0] : null;
  return {
    texts,
    firstComment: agreed ?? base.firstComment,
    tags: youtube && youtube.tags.length > 0 ? youtube.tags : base.tags,
  };
}

export async function pieceSettings(sql: Sql, itemId: string): Promise<PieceSettings> {
  const base = await storedPieceSettings(sql, itemId);
  const item = await sql.get<{ version: number; current_version: number }>(
    `SELECT i.version, d.version AS current_version
     FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
     WHERE i.id = ?`,
    [itemId],
  );
  if (!item || item.version !== item.current_version) return base;
  const variants = (await storedSocialVariants(sql, itemId, item.version)).filter((row) => row.eligible);
  if (variants.length === 0) return base;
  return overlayPieceSettings(base, variants);
}

/** Saves the per-network text, first comment, and YouTube tags kept with one piece. Staff only. */
export async function savePieceSettings(
  sql: Sql,
  caller: Caller,
  itemId: string,
  input: { texts: Record<string, string>; firstComment: string; tags: string },
  now: number,
): Promise<boolean> {
  if (!commandAuthorized(caller)) return false;
  const item = await sql.get<{ id: string }>("SELECT id FROM deliverable_items WHERE id = ?", [itemId]);
  if (!item) return false;
  const texts = Object.fromEntries(
    Object.entries(input.texts)
      .map(([platform, text]) => [platform, text.trim().slice(0, 5000)] as const)
      .filter(([, text]) => text.length > 0),
  );
  const tags = input.tags
    .split(",")
    .map((tag) => tag.trim().slice(0, 100))
    .filter(Boolean)
    .join(",")
    .slice(0, 500);
  await sql.run(
    `INSERT INTO social_piece_settings (item_id, texts_json, first_comment, tags, updated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (item_id) DO UPDATE SET texts_json = excluded.texts_json, first_comment = excluded.first_comment,
       tags = excluded.tags, updated_at = excluded.updated_at`,
    [itemId, JSON.stringify(texts), input.firstComment.trim().slice(0, 2000) || null, tags || null, now],
  );
  return true;
}

export type SendPieceInput = {
  deliverableId: string;
  itemId: string;
  accountIds: string[];
  mode: SendMode;
  /** Null uses the piece's own default (story, carousel, reel, or feed). */
  postType: PostType | null;
  /** Unix ms for mode "scheduled". */
  scheduledFor: number | null;
  timezone: string;
  /** When set, update this failed post instead of inserting another row. */
  retryPostId?: string | null;
  /**
   * Options locked into a publish plan for this destination.
   * Direct sends, including schedule_social, leave this unset.
   */
  platformOverrides?: Record<string, unknown>;
};

function trimmedText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** A plan row names tags even when the list is empty. A missing key keeps the piece's own tags. */
function plannedOverrideTags(overrides: Record<string, unknown> | undefined): string[] | null {
  if (!overrides || !Object.prototype.hasOwnProperty.call(overrides, "tags") || !Array.isArray(overrides.tags)) return null;
  return overrides.tags.filter((tag): tag is string => typeof tag === "string");
}

function filteredPlatformOverrides(platform: string, overrides: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!overrides) return {};
  const allowed = allowedSocialOptionKeys(platform);
  return Object.fromEntries(Object.entries(overrides).filter(([key]) => allowed.has(key)));
}

function postedTitle(targets: ZernioPostTarget[], itemTitle: string): string {
  const youtube = targets.find((target) => target.platform === "youtube");
  const title = youtube?.platformSpecificData?.title;
  if (typeof title === "string" && title.trim()) return title.slice(0, 100);
  return itemTitle.slice(0, 100);
}

/**
 * Sends one finished-work piece (caption, pictures, video, title) to the chosen accounts as one Zernio post.
 * Schedule and Post now need the client to have approved the piece. Drafts do not.
 * Accounts that cannot take this post type, or already have this piece, are skipped and named.
 */
export async function sendPiece(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  caller: Caller,
  input: SendPieceInput,
  now: number,
): Promise<SendResult> {
  if (!commandAuthorized(caller)) return { ok: false, error: "You can't do that.", skipped: [] };
  const item = await loadItem(sql, input.deliverableId, input.itemId);
  if (!item) return { ok: false, error: "That piece is not here.", skipped: [] };
  if (input.mode !== "draft" && item.status !== "approved") {
    return { ok: false, error: `"${item.title}" is not approved by the client yet. Save it as a draft instead.`, skipped: [] };
  }
  if (input.mode === "scheduled" && (input.scheduledFor == null || input.scheduledFor < now + 60_000)) {
    return { ok: false, error: "Pick a time at least one minute from now.", skipped: [] };
  }
  let retryId: string | null = null;
  if (input.retryPostId) {
    const existing = await sql.get<{ id: string; item_id: string; version: number; status: string }>(
      "SELECT id, item_id, version, status FROM social_posts WHERE id = ?",
      [input.retryPostId],
    );
    if (!existing || existing.item_id !== item.id || existing.version !== item.version || existing.status !== "failed") {
      return { ok: false, error: "That post cannot be retried.", skipped: [] };
    }
    retryId = existing.id;
  }
  const wanted = [...new Set(input.accountIds)];
  if (wanted.length === 0) return { ok: false, error: "Pick at least one account.", skipped: [] };
  const accounts = await sql.all<SocialAccount>(
    `SELECT id, organization_id, platform, username, display_name, is_active, synced_at FROM social_accounts
     WHERE organization_id = ? AND is_active = 1 AND id IN (${wanted.map(() => "?").join(", ")})`,
    [item.organization_id, ...wanted],
  );
  const profile = await sql.get<{ zernio_profile_id: string }>(
    "SELECT zernio_profile_id FROM social_profiles WHERE organization_id = ?",
    [item.organization_id],
  );
  if (!profile || accounts.length === 0) return { ok: false, error: "Those accounts are not on this client.", skipped: [] };

  const sentBefore = new Set(
    (
      await sql.all<{ account_ids: string }>(
        `SELECT account_ids FROM social_posts WHERE item_id = ? AND version = ?
         AND status IN (${LIVE_STATUSES.map(() => "?").join(", ")})`,
        [item.id, item.version, ...LIVE_STATUSES],
      )
    ).flatMap((row) => JSON.parse(row.account_ids) as string[]),
  );

  const media = pieceMedia(item.media_json);
  const postType = input.postType ?? defaultPostType(item.format, media);
  const content = (item.copy_text ?? "").trim();
  if (!content && media.items.length === 0 && !(await hasPieceText(sql, item.id))) return { ok: false, error: `"${item.title}" has no caption or media.`, skipped: [] };

  const settings = await pieceSettings(sql, item.id);
  const variants = (await storedSocialVariants(sql, item.id, item.version)).filter((row) => row.eligible);
  const variantByPlatform = new Map(variants.map((row) => [row.platform, row]));
  const youtubeVariant = variantByPlatform.get("youtube");
  const overrideTags = plannedOverrideTags(input.platformOverrides);
  const postTags = overrideTags ?? (youtubeVariant && youtubeVariant.tags.length > 0 ? youtubeVariant.tags : settings.tags);
  const skipped: string[] = [];
  const targets: ZernioPostTarget[] = [];
  for (const account of accounts) {
    const label = `${PLATFORM_LABEL[account.platform] ?? account.platform} ${account.username ?? ""}`.trim();
    if (input.mode !== "draft" && sentBefore.has(account.id)) {
      skipped.push(`${label}: already has this piece.`);
      continue;
    }
    const variant = variantByPlatform.get(account.platform);
    const overrides = filteredPlatformOverrides(account.platform, input.platformOverrides);
    const title =
      account.platform === "youtube"
        ? trimmedText(overrides.title) || variant?.title?.trim() || item.title
        : item.title;
    const plan = planTarget(account.platform, postType, media.items, title);
    if (!plan.ok) {
      skipped.push(`${label}: ${plan.reason}`);
      continue;
    }
    const commentText = variant?.firstComment || settings.firstComment;
    const comment =
      commentText && postType !== "story" && FIRST_COMMENT_PLATFORMS.has(account.platform)
        ? { firstComment: commentText }
        : {};
    const variantOptions = { ...(variant?.options ?? {}) };
    if (account.platform === "youtube") delete variantOptions.title;
    const specific: Record<string, unknown> = { ...plan.platformSpecificData, ...variantOptions, ...comment, ...overrides };
    if (account.platform === "youtube" && typeof plan.platformSpecificData?.title === "string") {
      specific.title = plan.platformSpecificData.title;
    }
    const text = variant?.caption || settings.texts[account.platform];
    targets.push({
      platform: account.platform,
      accountId: account.id,
      ...(text ? { customContent: text } : {}),
      ...(Object.keys(specific).length > 0 ? { platformSpecificData: specific } : {}),
    });
  }
  if (targets.length === 0) {
    return { ok: false, error: `No picked account can take "${item.title}" as a ${POST_TYPE_LABEL[postType].toLowerCase()}.`, skipped };
  }

  const postId = retryId ?? crypto.randomUUID();
  const accountIds = JSON.stringify(targets.map((target) => target.accountId));
  const skippedText = skipped.length > 0 ? skipped.join("\n") : null;
  const scheduledFor = input.mode === "scheduled" ? input.scheduledFor : null;
  if (retryId) {
    await sql.run(
      `UPDATE social_posts
       SET account_ids = ?, mode = ?, post_type = ?, skipped = ?, scheduled_for = ?, timezone = ?, status = 'sending', error = NULL, updated_at = ?
       WHERE id = ?`,
      [accountIds, input.mode, postType, skippedText, scheduledFor, input.timezone || null, now, postId],
    );
  } else {
    await sql.run(
      `INSERT INTO social_posts (
         id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, skipped, scheduled_for,
         timezone, status, zernio_post_id, error, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', NULL, NULL, ?, ?, ?)`,
      [
        postId,
        item.organization_id,
        item.deliverable_id,
        item.id,
        item.version,
        accountIds,
        input.mode,
        postType,
        skippedText,
        scheduledFor,
        input.timezone || null,
        caller.userId,
        now,
        now,
      ],
    );
  }

  try {
    const name = item.id.slice(0, 8);
    const poster = media.poster ? await uploadMedia(zernio, store, media.poster, name) : null;
    const mediaItems: ZernioMediaItem[] = [];
    for (const file of orderedMedia(media.items, sharedMediaOrder(variants))) {
      const url = await uploadMedia(zernio, store, file, name);
      mediaItems.push(file.kind === "video" && poster ? { type: "video", url, thumbnail: poster } : { type: file.kind, url });
    }
    if (poster) {
      for (const target of targets) {
        if (target.platform === "instagram" && media.items.some((file) => file.kind === "video")) {
          target.platformSpecificData = { ...target.platformSpecificData, instagramThumbnail: poster };
        }
      }
    }
    const created = await zernio.createPost({
      content,
      title: postedTitle(targets, item.title),
      profileId: profile.zernio_profile_id,
      ...(postTags.length > 0 ? { tags: postTags } : {}),
      platforms: targets,
      mediaItems,
      timezone: input.timezone || "UTC",
      ...(input.mode === "draft" ? { isDraft: true } : {}),
      ...(input.mode === "now" ? { publishNow: true } : {}),
      ...(input.mode === "scheduled" && input.scheduledFor != null
        ? { scheduledFor: new Date(input.scheduledFor).toISOString() }
        : {}),
    });
    const status = statusFrom(created.status, input.mode);
    const gate = readCommandGate(caller);
    const actorKind = gate ? (gate.kind === "client" ? "system" : gate.kind) : caller.userId ? "staff" : "system";
    const actorId = gate ? gate.id : caller.userId;
    const activityData = gate
      ? { socialPostId: postId, zernioPostId: created._id, postType, actorKind: gate.kind }
      : { socialPostId: postId, zernioPostId: created._id, postType };
    await sql.batch([
      {
        statement: "UPDATE social_posts SET zernio_post_id = ?, status = ?, updated_at = ? WHERE id = ?",
        params: [created._id, status, Date.now(), postId],
      },
      {
        statement: `INSERT INTO activities (
          id, organization_id, project_id, workspace_id, kind, actor_kind, actor_id, body, data_json, created_at
        ) VALUES (?, ?, ?, ?, 'social.post', ?, ?, ?, ?, ?)`,
        params: [
          crypto.randomUUID(),
          item.organization_id,
          item.project_id,
          item.workspace_id,
          actorKind,
          actorId,
          `${input.mode === "draft" ? "Saved a draft of" : input.mode === "now" ? "Posted" : "Scheduled"} "${item.title}" to ${targets.length} account${targets.length === 1 ? "" : "s"}.`,
          JSON.stringify(activityData),
          now,
        ],
      },
    ]);
    const targetOutcome: TargetOutcome =
      status === "published" || status === "partial"
        ? "succeeded"
        : status === "failed"
          ? "failed"
          : status === "draft" || status === "scheduled"
            ? "scheduled"
            : "publishing";
    await syncPostTargets(
      sql,
      postId,
      item.organization_id,
      targets.map((target) => ({ accountId: target.accountId, platform: target.platform })),
      targetOutcome,
      now,
    );
    return { ok: true, postId, status, sentTo: targets.length, skipped };
  } catch (error) {
    const message = errorText(error);
    const linked = targets.map((target) => ({ accountId: target.accountId, platform: target.platform }));
    if (providerUncertain(error)) {
      await syncPostTargets(sql, postId, item.organization_id, linked, "uncertain", Date.now());
      return { ok: false, error: `"${item.title}" did not send: ${message}`, skipped, postId, uncertain: true };
    }
    await sql.run("UPDATE social_posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", [
      message.slice(0, 1000),
      Date.now(),
      postId,
    ]);
    await syncPostTargets(sql, postId, item.organization_id, linked, "failed", Date.now());
    return { ok: false, error: `"${item.title}" did not send: ${message}`, skipped };
  }
}

/** Schedules one approved piece onto the single active account for its network. */
export async function placeSocialPiece(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  caller: Caller,
  input: { deliverableId: string; itemId: string; startAt: string; timezone: string },
  now: number,
): Promise<SendResult> {
  if (!commandAuthorized(caller)) return { ok: false, error: "You can't do that.", skipped: [] };
  const item = await loadItem(sql, input.deliverableId, input.itemId);
  if (!item) return { ok: false, error: "That piece is not here.", skipped: [] };
  if (item.status !== "approved") return { ok: false, error: `"${item.title}" is not approved by the client yet.`, skipped: [] };
  const failed = await sql.get<{ id: string }>(
    "SELECT id FROM social_posts WHERE item_id = ? AND version = ? AND status = 'failed' LIMIT 1",
    [item.id, item.version],
  );
  if (failed) return { ok: false, error: "This piece already has a failed post. Retry it from the day.", skipped: [] };
  const channel = item.channel?.trim() ?? "";
  if (!channel) return { ok: false, error: "This piece has no network.", skipped: [] };
  const accounts = await sql.all<{ id: string }>(
    "SELECT id FROM social_accounts WHERE organization_id = ? AND is_active = 1 AND platform = ?",
    [item.organization_id, channel],
  );
  if (accounts.length !== 1) return { ok: false, error: `No single ${channel} account can take this piece.`, skipped: [] };
  const at = zonedTimeToUtc(input.startAt, input.timezone);
  if (at == null) return { ok: false, error: "Pick a date and time.", skipped: [] };
  return sendPiece(
    sql,
    zernio,
    store,
    caller,
    {
      deliverableId: item.deliverable_id,
      itemId: item.id,
      accountIds: [accounts[0].id],
      mode: "scheduled",
      postType: null,
      scheduledFor: at,
      timezone: input.timezone,
    },
    now,
  );
}

export async function retryFailedSocialPost(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  caller: Caller,
  postId: string,
  now: number,
): Promise<SendResult> {
  const post = await sql.get<{ id: string; deliverable_id: string; item_id: string; account_ids: string; post_type: string; scheduled_for: number | null; timezone: string | null; status: string }>(
    "SELECT id, deliverable_id, item_id, account_ids, post_type, scheduled_for, timezone, status FROM social_posts WHERE id = ?",
    [postId],
  );
  if (!post || post.status !== "failed") return { ok: false, error: "That post cannot be retried.", skipped: [] };
  let accountIds: string[] = [];
  try {
    const parsed = JSON.parse(post.account_ids) as unknown;
    accountIds = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    accountIds = [];
  }
  return sendPiece(
    sql,
    zernio,
    store,
    caller,
    {
      deliverableId: post.deliverable_id,
      itemId: post.item_id,
      accountIds,
      mode: "scheduled",
      postType: (post.post_type as PostType) || null,
      scheduledFor: post.scheduled_for,
      timezone: post.timezone || "UTC",
      retryPostId: post.id,
    },
    now,
  );
}

export type SendAllInput = {
  deliverableId: string;
  itemIds: string[];
  accountIds: string[];
  mode: SendMode;
  postType: PostType | null;
  /** First piece's time for mode "scheduled". Each next piece is gapMinutes later. */
  startAt: number | null;
  gapMinutes: number;
  timezone: string;
};

export type SendAllResult = { sent: number; failed: { title: string; error: string }[]; skipped: string[] };

/** Select-all: sends every chosen piece of one finished-work round, in board order, spaced from startAt. */
export async function sendPieces(
  sql: Sql,
  zernio: ZernioClient,
  store: ObjectStore,
  caller: Caller,
  input: SendAllInput,
  now: number,
): Promise<SendAllResult> {
  const wanted = new Set(input.itemIds);
  const ordered = (
    await sql.all<{ id: string; title: string }>(
      `SELECT i.id, i.title FROM deliverable_items i JOIN deliverables d ON d.id = i.deliverable_id
       WHERE i.deliverable_id = ? AND i.version = d.version ORDER BY i.sort, i.title`,
      [input.deliverableId],
    )
  ).filter((row) => wanted.has(row.id));
  const times =
    input.mode === "scheduled" && input.startAt != null ? spacedTimes(input.startAt, input.gapMinutes, ordered.length) : [];
  const result: SendAllResult = { sent: 0, failed: [], skipped: [] };
  for (const [index, piece] of ordered.entries()) {
    const sent = await sendPiece(
      sql,
      zernio,
      store,
      caller,
      {
        deliverableId: input.deliverableId,
        itemId: piece.id,
        accountIds: input.accountIds,
        mode: input.mode,
        postType: input.postType,
        scheduledFor: times[index] ?? null,
        timezone: input.timezone,
      },
      now,
    );
    result.skipped.push(...sent.skipped.map((line) => `"${piece.title}" ${line}`));
    if (sent.ok) result.sent += 1;
    else result.failed.push({ title: piece.title, error: sent.error });
  }
  return result;
}

export async function listSocialPosts(
  sql: Sql,
  filter: { organizationId?: string; deliverableId?: string },
  limit = 50,
): Promise<SocialPost[]> {
  const where = filter.deliverableId ? "p.deliverable_id = ?" : "p.organization_id = ?";
  return sql.all<SocialPost>(
    `SELECT p.id, p.organization_id, p.deliverable_id, p.item_id, p.version, p.account_ids, p.mode, p.post_type,
       p.skipped, p.scheduled_for, p.timezone, p.status, p.zernio_post_id, p.error, p.published_urls, p.created_at, p.updated_at,
       i.title AS item_title, d.title AS deliverable_title
     FROM social_posts p
     JOIN deliverable_items i ON i.id = p.item_id
     JOIN deliverables d ON d.id = p.deliverable_id
     WHERE ${where}
     ORDER BY COALESCE(p.scheduled_for, p.created_at) DESC, p.created_at DESC
     LIMIT ?`,
    [filter.deliverableId ?? filter.organizationId ?? "", limit],
  );
}

function accountIdOf(target: ZernioPostPlatform): string {
  if (typeof target.accountId === "string") return target.accountId;
  return target.accountId?._id ?? "";
}

/** Status, per-network errors, and public links from Zernio's view of one post. */
export function postOutcome(
  post: { status?: string; platforms?: ZernioPostPlatform[] },
  mode: SendMode,
): { status: PostStatus; error: string | null; urls: Record<string, string> } {
  const status = statusFrom(post.status, mode);
  const targets = post.platforms ?? [];
  const failures = targets
    .filter((target) => target.status === "failed" && (target.errorMessage || target.error))
    .map((target) => `${PLATFORM_LABEL[target.platform] ?? target.platform}: ${target.errorMessage ?? target.error}`);
  const urls: Record<string, string> = {};
  for (const target of targets) {
    const url = target.publishedUrl || target.platformPostUrl;
    const id = accountIdOf(target);
    if (url && id && /^https:\/\//.test(url)) urls[id] = url;
  }
  return {
    status,
    error: failures.length > 0 ? failures.join("\n").slice(0, 1000) : String(post.status).toLowerCase() === "cancelled" ? "Cancelled in Zernio." : null,
    urls,
  };
}

/** One outcome row per local post and account. Later reconciliations update the same row. */
export async function syncPostTargets(
  sql: Sql,
  postId: string,
  organizationId: string,
  targets: { accountId: string; platform: string }[],
  outcome: TargetOutcome,
  now: number,
  urls?: Record<string, string>,
): Promise<void> {
  for (const target of targets) {
    const publicUrl = urls?.[target.accountId] ?? null;
    await sql.run(
      `INSERT INTO social_post_targets (
         id, post_id, organization_id, account_id, platform, outcome, public_url, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (post_id, account_id) DO UPDATE SET
         outcome = excluded.outcome,
         public_url = COALESCE(excluded.public_url, social_post_targets.public_url),
         updated_at = excluded.updated_at`,
      [crypto.randomUUID(), postId, organizationId, target.accountId, target.platform, outcome, publicUrl, now],
    );
  }
  await reconcilePostedTargets(sql, postId, organizationId, targets, outcome, now);
}

/** Writes Zernio's view of a post onto our row. Links already known are kept. */
export async function recordOutcome(
  sql: Sql,
  rowId: string,
  outcome: { status: PostStatus; error: string | null; urls: Record<string, string> },
  now: number,
): Promise<void> {
  const current = await sql.get<{ published_urls: string | null; account_ids: string; organization_id: string }>(
    "SELECT published_urls, account_ids, organization_id FROM social_posts WHERE id = ?",
    [rowId],
  );
  let urls: Record<string, string> = {};
  try {
    urls = current?.published_urls ? (JSON.parse(current.published_urls) as Record<string, string>) : {};
  } catch {
    urls = {};
  }
  const merged = { ...urls, ...outcome.urls };
  await sql.run("UPDATE social_posts SET status = ?, error = ?, published_urls = ?, updated_at = ? WHERE id = ?", [
    outcome.status,
    outcome.error,
    Object.keys(merged).length > 0 ? JSON.stringify(merged) : null,
    now,
    rowId,
  ]);
  if (!current) return;
  let accountIds: string[] = [];
  try {
    accountIds = JSON.parse(current.account_ids) as string[];
  } catch {
    accountIds = [];
  }
  if (accountIds.length === 0) return;
  const accounts = await sql.all<{ id: string; platform: string }>(
    `SELECT id, platform FROM social_accounts WHERE id IN (${accountIds.map(() => "?").join(", ")})`,
    accountIds,
  );
  const platformOf = new Map(accounts.map((account) => [account.id, account.platform]));
  for (const accountId of accountIds) {
    const platform = platformOf.get(accountId);
    if (!platform) continue;
    const targetOutcome: TargetOutcome =
      outcome.status === "published"
        ? "succeeded"
        : outcome.status === "partial"
          ? outcome.urls[accountId]
            ? "succeeded"
            : "failed"
          : outcome.status === "failed"
            ? "failed"
            : outcome.status === "scheduled" || outcome.status === "draft"
              ? "scheduled"
              : "publishing";
    await syncPostTargets(sql, rowId, current.organization_id, [{ accountId, platform }], targetOutcome, now, outcome.urls);
  }
}

type Waiting = { id: string; zernio_post_id: string; mode: SendMode };

async function refreshRows(sql: Sql, zernio: ZernioClient, rows: Waiting[], now: number): Promise<number> {
  let changed = 0;
  for (const row of rows) {
    try {
      const post = await zernio.getPost(row.zernio_post_id);
      await recordOutcome(sql, row.id, postOutcome(post, row.mode), now);
      changed += 1;
    } catch {
      continue;
    }
  }
  return changed;
}

/** Asks Zernio for the status of this client's posts that are still waiting to go out. */
export async function refreshSocialPosts(sql: Sql, zernio: ZernioClient, organizationId: string, now: number): Promise<number> {
  const waiting = await sql.all<Waiting>(
    `SELECT id, zernio_post_id, mode FROM social_posts
     WHERE organization_id = ? AND zernio_post_id IS NOT NULL AND status IN ('sending', 'scheduled')
     AND (scheduled_for IS NULL OR scheduled_for <= ?)
     ORDER BY updated_at LIMIT 20`,
    [organizationId, now + 60_000],
  );
  return refreshRows(sql, zernio, waiting, now);
}

/**
 * Cron fallback for missed webhooks: posts due in the last six hours that still read sending or scheduled,
 * across every client, oldest check first.
 */
export async function refreshDueSocialPosts(sql: Sql, zernio: ZernioClient, now: number, limit = 25): Promise<number> {
  const waiting = await sql.all<Waiting>(
    `SELECT id, zernio_post_id, mode FROM social_posts
     WHERE zernio_post_id IS NOT NULL AND status IN ('sending', 'scheduled')
     AND COALESCE(scheduled_for, created_at) BETWEEN ? AND ?
     AND updated_at <= ?
     ORDER BY updated_at LIMIT ?`,
    [now - 6 * 3_600_000, now, now - 120_000, limit],
  );
  return refreshRows(sql, zernio, waiting, now);
}

async function ownPost(sql: Sql, caller: Caller, postId: string): Promise<SocialPost | null> {
  if (!commandAuthorized(caller)) return null;
  const row = await sql.get<SocialPost>(
    `SELECT id, organization_id, deliverable_id, item_id, version, account_ids, mode, post_type, skipped, scheduled_for,
       timezone, status, zernio_post_id, error, published_urls, created_at, updated_at FROM social_posts WHERE id = ?`,
    [postId],
  );
  return row ?? null;
}

/** Moves a scheduled post to a new time (calendar drag or the Move form). */
export async function rescheduleSocialPost(
  sql: Sql,
  zernio: ZernioClient,
  caller: Caller,
  input: { postId: string; scheduledFor: number; timezone: string },
  now: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await ownPost(sql, caller, input.postId);
  if (!row || !row.zernio_post_id) return { ok: false, error: "That post is not here." };
  if (row.status !== "scheduled") return { ok: false, error: "Only a scheduled post can move." };
  if (input.scheduledFor < now + 60_000) return { ok: false, error: "Pick a time at least one minute from now." };
  try {
    await zernio.reschedulePost(row.zernio_post_id, new Date(input.scheduledFor).toISOString(), input.timezone || "UTC");
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
  await sql.run("UPDATE social_posts SET scheduled_for = ?, timezone = ?, updated_at = ? WHERE id = ?", [
    input.scheduledFor,
    input.timezone || "UTC",
    now,
    row.id,
  ]);
  return { ok: true };
}

/** Takes a scheduled post or a draft off Zernio. It stays on our list as cancelled. */
export async function cancelSocialPost(
  sql: Sql,
  zernio: ZernioClient,
  caller: Caller,
  postId: string,
  now: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await ownPost(sql, caller, postId);
  if (!row || !row.zernio_post_id) return { ok: false, error: "That post is not here." };
  if (row.status !== "scheduled" && row.status !== "draft") return { ok: false, error: "Only a scheduled post or a draft can be cancelled." };
  try {
    await zernio.deletePost(row.zernio_post_id);
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
  await sql.run("UPDATE social_posts SET status = 'failed', error = 'Cancelled.', updated_at = ? WHERE id = ?", [now, row.id]);
  return { ok: true };
}
