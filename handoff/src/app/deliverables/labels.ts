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
  brief: "Brief",
  design_system: "Design system",
  other: "Other",
};

/** Alt text for a piece. The title wins. A blank title uses the role, with underscores as spaces. */
export function fileLabel(input: { title?: string; role?: string }): string {
  const title = input.title?.trim() ?? "";
  if (title) return title;
  const role = (input.role ?? "").trim().replaceAll("_", " ");
  if (role) return role;
  return "File";
}

/**
 * Media to show for a piece. image is false for a stored text, HTML or other non-picture file (an agent filing's
 * .md or .html attachment), which must not go in an <img>. A role with no content type is a picture, as before.
 */
export function listedMedia(mediaJson: string): { role: string; video: boolean; image: boolean }[] {
  try {
    const parsed = JSON.parse(mediaJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const role = (entry as { role?: unknown }).role;
      const contentType = (entry as { content_type?: unknown }).content_type;
      if (typeof role !== "string" || !role) return [];
      const type = typeof contentType === "string" ? contentType.toLowerCase() : "";
      return [{ role, video: type.startsWith("video/"), image: type === "" || type.startsWith("image/") }];
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
