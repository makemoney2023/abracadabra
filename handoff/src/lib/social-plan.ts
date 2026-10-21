import type { ItemFormat } from "./deliverable-manifest";
import { PLATFORM_LABEL, isBlogPlatform } from "./zernio";

/** Where the piece lands on the network. The piece's format (static, carousel, video, story) picks the default. */
export const POST_TYPES = ["feed", "carousel", "reel", "story", "short"] as const;
export type PostType = (typeof POST_TYPES)[number];

export const POST_TYPE_LABEL: Record<PostType, string> = {
  feed: "Feed post",
  carousel: "Carousel",
  reel: "Reel",
  story: "Story",
  short: "YouTube Short",
};

const POST_TYPE_SET = new Set<string>(POST_TYPES);

export function asPostType(value: string): PostType | null {
  return POST_TYPE_SET.has(value) ? (value as PostType) : null;
}

export const WEEKDAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type MediaKind = "image" | "video" | "gif" | "document";

export type StoredMedia = { r2_key: string; role: string; content_type: string; size?: number };

export type PlannedMedia = { key: string; contentType: string; role: string; kind: MediaKind };

export type PieceMedia = { items: PlannedMedia[]; poster: PlannedMedia | null };

export function mediaKind(contentType: string): MediaKind | null {
  const type = contentType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (type.startsWith("video/")) return "video";
  if (type === "image/gif") return "gif";
  if (type.startsWith("image/")) return "image";
  if (type === "application/pdf") return "document";
  return null;
}

function stored(mediaJson: string): StoredMedia[] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredMedia =>
        Boolean(entry) &&
        typeof (entry as StoredMedia).r2_key === "string" &&
        typeof (entry as StoredMedia).role === "string" &&
        typeof (entry as StoredMedia).content_type === "string",
    );
  } catch {
    return [];
  }
}

function planned(entry: StoredMedia): PlannedMedia | null {
  const kind = mediaKind(entry.content_type);
  return kind ? { key: entry.r2_key, contentType: entry.content_type, role: entry.role, kind } : null;
}

/**
 * The files a piece sends, in order. Slides send as a carousel (after the main file when there is one).
 * Without slides the main file goes, or the square crop when there is no main. A poster becomes the video cover.
 */
export function pieceMedia(mediaJson: string): PieceMedia {
  const rows = stored(mediaJson);
  const main = rows.find((row) => row.role === "main");
  const square = rows.find((row) => row.role === "square");
  const slides = rows.filter((row) => row.role === "slide");
  const poster = rows.find((row) => row.role === "poster");
  const chosen = slides.length > 0 ? [...(main ? [main] : []), ...slides] : main ? [main] : square ? [square] : [];
  return {
    items: chosen.map(planned).filter((row): row is PlannedMedia => row !== null),
    poster: poster ? planned(poster) : null,
  };
}

export function defaultPostType(format: ItemFormat, media: PieceMedia): PostType {
  if (format === "story") return "story";
  if (media.items.length > 1 || format === "carousel" || format === "ad_carousel") return "carousel";
  if (format === "video" || format === "ad_video" || media.items.some((row) => row.kind === "video")) return "reel";
  return "feed";
}

export type TargetPlan =
  | { ok: true; platformSpecificData?: Record<string, unknown> }
  | { ok: false; reason: string };

type Shape = { count: number; videos: number; pictures: number; documents: number };

function shapeOf(media: PlannedMedia[]): Shape {
  return {
    count: media.length,
    videos: media.filter((row) => row.kind === "video").length,
    pictures: media.filter((row) => row.kind === "image" || row.kind === "gif").length,
    documents: media.filter((row) => row.kind === "document").length,
  };
}

const skip = (reason: string): TargetPlan => ({ ok: false, reason });

/**
 * Whether one network can take this piece as this post type, and the options it needs.
 * Networks with no reels or shorts take a single video as a normal post. Stories go only where stories exist.
 */
