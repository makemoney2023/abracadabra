import type { ItemFormat } from "./deliverable-manifest";
import { defaultPostType, planTarget, spacedTimes, type MediaKind, type PlannedMedia, type PostType } from "./social-plan";
import { isEligibleSocialPlatform } from "./zernio";

export type PreflightPiece = {
  id: string;
  version: number;
  currentVersion: number;
  title: string;
  format: ItemFormat;
  approved: boolean;
  media: PlannedMedia[];
  poster: PlannedMedia | null;
  youtubeTitle?: string;
  tags?: string[];
  firstComment?: string;
};

export type PreflightAccount = { id: string; platform: string; active: boolean };
export type PreflightLive = { itemId: string; version: number; accountId: string };

export type PreflightTiming =
  | { kind: "draft" }
  | { kind: "now"; now: number }
  | { kind: "scheduled"; startAt: number; gapMinutes: number; now: number }
  | { kind: "cadence"; slots: number[]; takenSlots: number[]; now: number };

export type PreflightOptions = { itemId: string; accountId?: string; platform?: string; options: Record<string, unknown> };
export type PostTypeOverride = { itemId: string; accountId?: string; postType: PostType };

export type MediaSummary = { count: number; kinds: MediaKind[]; keys: string[] };

export type PreflightRow = {
  itemId: string;
  version: number;
  accountId: string;
  platform: string;
  postType: PostType;
  eligible: boolean;
  reason: string | null;
  scheduleAt: number | null;
  media: MediaSummary;
  options: Record<string, unknown>;
};

export type PreflightResult = {
  executable: PreflightRow[];
  blocked: PreflightRow[];
  warnings: { itemId: string; accountId: string; reason: string }[];
  reason: string | null;
};

const OPTION_KEYS: Record<string, ReadonlySet<string>> = {
  instagram: new Set(["shareToFeed", "contentType", "instagramThumbnail"]),
  facebook: new Set(["contentType"]),
  youtube: new Set(["title", "visibility", "madeForKids", "tags"]),
  tiktok: new Set([
    "draft",
    "mediaType",
    "allowComment",
    "allowDuet",
    "allowStitch",
    "commercialContentType",
    "contentPreviewConfirmed",
    "expressConsentGiven",
  ]),
};

const LEAD_MS = 60_000;

/** Option keys Zernio accepts for one network. Anything else is rejected on a variant save. */
export function allowedSocialOptionKeys(platform: string): ReadonlySet<string> {
  return OPTION_KEYS[platform] ?? new Set<string>();
}

/** Names that are not allowlisted, plus TikTok `draft: false` (draft-first stays on). */
export function unsupportedSocialOptionKeys(platform: string, options: Record<string, unknown>): string[] {
  const allowed = allowedSocialOptionKeys(platform);
  const rejected = Object.keys(options).filter((key) => !allowed.has(key));
  if (platform === "tiktok" && options.draft === false) rejected.push("draft");
  return rejected;
}

function summary(media: PlannedMedia[], poster: PlannedMedia | null): MediaSummary {
  const keys = media.map((row) => row.key);
  if (poster && !keys.includes(poster.key)) keys.push(poster.key);
  return { count: media.length, kinds: [...new Set(media.map((row) => row.kind))], keys };
}

function emptyRow(itemId: string, accountId: string, platform: string, version: number, reason: string): PreflightRow {
  return {
    itemId,
    version,
    accountId,
    platform,
    postType: "feed",
    eligible: false,
    reason,
    scheduleAt: null,
    media: { count: 0, kinds: [], keys: [] },
    options: {},
  };
}

function chosenType(piece: PreflightPiece, account: PreflightAccount, overrides: PostTypeOverride[]): { postType: PostType; explicit: boolean } {
  const match = [...overrides].reverse().find((row) => row.itemId === piece.id && (!row.accountId || row.accountId === account.id));
  if (match) return { postType: match.postType, explicit: true };
  const fallback = defaultPostType(piece.format, { items: piece.media, poster: piece.poster });
  if (account.platform === "youtube" && fallback === "reel") return { postType: "short", explicit: false };
  return { postType: fallback, explicit: false };
}

function mergedOptions(
  platform: string,
  base: Record<string, unknown>,
  supplied: PreflightOptions[],
): { options: Record<string, unknown>; unsupported: boolean } {
  const allowed = OPTION_KEYS[platform] ?? new Set<string>();
  const options = { ...base };
  let unsupported = false;
  for (const entry of supplied) {
    for (const [key, value] of Object.entries(entry.options)) {
      if (!allowed.has(key)) unsupported = true;
      else options[key] = value;
    }
  }
  if (platform === "tiktok" && options.draft === false) unsupported = true;
  if (platform === "tiktok") options.draft = true;
  return { options, unsupported };
}

