import type { Sql } from "@/db/sql";
import { PLATFORM_LABEL } from "@/lib/zernio";
import type { PostType } from "@/lib/social-plan";

export type PreviewLayout = "feed" | "carousel" | "reel" | "story";
export type CaptionPlace = "above" | "below" | "overlay";

export type PostFrame = {
  id: string;
  platform: string | null;
  network: string;
  chrome: "facebook" | "instagram" | "linkedin" | "x" | "tiktok" | "youtube" | "threads" | "bluesky" | "carousel" | "feed";
  layout: PreviewLayout;
  captionPlace: CaptionPlace;
  caption: string;
  slides: number;
  actions: string[];
  tall: boolean;
};

const CHROME: Record<string, PostFrame["chrome"]> = {
  facebook: "facebook",
  instagram: "instagram",
  linkedin: "linkedin",
  twitter: "x",
  x: "x",
  tiktok: "tiktok",
  youtube: "youtube",
  threads: "threads",
  bluesky: "bluesky",
};

const ACTIONS: Record<PostFrame["chrome"], string[]> = {
  facebook: ["Like", "Comment", "Share"],
  instagram: ["Like", "Comment", "Share", "Save"],
  linkedin: ["Like", "Comment", "Repost", "Send"],
  x: ["Reply", "Repost", "Like"],
  tiktok: ["Like", "Comment", "Share"],
  youtube: ["Like", "Comment", "Share"],
  threads: ["Like", "Reply", "Repost", "Share"],
  bluesky: ["Reply", "Repost", "Like"],
  carousel: ["Like", "Comment", "Share"],
  feed: ["Like", "Comment", "Share"],
};

function layoutFor(postType: PostType, chrome: PostFrame["chrome"]): PreviewLayout {
  if (postType === "carousel") return "carousel";
  if (postType === "story") return "story";
  if (postType === "reel" || postType === "short") return "reel";
  if (chrome === "tiktok") return "reel";
  return "feed";
}

function captionPlace(chrome: PostFrame["chrome"], layout: PreviewLayout): CaptionPlace {
  if (layout === "reel" || layout === "story") return "overlay";
  if (chrome === "instagram" || chrome === "threads") return "below";
  return "above";
}

export async function itemDestinationPlatforms(sql: Sql, deliverableId: string): Promise<Map<string, string[]>> {
  const rows = await sql.all<{ item_id: string; platform: string }>(
    `SELECT p.item_id, t.platform
     FROM social_posts p
     JOIN social_post_targets t ON t.post_id = p.id
     WHERE p.deliverable_id = ?
     ORDER BY p.created_at DESC`,
    [deliverableId],
  );
  const platforms = new Map<string, string[]>();
  for (const row of rows) {
    const current = platforms.get(row.item_id) ?? [];
    if (!current.includes(row.platform)) current.push(row.platform);
    platforms.set(row.item_id, current);
  }
  return platforms;
}

export function previewPlatforms(input: {
  channel?: string | null;
  textPlatforms?: string[];
  targetPlatforms?: string[];
}): string[] {
  const chosen = input.targetPlatforms?.filter(Boolean) ?? [];
  const source = chosen.length > 0 ? chosen : (input.textPlatforms?.filter(Boolean) ?? []);
  const withChannel = source.length > 0 ? source : input.channel ? [input.channel] : [];
  return [...new Set(withChannel.map((platform) => platform.toLowerCase()))];
}

/** One frame per destination. A carousel stays a carousel inside that destination. */
export function platformPostFrames(input: {
  postType: PostType;
  caption: string;
  slides: number;
  platforms?: string[];
  captions?: Record<string, string>;
}): PostFrame[] {
  const platforms = input.platforms ?? [];
  const base = platforms.length > 0 ? platforms : [null];
  return base.map((platform) => {
    const chrome = platform ? CHROME[platform] ?? "feed" : input.postType === "carousel" ? "carousel" : "feed";
    const layout = layoutFor(input.postType, chrome);
    const network = platform ? PLATFORM_LABEL[platform] ?? platform : layout === "carousel" ? "Carousel" : layout === "reel" ? "Reel" : layout === "story" ? "Story" : "Post";
    const override = platform ? input.captions?.[platform]?.trim() : "";
    return {
      id: platform ?? layout,
      platform,
      network,
      chrome,
      layout,
      captionPlace: captionPlace(chrome, layout),
      caption: override || input.caption,
      slides: Math.max(input.slides, layout === "carousel" ? 1 : input.slides),
      actions: ACTIONS[chrome],
      tall: layout === "reel" || layout === "story",
    };
  });
}
