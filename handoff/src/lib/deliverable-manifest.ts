export const DELIVERABLE_KINDS = ["social_pack", "website", "document", "other"] as const;
export const ITEM_FORMATS = [
  "video",
  "static",
  "carousel",
  "story",
  "ad_video",
  "ad_static",
  "ad_carousel",
  "page",
  "link",
  "file",
] as const;
export const MEDIA_ROLES = ["main", "poster", "square", "slide"] as const;

export type DeliverableKind = (typeof DELIVERABLE_KINDS)[number];
export type ItemFormat = (typeof ITEM_FORMATS)[number];
export type MediaRole = (typeof MEDIA_ROLES)[number];

export type ManifestMedia = { path: string; role: MediaRole };
export type ManifestItem = {
  title: string;
  format: ItemFormat;
  section: string | null;
  channel: string | null;
  copy: string | null;
  link: string | null;
  media: ManifestMedia[];
};
export type Manifest = { title: string; kind: DeliverableKind; items: ManifestItem[] };

const KIND_SET = new Set<string>(DELIVERABLE_KINDS);
const FORMAT_SET = new Set<string>(ITEM_FORMATS);
const ROLE_SET = new Set<string>(MEDIA_ROLES);

/** A path inside the manifest folder. `..`, absolute paths, and empty parts are refused. */
export function safeRelativePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("/") || trimmed.includes("\\") || trimmed.includes("\0")) return null;
  const parts = trimmed.split("/");
  if (parts.some((part) => part.length === 0 || part === "." || part === "..")) return null;
  return parts.join("/");
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max) return null;
  return trimmed;
}

function optionalText(value: unknown, max: number): string | null | undefined {
  if (value == null || value === "") return null;
  return text(value, max);
}

/** Manifest JSON the pull step accepts. Returns null when any path or field is unsafe. */
export function parseManifest(value: unknown): Manifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const title = text(row.title, 200);
  if (!title || typeof row.kind !== "string" || !KIND_SET.has(row.kind)) return null;
  if (!Array.isArray(row.items) || row.items.length === 0 || row.items.length > 100) return null;
  const items: ManifestItem[] = [];
  for (const entry of row.items) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const item = entry as Record<string, unknown>;
    const itemTitle = text(item.title, 200);
    if (!itemTitle || typeof item.format !== "string" || !FORMAT_SET.has(item.format)) return null;
    const section = optionalText(item.section, 80);
    const channel = optionalText(item.channel, 80);
    const copy = optionalText(item.copy, 4000);
    const link = optionalText(item.link, 2000);
    if (section === undefined || channel === undefined || copy === undefined || link === undefined) return null;
    const media: ManifestMedia[] = [];
    if (item.media != null) {
      if (!Array.isArray(item.media) || item.media.length > 20) return null;
      for (const piece of item.media) {
        if (!piece || typeof piece !== "object" || Array.isArray(piece)) return null;
        const mediaRow = piece as Record<string, unknown>;
        if (typeof mediaRow.path !== "string" || typeof mediaRow.role !== "string") return null;
        const path = safeRelativePath(mediaRow.path);
        if (!path || !ROLE_SET.has(mediaRow.role)) return null;
        media.push({ path, role: mediaRow.role as MediaRole });
      }
    }
    items.push({
      title: itemTitle,
      format: item.format as ItemFormat,
      section,
      channel,
      copy,
      link,
      media,
    });
  }
  return { title, kind: row.kind as DeliverableKind, items };
}

/** Media path joined under the manifest's folder. Null when either path leaves that folder. */
export function repoMediaPath(manifestPath: string, mediaPath: string): string | null {
  const manifest = safeRelativePath(manifestPath);
  const media = safeRelativePath(mediaPath);
  if (!manifest || !media) return null;
  const slash = manifest.lastIndexOf("/");
  const dir = slash === -1 ? "" : manifest.slice(0, slash);
  return safeRelativePath(dir ? `${dir}/${media}` : media);
}