function scheduleAt(timing: PreflightTiming, pieceIndex: number, pieceCount: number): number | null {
  if (timing.kind === "draft") return null;
  if (timing.kind === "now") return timing.now;
  if (timing.kind === "scheduled") return spacedTimes(timing.startAt, timing.gapMinutes, pieceCount)[pieceIndex] ?? null;
  return timing.slots[pieceIndex] ?? null;
}

function timingReason(timing: PreflightTiming, at: number | null): string | null {
  if (timing.kind === "scheduled") {
    if (at === null || at < timing.now + LEAD_MS) return "too_soon";
  }
  if (timing.kind === "cadence") {
    if (at === null) return "cadence_conflict";
    const clash = timing.takenSlots.some((slot) => Math.abs(slot - at) < LEAD_MS);
    if (clash) return "cadence_conflict";
  }
  return null;
}

export function preflight(input: {
  mode: "explicit" | "eligible";
  itemIds: string[];
  accountIds: string[];
  pieces: PreflightPiece[];
  accounts: PreflightAccount[];
  live: PreflightLive[];
  timing: PreflightTiming;
  overrides?: PostTypeOverride[];
  options?: PreflightOptions[];
}): PreflightResult {
  if (input.itemIds.length === 0 || input.accountIds.length === 0) {
    return { executable: [], blocked: [], warnings: [], reason: "selection_required" };
  }
  const pieces = new Map(input.pieces.map((row) => [row.id, row]));
  const accounts = new Map(input.accounts.map((row) => [row.id, row]));
  const executable: PreflightRow[] = [];
  const blocked: PreflightRow[] = [];
  const warnings: PreflightResult["warnings"] = [];
  const overrides = input.overrides ?? [];

  input.itemIds.forEach((itemId, pieceIndex) => {
    const piece = pieces.get(itemId);
    for (const accountId of input.accountIds) {
      const account = accounts.get(accountId);
      if (!piece || !account) {
        blocked.push(emptyRow(itemId, accountId, account?.platform ?? "", piece?.version ?? 0, "unknown"));
        continue;
      }
      const at = scheduleAt(input.timing, pieceIndex, input.itemIds.length);
      const media = summary(piece.media, piece.poster);
      const fail = (reason: string): void => {
        blocked.push({
          itemId,
          version: piece.version,
          accountId,
          platform: account.platform,
          postType: "feed",
          eligible: false,
          reason,
          scheduleAt: at,
          media,
          options: {},
        });
      };
      if (!isEligibleSocialPlatform(account.platform)) {
        fail("out_of_scope");
        continue;
      }
      if (!account.active) {
        fail("disconnected");
        continue;
      }
      if (piece.version !== piece.currentVersion) {
        fail("stale_version");
        continue;
      }
      if (!piece.approved && input.timing.kind !== "draft") {
        fail("unapproved");
        continue;
      }
      const { postType } = chosenType(piece, account, overrides);
      const title = (piece.youtubeTitle ?? "").trim() || piece.title.trim();
      if (account.platform === "youtube" && !title) {
        fail("missing_title");
        continue;
      }
      const planned = planTarget(account.platform, postType, piece.media, title);
      if (!planned.ok) {
        fail(planned.reason);
        continue;
      }
      const supplied = (input.options ?? []).filter(
        (row) => row.itemId === itemId && (!row.accountId || row.accountId === accountId) && (!row.platform || row.platform === account.platform),
      );
      const merged = mergedOptions(account.platform, planned.platformSpecificData ?? {}, supplied);
      if (merged.unsupported) {
        fail("unsupported_options");
        continue;
      }
      if (input.live.some((row) => row.itemId === itemId && row.version === piece.version && row.accountId === accountId)) {
        fail("duplicate");
        continue;
      }
      const when = timingReason(input.timing, at);
      if (when) {
        fail(when);
        continue;
      }
      if (account.platform === "youtube" && (piece.tags ?? []).length === 0) {
        warnings.push({ itemId, accountId, reason: "missing_tags" });
      }
      if ((piece.firstComment ?? "").length > 2200) {
        warnings.push({ itemId, accountId, reason: "first_comment_too_long" });
      }
      const options = account.platform === "youtube" ? { ...merged.options, title, tags: piece.tags ?? [] } : merged.options;
      executable.push({
        itemId,
        version: piece.version,
        accountId,
        platform: account.platform,
        postType,
        eligible: true,
        reason: null,
        scheduleAt: at,
        media,
        options,
      });
    }
  });

  return { executable, blocked, warnings, reason: null };
}
