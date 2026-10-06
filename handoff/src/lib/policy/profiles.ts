import { normalizeRelativePath, type PathResult } from "./paths";

export type PolicyProfile = "standard" | "software";

export type FileNameResult =
  | { ok: true; extension: string }
  | { ok: false; reason: string };

const REFUSED_EXTENSIONS = new Set([
  "pem",
  "key",
  "p12",
  "pfx",
  "kdbx",
  "keychain",
  "exe",
  "dll",
  "bat",
  "cmd",
  "com",
  "scr",
  "ps1",
  "msi",
  "jar",
  "app",
  "dmg",
  "7z",
  "rar",
]);

const REFUSED_BASENAMES = new Set([".env", "id_rsa", "id_ed25519"]);

const STANDARD_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "gif",
  "tif",
  "tiff",
  "heic",
  "svg",
  "ai",
  "eps",
  "psd",
  "indd",
  "fig",
  "sketch",
  "mp4",
  "mov",
  "webm",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "ppt",
  "pptx",
  "txt",
  "md",
  "rtf",
  "json",
  "xml",
  "html",
  "htm",
  "css",
  "otf",
  "ttf",
  "woff",
  "woff2",
  "zip",
  "dwg",
  "dxf",
  "ico",
]);

const SOFTWARE_EXTENSIONS = new Set([
  ...STANDARD_EXTENSIONS,
  "js",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "php",
  "java",
  "go",
  "rs",
  "cs",
  "swift",
  "kt",
  "vue",
  "svelte",
  "yaml",
  "yml",
  "toml",
  "ini",
  "sql",
  "tar",
  "gz",
  "tgz",
]);

export function extensionsFor(profile: PolicyProfile): ReadonlySet<string> {
  return profile === "software" ? SOFTWARE_EXTENSIONS : STANDARD_EXTENSIONS;
}

/** Last extension plus every compound suffix. Refused names lose under both profiles. */
export function inspectFileName(
  input: string,
  profile: PolicyProfile,
): FileNameResult {
  const normalized = normalizeRelativePath(input);
  if (!normalized.ok) return normalized satisfies PathResult;
  const base = normalized.path.split("/").at(-1) ?? "";
  const lower = base.toLowerCase();
  if (REFUSED_BASENAMES.has(lower) || lower.startsWith(".env.")) {
    return { ok: false, reason: "We can't take a file with that name." };
  }
  const parts = lower.split(".");
  if (parts.length < 2 || parts.at(-1) === "") {
    return { ok: false, reason: "This file type isn't allowed." };
  }
  const suffixes = parts.slice(1);
  for (const suffix of suffixes) {
    if (REFUSED_EXTENSIONS.has(suffix)) {
      return { ok: false, reason: `Extension .${suffix} is refused.` };
    }
  }
  const extension = suffixes.at(-1) ?? "";
  if (!extensionsFor(profile).has(extension)) {
    return {
      ok: false,
      reason: `Extension .${extension} is not allowed for the ${profile} profile.`,
    };
  }
  return { ok: true, extension };
}
