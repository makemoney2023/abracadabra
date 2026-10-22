import { isSocialItemFormat } from "@/components/social/social-piece-view";

export const LIBRARY_ARTIFACT_TYPES = ["article", "social", "video", "image", "website", "document", "file"] as const;
export type LibraryArtifactType = (typeof LIBRARY_ARTIFACT_TYPES)[number];

export const LIBRARY_STATUSES = [
  "changes_requested",
  "needs_attention",
  "needs_review",
  "publishing",
  "scheduled",
  "partially_published",
  "published",
  "ready",
  "approved",
  "draft",
] as const;
export type LibraryStatus = (typeof LIBRARY_STATUSES)[number];

export type LibraryApproval = "draft" | "needs_review" | "changes_requested" | "approved";
export type LibraryPublication =
  | "not_published"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "partially_published"
  | "needs_attention";

export type LibrarySourceKind = "deliverable_item" | "built_work" | "file";
export type LibraryAudience = "client" | "staff";

const TYPE_SET = new Set<string>(LIBRARY_ARTIFACT_TYPES);
const MAX_URL_LENGTH = 2000;
const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X",
  x: "X",
  youtube: "YouTube",
  threads: "Threads",
  googlebusiness: "Google Business",
  bluesky: "Bluesky",
};

const STATUS_RANK = new Map(LIBRARY_STATUSES.map((status, index) => [status, index]));

export type DestinationInput = {
  platform: string;
  outcome: string;
  url?: string | null;
  staffReason?: string | null;
};

export type DestinationChip = {
  platform: string;
  label: string;
  state: "scheduled" | "publishing" | "published" | "failed" | "uncertain";
  url?: string;
  staffReason?: string;
};

export type LibraryAction = {
  kind: "read_article" | "copy_link" | "visit_site" | "review" | "view_request" | "view_schedule" | "open_post" | "preview" | "open_file" | "unavailable";
  label: string;
  href: string | null;
  copyValue?: string;
};

export type LibraryArtifact = {
  artifactKey: string;
  sourceKind: LibrarySourceKind;
  sourceId: string;
  version: number | null;
  workspaceId: string;
  organizationId: string;
  title: string;
  artifactType: LibraryArtifactType;
  dek: string | null;
  authorName: string | null;
  publishedAt: number | null;
  hostname: string | null;
  canonical: { url: string; hostname: string; unavailable: false } | { url: null; hostname: null; unavailable: true } | null;
  primaryStatus: LibraryStatus;
  destinations: DestinationChip[];
  actions: LibraryAction[];
  updatedAt: number;
  previewSrc: string | null;
  promotionMedia: { key: string; role: string; contentType: string; previewSrc: string | null }[];
  promotedBy: number;
  promotesTitle: string | null;
  promotionCollections: { id: string; title: string; href: string }[];
};

export type ArtifactProjectionInput = {
  sourceKind: LibrarySourceKind;
  sourceId: string;
  version?: number | null;
  workspaceId: string;
  organizationId: string;
  title: string;
  format?: string | null;
  channel?: string | null;
  hasArticleMetadata?: boolean;
  artifactTypeOverride?: string | null;
  canonicalUrl?: string | null;
  dek?: string | null;
  authorName?: string | null;
  publishedAt?: number | null;
  approval: LibraryApproval;
  publication: LibraryPublication;
  updatedAt: number;
  audience: LibraryAudience;
  destinations?: DestinationInput[];
  href?: string | null;
  productionWrite?: boolean;
  previewSrc?: string | null;
  promotionMedia?: { key: string; role: string; contentType: string; previewSrc: string | null }[];
  promotedBy?: number;
  promotesTitle?: string | null;
  promotionCollections?: { id: string; title: string; href: string }[];
};

export function artifactKey(input: { sourceKind: LibrarySourceKind; sourceId: string; version?: number | null }): string {
  if (input.sourceKind === "deliverable_item") return `deliverable_item:${input.sourceId}:${input.version ?? 0}`;
  return `${input.sourceKind}:${input.sourceId}`;
}

export function deriveArtifactType(input: {
  sourceKind: LibrarySourceKind;
  format?: string | null;
  channel?: string | null;
  hasArticleMetadata?: boolean;
  artifactTypeOverride?: string | null;
}): LibraryArtifactType {
  if (input.sourceKind === "built_work") return "website";
  if (input.sourceKind === "file") return "file";
  if (input.artifactTypeOverride && TYPE_SET.has(input.artifactTypeOverride)) return input.artifactTypeOverride as LibraryArtifactType;
  const format = input.format ?? "";
  if (format === "link") return input.hasArticleMetadata ? "article" : "document";
  if (format === "page" || format === "file") return "document";
  if (isSocialItemFormat(format)) {
    if (input.channel) return "social";
    if (format === "video" || format === "ad_video") return "video";
    return "image";
  }
  return "document";
}

export function primaryLibraryStatus(input: { approval: LibraryApproval; publication: LibraryPublication }): LibraryStatus {
  const candidates: LibraryStatus[] = [];
  if (input.approval === "changes_requested") candidates.push("changes_requested");
  if (input.publication === "needs_attention") candidates.push("needs_attention");
  if (input.approval === "needs_review") candidates.push("needs_review");
  if (input.publication === "publishing") candidates.push("publishing");
  if (input.publication === "scheduled") candidates.push("scheduled");
  if (input.publication === "partially_published") candidates.push("partially_published");
  if (input.publication === "published") candidates.push("published");
  if (input.publication === "ready") candidates.push("ready");
  if (input.approval === "approved") candidates.push("approved");
  candidates.push("draft");
  return candidates.sort((left, right) => (STATUS_RANK.get(left) ?? 99) - (STATUS_RANK.get(right) ?? 99))[0] ?? "draft";
}

