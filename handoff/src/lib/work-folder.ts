import { FINISHED_WORK_FOLDER } from "@/lib/file-label";

/** Folder an agent files into, like "Social/Facebook". Readable names stay readable; only unsafe characters go. */
export const MAX_FOLDER_DEPTH = 6;
const MAX_SEGMENT = 80;
const UNSAFE = /[\\:*?"<>|\u0000-\u001f\u007f]/g;

export function cleanSegment(value: string, max = MAX_SEGMENT): string {
  return value
    .replace(UNSAFE, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "")
    .slice(0, max)
    .trim();
}

export type FolderResult = { ok: true; folder: string | null } | { ok: false; message: string };

/** null when the agent sent none. A path that tries to climb (..) or goes too deep is refused, not guessed. */
export function cleanFolder(raw: unknown): FolderResult {
  if (raw == null) return { ok: true, folder: null };
  if (typeof raw !== "string") return { ok: false, message: 'folder must be text, like "Social/Facebook".' };
  const parts = raw.split(/[\\/]/).map((part) => part.trim()).filter((part) => part.length > 0);
  if (parts.some((part) => part === ".." || part === ".")) return { ok: false, message: "folder can't use . or .. as a name." };
  const segments = parts.map((part) => cleanSegment(part)).filter((part) => part.length > 0);
  if (segments.length > MAX_FOLDER_DEPTH) return { ok: false, message: `folder can be at most ${MAX_FOLDER_DEPTH} levels deep.` };
  return { ok: true, folder: segments.length ? segments.join("/") : null };
}

/** Where work lands when the agent names no folder: Finished work/2026-10-20 Social media. */
export function defaultFolder(now: number, title: string): string {
  const date = new Date(now).toISOString().slice(0, 10);
  const name = cleanSegment(`${date} ${title.replace(/\//g, "-")}`);
  return `${FINISHED_WORK_FOLDER}/${name || date}`;
}

/** A file name without its extension and without folders. Inner dots become dashes so the type check sees one extension. */
export function fileStem(name: string): string {
  const base = name.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const stem = base.replace(/\.[a-z0-9]{1,8}$/i, "").replace(/\./g, "-");
  return cleanSegment(stem, 100) || "file";
}

/** The extension the agent wrote on a text attachment, when it is one we keep as written. */
const KEPT_TEXT = new Set(["md", "txt", "csv", "html", "htm", "xml", "css"]);
export function keptTextExtension(name: string): string | null {
  const match = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  const extension = match?.[1]?.toLowerCase() ?? "";
  return KEPT_TEXT.has(extension) ? extension : null;
}
