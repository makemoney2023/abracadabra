/**
 * Notes and source links that produced a piece. They stay in Files.
 * The Library lists the finished piece.
 */
export function isBuildContext(input: { title: string; linkUrl?: string | null }): boolean {
  const title = input.title.trim().toLowerCase();
  if (title.endsWith(".md") || title.endsWith(".markdown") || title.endsWith(".mdx")) return true;
  const link = input.linkUrl?.trim();
  if (!link) return false;
  try {
    const host = new URL(link).hostname.toLowerCase().replace(/^www\./, "");
    return host === "github.com";
  } catch {
    return false;
  }
}

/** A page whose body is the caption list. The caption belongs on each image. */
export function isCaptionSheet(input: { format?: string | null; copyText?: string | null }): boolean {
  if (input.format !== "page" && input.format !== "file") return false;
  return (input.copyText ?? "").toLowerCase().includes("**caption:**");
}

/** Same rule as isBuildContext plus caption sheets, for deliverable_items aliased as i. */
export const ITEM_BUILD_CONTEXT_SQL = `(
  lower(i.title) GLOB '*.md'
  OR lower(i.title) GLOB '*.markdown'
  OR lower(i.title) GLOB '*.mdx'
  OR lower(COALESCE(i.link_url, '')) LIKE '%://github.com/%'
  OR lower(COALESCE(i.link_url, '')) LIKE '%://www.github.com/%'
  OR ((i.format = 'page' OR i.format = 'file') AND instr(lower(COALESCE(i.copy_text, '')), '**caption:**') > 0)
)`;

/** Same rule for a stored file path. */
export const FILE_BUILD_CONTEXT_SQL = `(
  lower(f.relative_path) GLOB '*.md'
  OR lower(f.relative_path) GLOB '*.markdown'
  OR lower(f.relative_path) GLOB '*.mdx'
)`;
