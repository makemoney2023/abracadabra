import type { SocialAccount, SocialPost } from "@/lib/social";
import { PLATFORM_LABEL } from "@/lib/zernio";
import { postOnCalendar } from "./social-board";

export type CalendarCard = {
  id: string;
  title: string;
  platform: string;
  state: string;
  at: number;
  timezone: string;
  thumbnailRole: string;
  deliverableId: string;
  itemId: string;
  accountId: string;
  accountLabel: string;
  collection: string;
  approval: string;
  cancelled: boolean;
};

function firstAccount(post: SocialPost): string {
  try {
    const ids = JSON.parse(post.account_ids) as unknown;
    return Array.isArray(ids) && typeof ids[0] === "string" ? ids[0] : "";
  } catch {
    return "";
  }
}

/** Timed posts for the shared calendar. Cancelled posts and drafts with no time stay off it. */
export function calendarPosts(
  posts: SocialPost[],
  accounts: SocialAccount[],
  pieces: { id: string; status: string }[],
): CalendarCard[] {
  const approval = new Map(pieces.map((piece) => [piece.id, piece.status]));
  return posts.flatMap((post) => {
    if (!postOnCalendar({ status: post.status, error: post.error, scheduledFor: post.scheduled_for })) return [];
    const accountId = firstAccount(post);
    const account = accounts.find((row) => row.id === accountId);
    const platform = account?.platform ?? "";
    const name = account?.display_name ?? account?.username ?? accountId;
    return [{
      id: post.id,
      title: post.item_title ?? "Post",
      platform,
      state: post.status,
      at: post.scheduled_for ?? post.created_at,
      timezone: post.timezone || "UTC",
      thumbnailRole: "main",
      deliverableId: post.deliverable_id,
      itemId: post.item_id,
      accountId,
      accountLabel: account ? `${PLATFORM_LABEL[platform] ?? platform} · ${name}` : accountId,
      collection: post.deliverable_title ?? "",
      approval: approval.get(post.item_id) ?? "approved",
      cancelled: false,
    }];
  });
}