export function inspectCanonicalUrl(
  value: string | null | undefined,
  mode: "legacy" | "write",
  options: { production?: boolean } = {},
): { ok: true; url: string; hostname: string } | { ok: false; reason: string } {
  const raw = value?.trim() ?? "";
  if (!raw || raw.length > MAX_URL_LENGTH) return { ok: false, reason: "invalid_url" };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { ok: false, reason: "invalid_url" };
  if (url.username || url.password) return { ok: false, reason: "invalid_url" };
  if (mode === "write" && options.production && url.protocol !== "https:") return { ok: false, reason: "https_required" };
  return { ok: true, url: raw, hostname: url.hostname.toLowerCase() };
}

export function redactUrlForActivity(value: string): string {
  const parsed = inspectCanonicalUrl(value, "legacy");
  if (!parsed.ok) return "";
  const url = new URL(parsed.url);
  return `${url.protocol}//${url.host}${url.pathname}`;
}

function destinationState(outcome: string): DestinationChip["state"] {
  if (outcome === "succeeded" || outcome === "published") return "published";
  if (outcome === "scheduled") return "scheduled";
  if (outcome === "publishing" || outcome === "sending") return "publishing";
  if (outcome === "uncertain") return "uncertain";
  return "failed";
}

function destinationChips(destinations: DestinationInput[], audience: LibraryAudience): DestinationChip[] {
  return destinations.map((destination) => {
    const chip: DestinationChip = {
      platform: destination.platform,
      label: PLATFORM_LABEL[destination.platform] ?? destination.platform,
      state: destinationState(destination.outcome),
    };
    const link = inspectCanonicalUrl(destination.url, "legacy");
    if (link.ok) chip.url = link.url;
    if (audience === "staff" && destination.staffReason) chip.staffReason = destination.staffReason;
    return chip;
  });
}

function actionsFor(input: ArtifactProjectionInput, type: LibraryArtifactType, status: LibraryStatus, link: ReturnType<typeof inspectCanonicalUrl> | null): LibraryAction[] {
  const actions: LibraryAction[] = [];
  if (status === "changes_requested") actions.push({ kind: "view_request", label: "View request", href: input.href ?? null });
  else if (status === "needs_review") actions.push({ kind: "review", label: "Review", href: input.href ?? null });
  else if (type === "article" && link?.ok) actions.push({ kind: "read_article", label: "Read article", href: link.url });
  else if (type === "article") actions.push({ kind: "unavailable", label: "Link unavailable", href: null });
  else if (type === "website" && link?.ok) actions.push({ kind: "visit_site", label: "Visit site", href: link.url });
  else if (type === "social" && status === "scheduled") actions.push({ kind: "view_schedule", label: "View schedule", href: input.href ?? null });
  else if (type === "social" && (status === "published" || status === "partially_published")) {
    const published = input.destinations?.find((destination) => inspectCanonicalUrl(destination.url, "legacy").ok);
    const safe = published ? inspectCanonicalUrl(published.url, "legacy") : null;
    actions.push({ kind: "open_post", label: "Open post", href: safe?.ok ? safe.url : input.href ?? null });
  } else if (type === "file") actions.push({ kind: "open_file", label: "Open file", href: input.href ?? null });
  else actions.push({ kind: "preview", label: "Preview", href: input.href ?? null });
  if (type === "article" && link?.ok) actions.push({ kind: "copy_link", label: "Copy link", href: null, copyValue: link.url });
  if (input.href?.includes("?item=") && !actions.some((action) => action.href === input.href)) {
    actions.push({ kind: "preview", label: "Open", href: input.href });
  }
  return actions;
}

export function projectLibraryArtifact(input: ArtifactProjectionInput): LibraryArtifact {
  const type = deriveArtifactType(input);
  const status = primaryLibraryStatus(input);
  const inspected = input.canonicalUrl ? inspectCanonicalUrl(input.canonicalUrl, input.productionWrite ? "write" : "legacy", { production: input.productionWrite }) : null;
  const canonical = inspected == null ? null : inspected.ok
    ? { url: inspected.url, hostname: inspected.hostname, unavailable: false as const }
    : { url: null, hostname: null, unavailable: true as const };
  return {
    artifactKey: artifactKey(input),
    sourceKind: input.sourceKind,
    sourceId: input.sourceId,
    version: input.version ?? null,
    workspaceId: input.workspaceId,
    organizationId: input.organizationId,
    title: input.title,
    artifactType: type,
    dek: input.dek ?? null,
    authorName: input.authorName ?? null,
    publishedAt: input.publishedAt ?? null,
    hostname: canonical && !canonical.unavailable ? canonical.hostname : null,
    canonical,
    primaryStatus: status,
    destinations: destinationChips(input.destinations ?? [], input.audience),
    actions: actionsFor(input, type, status, inspected),
    updatedAt: input.updatedAt,
    previewSrc: input.previewSrc ?? null,
    promotionMedia: input.promotionMedia ?? [],
    promotedBy: input.promotedBy ?? 0,
    promotesTitle: input.promotesTitle ?? null,
    promotionCollections: input.promotionCollections ?? [],
  };
}
