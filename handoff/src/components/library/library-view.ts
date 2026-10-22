import type { LibraryArtifact, LibraryArtifactType, LibraryStatus } from "@/lib/library-artifacts";
import type { LibrarySort } from "@/lib/library-queries";

export const LIBRARY_TABS: { type: LibraryArtifactType | "all"; label: string }[] = [
  { type: "all", label: "All" },
  { type: "article", label: "Articles" },
  { type: "social", label: "Social" },
  { type: "video", label: "Video" },
  { type: "image", label: "Images" },
  { type: "website", label: "Websites" },
  { type: "document", label: "Documents" },
  { type: "file", label: "Sources" },
];

export const LIBRARY_STATUS_LABEL: Record<LibraryStatus, string> = {
  changes_requested: "Changes requested",
  needs_attention: "Needs attention",
  needs_review: "Needs review",
  publishing: "Publishing",
  scheduled: "Scheduled",
  partially_published: "Partly published",
  published: "Published",
  ready: "Ready",
  approved: "Approved",
  draft: "Draft",
};

export const LIBRARY_PLATFORMS: { id: string; label: string }[] = [
  { id: "linkedin", label: "LinkedIn" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "twitter", label: "X" },
  { id: "threads", label: "Threads" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "bluesky", label: "Bluesky" },
  { id: "googlebusiness", label: "Google Business" },
];

export function libraryStatusClass(status: LibraryStatus): string {
  if (status === "changes_requested" || status === "needs_attention") return "bg-status-late text-status-late-fg";
  if (status === "needs_review" || status === "scheduled" || status === "publishing") return "bg-status-waiting text-status-waiting-fg";
  if (status === "partially_published") return "bg-status-blocked text-status-blocked-fg";
  if (status === "published" || status === "ready" || status === "approved") return "bg-status-active text-status-active-fg";
  return "bg-status-neutral text-status-neutral-fg";
}

export function libraryDateLabel(value: number | null | undefined): string | null {
  if (!value || value < 1_000_000_000_000) return null;
  return new Date(value).toLocaleDateString("en-CA");
}

export const LIBRARY_SORTS: { sort: LibrarySort; label: string }[] = [
  { sort: "delivered", label: "Recently delivered" },
  { sort: "updated", label: "Recently updated" },
  { sort: "published", label: "Published date" },
  { sort: "title", label: "Title" },
  { sort: "needs_action", label: "Needs action first" },
];

export function libraryHref(slug: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return `/w/${slug}/library${search ? `?${search}` : ""}`;
}

export function nextLibraryHref(slug: string, current: Record<string, string | undefined>, cursor: string): string {
  return libraryHref(slug, { ...current, cursor });
}

export function emptyLibraryCopy(input: { search?: string; type?: string }): string {
  if (input.search) return `No results for “${input.search}”.`;
  if (input.type === "article") return "No articles yet.";
  return "Finished work will appear here after the studio sends it.";
}

export function articleCardModel(artifact: LibraryArtifact): {
  title: string;
  dek: string | null;
  hostname: string | null;
  author: string | null;
  status: string;
  readHref: string | null;
  copyValue: string | null;
} {
  const read = artifact.actions.find((action) => action.kind === "read_article");
  const copy = artifact.actions.find((action) => action.kind === "copy_link");
  return {
    title: artifact.title,
    dek: artifact.dek,
    hostname: artifact.hostname,
    author: artifact.authorName,
    status: LIBRARY_STATUS_LABEL[artifact.primaryStatus],
    readHref: read?.href ?? null,
    copyValue: copy?.copyValue ?? null,
  };
}

export function copyLinkFeedback(ok: boolean): { message: string; showUrl: boolean } {
  return ok ? { message: "Copied", showUrl: false } : { message: "Could not copy", showUrl: true };
}
