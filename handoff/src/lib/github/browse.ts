import { safeRelativePath } from "@/lib/deliverable-manifest";

const API = "https://api.github.com";
const LIST_CAP = 80;
const TEXT_CAP = 20_000;
const BYTE_CAP = 500_000;
const SEARCH_CAP = 15;
const FRAGMENT_CAP = 400;
const FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BINARY_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "ico",
  "pdf",
  "mp4",
  "mov",
  "webm",
  "mp3",
  "wav",
  "zip",
  "gz",
  "wasm",
  "woff",
  "woff2",
  "ttf",
  "otf",
  "eot",
  "exe",
  "dll",
  "so",
  "dylib",
  "bin",
]);

export type RepoEntry = { name: string; path: string; type: "file" | "dir"; size: number | null };
export type RepoBrowseError = { ok: false; error: "invalid" | "missing" | "unavailable" };

type FetchImpl = typeof fetch;

function repoUrl(fullName: string, suffix: string): string | null {
  if (!FULL_NAME.test(fullName)) return null;
  return `${API}/repos/${fullName}/${suffix}`;
}

function refOk(ref: string): boolean {
  const trimmed = ref.trim();
  return trimmed.length > 0 && trimmed.length <= 200 && !/\s/.test(trimmed);
}

function encodeRepoPath(filePath: string): string {
  return filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

async function githubGet(
  fetchImpl: FetchImpl,
  url: string,
  token: string,
  accept: string,
): Promise<Response | null> {
  if (!token) return null;
  try {
    return await fetchImpl(url, {
      headers: {
        authorization: `Bearer ${token}`,
        accept,
        "user-agent": "handoff",
      },
    });
  } catch {
    return null;
  }
}

function extensionOf(filePath: string): string {
  const name = filePath.slice(filePath.lastIndexOf("/") + 1).toLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : "";
}

function decodeBase64(value: string): Uint8Array | null {
  const cleaned = value.replace(/\s/g, "");
  if (!cleaned || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
  return new Uint8Array(Buffer.from(cleaned, "base64"));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** One folder of an attached repo. An empty path is the repository root. */
export async function listRepoDirectory(input: {
  fullName: string;
  ref: string;
  path: string;
  token: string;
  fetch: FetchImpl;
}): Promise<{ ok: true; entries: RepoEntry[]; truncated: boolean } | RepoBrowseError> {
  const path = input.path.trim();
  const safe = path ? safeRelativePath(path) : "";
  if (path && !safe) return { ok: false, error: "invalid" };
  if (!refOk(input.ref) || !input.token) return { ok: false, error: "invalid" };
  const suffix = safe
    ? `contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(input.ref.trim())}`
    : `contents?ref=${encodeURIComponent(input.ref.trim())}`;
  const url = repoUrl(input.fullName, suffix);
  if (!url) return { ok: false, error: "invalid" };
  const response = await githubGet(input.fetch, url, input.token, "application/vnd.github+json");
  if (!response) return { ok: false, error: "unavailable" };
  if (response.status === 404) return { ok: false, error: "missing" };
  if (!response.ok) return { ok: false, error: "unavailable" };
  const body = (await response.json()) as unknown;
  const rows = Array.isArray(body) ? body : [body];
  const entries: RepoEntry[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const name = record?.name;
    const entryPath = record?.path;
    const type = record?.type;
    if (typeof name !== "string" || typeof entryPath !== "string") continue;
    if (type !== "file" && type !== "dir") continue;
    if (!safeRelativePath(entryPath)) continue;
    const size = typeof record?.size === "number" ? record.size : null;
    entries.push({ name, path: entryPath, type, size: type === "dir" ? null : size });
  }
  entries.sort((left, right) => {
    if (left.type !== right.type) return left.type === "dir" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return { ok: true, entries: entries.slice(0, LIST_CAP), truncated: entries.length > LIST_CAP };
}

/** Text of one file. Pictures and other binary files stay marked binary. */
export async function readRepoText(input: {
  fullName: string;
  ref: string;
  path: string;
  token: string;
  fetch: FetchImpl;
}): Promise<
  | { ok: true; path: string; body: string; truncated: boolean }
  | { ok: true; path: string; binary: true; size: number | null }
  | { ok: true; path: string; tooLarge: true; size: number | null }
  | RepoBrowseError
> {
  const safe = safeRelativePath(input.path);
  if (!safe || !refOk(input.ref) || !input.token) return { ok: false, error: "invalid" };
  const url = repoUrl(input.fullName, `contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(input.ref.trim())}`);
  if (!url) return { ok: false, error: "invalid" };
  const response = await githubGet(input.fetch, url, input.token, "application/vnd.github+json");
  if (!response) return { ok: false, error: "unavailable" };
  if (response.status === 404) return { ok: false, error: "missing" };
  if (!response.ok) return { ok: false, error: "unavailable" };
  const body = (await response.json()) as unknown;
  if (Array.isArray(body)) return { ok: false, error: "invalid" };
  const record = asRecord(body);
  if (!record || record.type === "dir") return { ok: false, error: "invalid" };
  const size = typeof record.size === "number" ? record.size : null;
  if (BINARY_EXTENSIONS.has(extensionOf(safe))) return { ok: true, path: safe, binary: true, size };
  if (size != null && size > BYTE_CAP) return { ok: true, path: safe, tooLarge: true, size };
  if (typeof record.content !== "string" || record.encoding !== "base64") return { ok: false, error: "invalid" };
  const bytes = decodeBase64(record.content);
  if (!bytes) return { ok: false, error: "invalid" };
  if (bytes.byteLength > BYTE_CAP) return { ok: true, path: safe, tooLarge: true, size: bytes.byteLength };
  if (bytes.includes(0)) return { ok: true, path: safe, binary: true, size: bytes.byteLength };
  const text = new TextDecoder().decode(bytes);
  return { ok: true, path: safe, body: text.slice(0, TEXT_CAP), truncated: text.length > TEXT_CAP };
}

function searchText(query: string, fullName: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length < 2 || trimmed.length > 200) return null;
  if (/(^|\s)(repo|org|user):/i.test(trimmed)) return null;
  return `${trimmed} repo:${fullName}`;
}

/** Code search inside one repo. Hits from any other repository are dropped. */
export async function searchRepoCode(input: {
  fullName: string;
  query: string;
  token: string;
  fetch: FetchImpl;
}): Promise<{ ok: true; hits: { path: string; fragment: string }[] } | RepoBrowseError> {
  if (!FULL_NAME.test(input.fullName) || !input.token) return { ok: false, error: "invalid" };
  const q = searchText(input.query, input.fullName);
  if (!q) return { ok: false, error: "invalid" };
  const url = `${API}/search/code?q=${encodeURIComponent(q)}&per_page=${SEARCH_CAP}`;
  const response = await githubGet(input.fetch, url, input.token, "application/vnd.github.text-match+json");
  if (!response) return { ok: false, error: "unavailable" };
  if (response.status === 404) return { ok: false, error: "missing" };
  if (!response.ok) return { ok: false, error: "unavailable" };
  const body = asRecord(await response.json());
  const items = body?.items;
  if (!Array.isArray(items)) return { ok: false, error: "unavailable" };
  const hits: { path: string; fragment: string }[] = [];
  for (const item of items) {
    const record = asRecord(item);
    const repository = asRecord(record?.repository);
    const path = record?.path;
    if (repository?.full_name !== input.fullName || typeof path !== "string" || !safeRelativePath(path)) continue;
    const matches = Array.isArray(record?.text_matches) ? record.text_matches : [];
    const first = asRecord(matches[0]);
    const fragment = typeof first?.fragment === "string" ? first.fragment.slice(0, FRAGMENT_CAP) : "";
    hits.push({ path, fragment });
    if (hits.length >= SEARCH_CAP) break;
  }
  return { ok: true, hits };
}
