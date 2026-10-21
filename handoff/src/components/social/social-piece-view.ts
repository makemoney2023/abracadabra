import type { ItemFormat } from "@/lib/deliverable-manifest";
import { defaultPostType, pieceMedia, type PostType } from "@/lib/social-plan";

const SOCIAL_FORMATS = new Set<string>(["video", "static", "carousel", "story", "ad_video", "ad_static", "ad_carousel"]);

export function isSocialItemFormat(format: string): boolean {
  return SOCIAL_FORMATS.has(format);
}

export type PieceTarget = {
  platform: string;
  outcome: string;
  url?: string;
  attention?: boolean;
};

export type PieceCardInput = {
  title: string;
  format: string;
  caption: string;
  mediaJson: string;
  status: string;
  targets: PieceTarget[];
  scheduledFor?: number;
  timezone?: string;
  warnings?: string[];
  durationSeconds?: number;
  aspectRatio?: string;
  safeArea?: string;
  postType?: string;
};

export type PieceCardView = {
  title: string;
  postType: PostType;
  approval: "approved" | "needs_changes" | "pending";
  nextAction: string;
  captionExcerpt: string;
  publishing: "partial" | "published" | "unpublished";
  publishedLinks: { platform: string; url: string }[];
  attentionTargets: { platform: string }[];
  priorOutcomesKept: boolean;
  warnings: string[];
  scheduleLabel: string | null;
  preview: {
    kind: "image" | "carousel" | "reel" | "short" | "story";
    roles: string[];
    cropRole: string | null;
    posterRole: string | null;
    durationSeconds: number | null;
    aspectRatio: string | null;
    safeArea: string | null;
    vertical: boolean;
  };
};

function excerpt(caption: string): string {
  const trimmed = caption.trim();
  const limit = 48;
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit).trimEnd()}…`;
}

function approvalOf(status: string): PieceCardView["approval"] {
  if (status === "approved") return "approved";
  if (status === "changes_requested") return "needs_changes";
  return "pending";
}

/** Finished-work card: media stays with the caption, and a partial post stays partial. */
export function pieceCardView(input: PieceCardInput): PieceCardView {
  const media = pieceMedia(input.mediaJson);
  const postType = (input.postType as PostType | undefined) ?? defaultPostType(input.format as ItemFormat, media);
  const kind =
    postType === "short" || postType === "reel" || postType === "carousel" || postType === "story" ? postType : "image";
  const vertical = kind === "reel" || kind === "short" || input.aspectRatio === "9:16";
  const publishedLinks = input.targets.flatMap((target) =>
    target.outcome === "succeeded" && target.url ? [{ platform: target.platform, url: target.url }] : [],
  );
  const attentionTargets = input.targets.flatMap((target) => (target.attention ? [{ platform: target.platform }] : []));
  const failed = input.targets.some((target) => target.outcome === "failed" || target.attention);
  const publishing = publishedLinks.length > 0 && failed ? "partial" : publishedLinks.length > 0 ? "published" : "unpublished";
  const nextAction =
    attentionTargets.length > 0 ? "Review attention" : input.status === "changes_requested" ? "Send for review" : input.status === "approved" ? "Schedule" : "Send for review";
  const square = input.mediaJson.includes('"role":"square"') || input.mediaJson.includes('"role": "square"');
  return {
    title: input.title,
    postType,
    approval: approvalOf(input.status),
    nextAction,
    captionExcerpt: excerpt(input.caption),
    publishing,
    publishedLinks,
    attentionTargets,
    priorOutcomesKept: input.status === "changes_requested",
    warnings: input.warnings ?? [],
    scheduleLabel: input.scheduledFor == null ? null : new Date(input.scheduledFor).toISOString(),
    preview: {
      kind,
      roles: media.items.map((item) => item.role),
      cropRole: square ? "square" : null,
      posterRole: media.poster ? media.poster.role : null,
      durationSeconds: input.durationSeconds ?? null,
      aspectRatio: input.aspectRatio ?? (kind === "reel" || kind === "short" ? "9:16" : null),
      safeArea: input.safeArea ?? null,
      vertical,
    },
  };
}

export type CollectionPiece = { status: string; scheduled: boolean };

/** Counts for a finished-work round. Approved means the item is approved, whether or not it has a slot. */
export function collectionSummary(items: CollectionPiece[]): {
  approved: number;
  needsChanges: number;
  unscheduled: number;
  actions: ["Send for review", "Schedule approved"];
} {
  return {
    approved: items.filter((item) => item.status === "approved").length,
    needsChanges: items.filter((item) => item.status === "changes_requested").length,
    unscheduled: items.filter((item) => item.status === "approved" && !item.scheduled).length,
    actions: ["Send for review", "Schedule approved"],
  };
}
