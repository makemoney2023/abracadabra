import type { Sql } from "@/db/sql";
import type { PostPreviewData } from "@/components/social/post-preview-model";
import { postOnCalendar } from "@/components/social/social-board";
import { PLATFORM_LABEL } from "./zernio";
import { reviewMedia } from "./social-review";
import type { SocialAccount, SocialPost } from "./social";

const CHUNK = 50;

type ItemRow = { id: string; format: string; copy_text: string | null; media_json: string; status: string };
type SettingsRow = { item_id: string; texts_json: string };
type VariantRow = { item_id: string; version: number; platform: string; caption: string | null };

async function inChunks<T>(ids: string[], read: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += CHUNK) rows.push(...(await read(ids.slice(start, start + CHUNK))));
  return rows;
}

function marks(ids: string[]): string {
  return ids.map(() => "?").join(", ");
}

function parseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function parseUrls(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && /^https:\/\//.test(entry[1])));
  } catch {
    return {};
  }
}

function parseTexts(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0));
  } catch {
    return {};
  }
}

/**
 * What the calendar preview shows for each post on the calendar: the text and media the post was made from,
 * the accounts, and where it went. Reads only rows that belong to the posts it is given.
 * Failure text and skip notes are staff-only, because they can name the publishing provider.
 */
export async function loadPostPreviews(
  sql: Sql,
  posts: SocialPost[],
  accounts: SocialAccount[],
  options: { staff: boolean },
): Promise<Record<string, PostPreviewData>> {
  const shown = posts.filter((post) => postOnCalendar({ status: post.status, error: post.error, scheduledFor: post.scheduled_for }));
  if (shown.length === 0) return {};
  const itemIds = [...new Set(shown.map((post) => post.item_id))];
  const items = new Map(
    (await inChunks(itemIds, (chunk) =>
      sql.all<ItemRow>(`SELECT id, format, copy_text, media_json, status FROM deliverable_items WHERE id IN (${marks(chunk)})`, chunk),
    )).map((row) => [row.id, row]),
  );
  const settings = new Map(
    (await inChunks(itemIds, (chunk) =>
      sql.all<SettingsRow>(`SELECT item_id, texts_json FROM social_piece_settings WHERE item_id IN (${marks(chunk)})`, chunk),
    )).map((row) => [row.item_id, parseTexts(row.texts_json)]),
  );
  const variants = await inChunks(itemIds, (chunk) =>
    sql.all<VariantRow>(`SELECT item_id, version, platform, caption FROM social_variants WHERE item_id IN (${marks(chunk)})`, chunk),
  );
  const byAccount = new Map(accounts.map((account) => [account.id, account]));
  const result: Record<string, PostPreviewData> = {};
  for (const post of shown) {
    const item = items.get(post.item_id);
    const posted = parseIds(post.account_ids).map((id) => {
      const account = byAccount.get(id);
      const name = account?.display_name ?? account?.username ?? id;
      return { id, platform: account?.platform ?? "", name, label: account ? `${PLATFORM_LABEL[account.platform] ?? account.platform} · ${name}` : id };
    });
    const caption = (item?.copy_text ?? "").trim();
    const captions: Record<string, string> = {};
    for (const account of posted) {
      if (!account.platform) continue;
      const own = variants.find((row) => row.item_id === post.item_id && row.version === post.version && row.platform === account.platform)?.caption?.trim();
      const text = own || settings.get(post.item_id)?.[account.platform]?.trim();
      if (text) captions[account.platform] = text;
    }
    const platformOf = new Map(posted.map((account) => [account.id, account.platform]));
    result[post.id] = {
      postId: post.id,
      itemId: post.item_id,
      deliverableId: post.deliverable_id,
      deliverableTitle: post.deliverable_title ?? "",
      title: post.item_title ?? "Post",
      status: post.status,
      postType: post.post_type,
      format: item?.format ?? "static",
      scheduledFor: post.scheduled_for,
      timezone: post.timezone || "UTC",
      accounts: posted,
      caption,
      captions,
      media: item ? reviewMedia(item.media_json) : [],
      pieceStatus: item?.status ?? null,
      hasScheduledCopy: Boolean(post.zernio_post_id),
      error: options.staff && post.error && post.error !== "Cancelled." ? post.error : null,
      skipped: options.staff ? post.skipped : null,
      publishedLinks: Object.entries(parseUrls(post.published_urls)).map(([accountId, url]) => ({ platform: platformOf.get(accountId) ?? "", url })),
    };
  }
  return result;
}
