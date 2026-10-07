import type { DeliverableStatus } from "@/db/deliverables";
import type { DeliverableKind, ItemFormat } from "@/lib/deliverable-manifest";

export const DELIVERABLE_STATUS_LABEL: Record<DeliverableStatus, string> = {
  draft: "Not sent",
  in_review: "Waiting for a look",
  approved: "Approved",
  changes_requested: "Changes asked",
  archived: "Put away",
};

export const DELIVERABLE_KIND_LABEL: Record<DeliverableKind, string> = {
  social_pack: "Social pack",
  website: "Website",
  document: "Document",
  other: "Other",
};

export function listedMedia(mediaJson: string): { role: string; video: boolean }[] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const role = (entry as { role?: unknown }).role;
      const contentType = (entry as { content_type?: unknown }).content_type;
      if (typeof role !== "string" || !role) return [];
      return [{ role, video: typeof contentType === "string" && contentType.startsWith("video/") }];
    });
  } catch {
    return [];
  }
}

export const ITEM_FORMAT_LABEL: Record<ItemFormat, string> = {
  video: "Video",
  static: "Picture",
  carousel: "Carousel",
  story: "Story",
  ad_video: "Ad video",
  ad_static: "Ad picture",
  ad_carousel: "Ad carousel",
  page: "Page",
  link: "Link",
  file: "File",
};