export function planTarget(platform: string, postType: PostType, media: PlannedMedia[], title: string): TargetPlan {
  const name = PLATFORM_LABEL[platform] ?? platform;
  if (isBlogPlatform(platform)) return skip(`${name} is a blog. It takes articles, not social posts.`);
  if (platform === "pinterest") return skip("Pinterest is not part of social scheduling.");
  const shape = shapeOf(media);
  const mixed = shape.videos > 0 && shape.pictures > 0;
  const oneVideo = shape.count === 1 && shape.videos === 1;
  if (shape.documents > 0 && platform !== "linkedin") return skip(`${name} does not take PDF files.`);
  if (postType === "story" && shape.count !== 1) return skip("A story needs one picture or one video.");
  if ((postType === "reel" || postType === "short") && !oneVideo) return skip(`A ${POST_TYPE_LABEL[postType].toLowerCase()} needs one video.`);
  if (postType === "carousel" && shape.count < 2) return skip("A carousel needs two or more pictures.");

  switch (platform) {
    case "instagram": {
      if (shape.count === 0) return skip("Instagram needs a picture or a video.");
      if (postType === "story") return { ok: true, platformSpecificData: { contentType: "story" } };
      if (postType === "carousel") {
        if (shape.count > 20) return skip("Instagram carousels take up to 20 files.");
        if (mixed) return skip("Instagram carousels cannot mix pictures and video.");
        return { ok: true };
      }
      if (shape.count > 1) return skip("Pick Carousel to send more than one file to Instagram.");
      if (shape.videos === 1) return { ok: true, platformSpecificData: { shareToFeed: true } };
      return { ok: true };
    }
    case "facebook": {
      if (postType === "story") return { ok: true, platformSpecificData: { contentType: "story" } };
      if (postType === "reel" || postType === "short") return { ok: true, platformSpecificData: { contentType: "reel" } };
      if (mixed) return skip("Facebook cannot mix pictures and video in one post.");
      if (shape.videos > 1) return skip("Facebook takes one video per post.");
      if (shape.pictures > 10) return skip("Facebook takes up to 10 pictures.");
      return { ok: true };
    }
    case "youtube": {
      if (!oneVideo) return skip("YouTube needs one video.");
      if (postType === "story" || postType === "carousel") return skip("YouTube takes videos and Shorts only.");
      return {
        ok: true,
        platformSpecificData: { title: (title || "Untitled video").slice(0, 100), visibility: "public", madeForKids: false },
      };
    }
    case "tiktok": {
      if (postType === "story") return skip("TikTok stories are not supported.");
      if (shape.count === 0) return skip("TikTok needs a video or pictures.");
      if (mixed) return skip("TikTok cannot mix pictures and video.");
      if (shape.videos > 1) return skip("TikTok takes one video per post.");
      if (shape.pictures > 35) return skip("TikTok takes up to 35 pictures.");
      return {
        ok: true,
        platformSpecificData: {
          draft: true,
          mediaType: shape.videos === 1 ? "video" : "photo",
          allowComment: true,
          allowDuet: true,
          allowStitch: true,
          commercialContentType: "none",
          contentPreviewConfirmed: true,
          expressConsentGiven: true,
        },
      };
    }
    case "linkedin": {
      if (postType === "story") return skip("LinkedIn has no stories.");
      if (mixed || shape.videos > 1 || (shape.documents > 0 && shape.count > 1)) {
        return skip("LinkedIn takes pictures, one video, or one PDF.");
      }
      if (shape.pictures > 20) return skip("LinkedIn takes up to 20 pictures.");
      return { ok: true };
    }
    case "twitter":
    case "bluesky": {
      if (postType === "story") return skip(`${name} has no stories.`);
      if (mixed || shape.videos > 1) return skip(`${name} takes pictures or one video.`);
      if (shape.pictures > 4) return skip(`${name} takes up to 4 pictures.`);
      return { ok: true };
    }
    case "threads": {
      if (postType === "story") return skip("Threads has no stories.");
      if (shape.count > 10) return skip("Threads takes up to 10 files.");
      return { ok: true };
    }
    case "googlebusiness": {
      if (postType === "story") return skip("Google Business has no stories.");
      if (shape.videos > 0 || shape.pictures > 1) return skip("Google Business takes text and one picture.");
      return { ok: true };
    }
    default:
      if (postType === "story") return skip(`${name} has no stories.`);
      return { ok: true };
  }
}

/** Start times for pieces sent together: the first at `start`, each next one `gapMinutes` later. */
export function spacedTimes(start: number, gapMinutes: number, count: number): number[] {
  const gap = Math.max(0, Math.floor(gapMinutes)) * 60_000;
  return Array.from({ length: count }, (_value, index) => start + index * gap);
}
