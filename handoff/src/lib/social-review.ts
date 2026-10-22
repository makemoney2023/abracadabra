import { openDeliverable, listWorkspaceDeliverables } from "@/db/deliverables";
import type { Sql } from "@/db/sql";
import { boardLists } from "@/components/social/social-board";
import { isSocialItemFormat } from "@/components/social/social-piece-view";
import type { Caller } from "./authz";

export type SocialReviewPiece = {
  id: string;
  title: string;
  caption: string;
  status: "pending" | "changes_requested" | "approved";
  format: string;
  deliverableId: string;
  deliverableTitle: string;
  version: number;
  slug: string;
  accountName: string;
  media: { role: string; video: boolean; contentType: string }[];
  platforms: string[];
};

function reviewMedia(mediaJson: string): SocialReviewPiece["media"] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const role = (entry as { role?: unknown }).role;
      const contentType = (entry as { content_type?: unknown }).content_type;
      if (typeof role !== "string" || !role || typeof contentType !== "string") return [];
      const type = contentType.toLowerCase();
      if (!type.startsWith("image/") && !type.startsWith("video/")) return [];
      return [{ role, video: type.startsWith("video/"), contentType: type }];
    });
  } catch {
    return [];
  }
}

/**
 * Published social pieces this caller can see, split into work waiting for a decision
 * and approved work that is not on a live post.
 */
export async function listSocialReviewPieces(
  sql: Sql,
  caller: Caller,
  workspace: { id: string; slug: string; display_name: string },
  liveItemIds: Set<string>,
  heldItemIds: Set<string> = new Set(),
): Promise<{ waiting: SocialReviewPiece[]; ready: SocialReviewPiece[]; catalog: SocialReviewPiece[] }> {
  const cards = await listWorkspaceDeliverables(sql, caller, workspace.id);
  const pieces: SocialReviewPiece[] = [];
  for (const card of cards) {
    const opened = await openDeliverable(sql, caller, card.id, "published");
    if (!opened?.deliverable.published_version) continue;
    for (const item of opened.items) {
      if (!isSocialItemFormat(item.format)) continue;
      if (item.status !== "pending" && item.status !== "changes_requested" && item.status !== "approved") continue;
      pieces.push({
        id: item.id,
        title: item.title,
        caption: item.copy_text ?? "",
        status: item.status,
        format: item.format,
        deliverableId: opened.deliverable.id,
        deliverableTitle: opened.deliverable.title,
        version: opened.deliverable.published_version,
        slug: workspace.slug,
        accountName: workspace.display_name,
        media: reviewMedia(item.media_json),
        platforms: item.channel ? [item.channel] : [],
      });
    }
  }
  return { ...boardLists(pieces, liveItemIds, heldItemIds), catalog: pieces };
}
