import type { Caller } from "./authz";
import type { ItemFormat } from "./deliverable-manifest";
import type { Sql } from "@/db/sql";
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
  | { ok: false; error: string; skipped: string[] };

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
  status: "pending" | "approved" | "changes_requested";
  sort: number;
  organization_id: string;
  project_id: string | null;
  workspace_id: string;
  deliverable_title: string;
};

async function loadItem(sql: Sql, deliverableId: string, itemId: string): Promise<ItemRow | undefined> {
  return sql.get<ItemRow>(
    `SELECT i.id, i.deliverable_id, i.version, i.format, i.title, i.copy_text, i.media_json, i.status, i.sort,
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

export async function pieceSettings(sql: Sql, itemId: string): Promise<PieceSettings> {
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

/** Saves the per-network text, first comment, and YouTube tags kept with one piece. Staff only. */
export async function savePieceSettings(
  sql: Sql,
  caller: Caller,
  itemId: string,
  input: { texts: Record<string, string>; firstComment: string; tags: string },
  now: number,
): Promise<boolean> {
  if (!caller.staff) return false;
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
};

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
  if (!caller.staff) return { ok: false, error: "You can't do that.", skipped: [] };
  const item = await loadItem(sql, input.deliverableId, input.itemId);
  if (!item) return { ok: false, error: "That piece is not here.", skipped: [] };
  if (input.mode !== "draft" && item.status !== "approved") {
    return { ok: false, error: `"${item.title}" is not approved by the client yet. Save it as a draft instead.`, skipped: [] };
  }
  if (input.mode === "scheduled" && (input.scheduledFor == null || input.scheduledFor < now + 60_000)) {
    return { ok: false, error: "Pick a time at least one minute from now.", skipped: [] };
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
  const skipped: string[] = [];
  const targets: ZernioPostTarget[] = [];
  for (const account of accounts) {
    const label = `${PLATFORM_LABEL[account.platform] ?? account.platform} ${account.username ?? ""}`.trim();
    if (input.mode !== "draft" && sentBefore.has(account.id)) {
      skipped.push(`${label}: already has this piece.`);
      continue;
    }
    const plan = planTarget(account.platform, postType, media.items, item.title);
    if (!plan.ok) {
      skipped.push(`${label}: ${plan.reason}`);
      continue;
    }
    const comment =
      settings.firstComment && postType !== "story" && FIRST_COMMENT_PLATFORMS.has(account.platform)
        ? { firstComment: settings.firstComment }
        : {};
    const specific = { ...plan.platformSpecificData, ...comment };
    const text = settings.texts[account.platform];
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

  const postId = crypto.randomUUID();
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
      JSON.stringify(targets.map((target) => target.accountId)),
      input.mode,
      postType,
      skipped.length > 0 ? skipped.join("\n") : null,
      input.mode === "scheduled" ? input.scheduledFor : null,
      input.timezone || null,
      caller.userId,
      now,
      now,
    ],
  );

  try {
    const name = item.id.slice(0, 8);
    const poster = media.poster ? await uploadMedia(zernio, store, media.poster, name) : null;
    const mediaItems: ZernioMediaItem[] = [];
    for (const file of media.items) {
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
      title: item.title.slice(0, 100),
      profileId: profile.zernio_profile_id,
      ...(settings.tags.length > 0 ? { tags: settings.tags } : {}),
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
          caller.userId ? "staff" : "system",
          caller.userId,
          `${input.mode === "draft" ? "Saved a draft of" : input.mode === "now" ? "Posted" : "Scheduled"} "${item.title}" to ${targets.length} account${targets.length === 1 ? "" : "s"}.`,
          JSON.stringify({ socialPostId: postId, zernioPostId: created._id, postType }),
          now,
        ],
      },
    ]);
    return { ok: true, postId, status, sentTo: targets.length, skipped };
  } catch (error) {
    const message = errorText(error);
    await sql.run("UPDATE social_posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", [
      message.slice(0, 1000),
      Date.now(),
      postId,
    ]);
    return { ok: false, error: `"${item.title}" did not send: ${message}`, skipped };
  }
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

/** Writes Zernio's view of a post onto our row. Links already known are kept. */
export async function recordOutcome(
  sql: Sql,
  rowId: string,
  outcome: { status: PostStatus; error: string | null; urls: Record<string, string> },
  now: number,
): Promise<void> {
  const current = await sql.get<{ published_urls: string | null }>("SELECT published_urls FROM social_posts WHERE id = ?", [rowId]);
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
  if (!caller.staff) return null;
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
