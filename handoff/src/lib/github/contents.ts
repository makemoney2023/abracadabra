import { parseManifest, repoMediaPath, safeRelativePath, type Manifest } from "@/lib/deliverable-manifest";
import { signGithubAppJwt } from "./sign";

const API = "https://api.github.com";
const MAX_BYTES = 8 * 1024 * 1024;

export type ManifestFile = { bytes: Uint8Array; contentType: string };
export type ManifestBundle = { manifest: Manifest; files: Record<string, ManifestFile> };
export type BundleResult =
  | { ok: true; value: ManifestBundle }
  | { ok: false; error: "invalid" | "missing" | "unavailable" };

function contentTypeFor(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4")) return "video/mp4";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

function encodeRepoPath(filePath: string): string {
  return filePath.split("/").map((part) => encodeURIComponent(part)).join("/");
}

function decodeBase64(value: string): Uint8Array | null {
  const cleaned = value.replace(/\s/g, "");
  if (!cleaned || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return null;
  const bytes = new Uint8Array(Buffer.from(cleaned, "base64"));
  if (bytes.byteLength > MAX_BYTES) return null;
  return bytes;
}

async function readRepoFile(
  fetchImpl: typeof fetch,
  fullName: string,
  filePath: string,
  ref: string,
  token: string,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; error: "invalid" | "missing" | "unavailable" }> {
  const safe = safeRelativePath(filePath);
  if (!safe) return { ok: false, error: "invalid" };
  let response: Response;
  try {
    response = await fetchImpl(`${API}/repos/${fullName}/contents/${encodeRepoPath(safe)}?ref=${encodeURIComponent(ref)}`, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "handoff",
      },
    });
  } catch {
    return { ok: false, error: "unavailable" };
  }
  if (response.status === 404) return { ok: false, error: "missing" };
  if (!response.ok) return { ok: false, error: "unavailable" };
  const body = (await response.json()) as unknown;
  if (Array.isArray(body)) return { ok: false, error: "invalid" };
  if (!body || typeof body !== "object") return { ok: false, error: "invalid" };
  const content = (body as { content?: unknown; encoding?: unknown }).content;
  const encoding = (body as { encoding?: unknown }).encoding;
  if (typeof content !== "string" || encoding !== "base64") return { ok: false, error: "invalid" };
  const bytes = decodeBase64(content);
  if (!bytes) return { ok: false, error: "invalid" };
  return { ok: true, bytes };
}

/** A short-lived install token. The token is not logged and is not part of any error. */
export async function installationAccessToken(input: {
  appId: string;
  privateKey: string;
  installationId: number;
  fetch: typeof fetch;
  now: number;
}): Promise<string | null> {
  if (!Number.isInteger(input.installationId) || input.installationId <= 0) return null;
  const appToken = signGithubAppJwt(input.appId, input.privateKey, input.now);
  let response: Response;
  try {
    response = await input.fetch(`${API}/app/installations/${input.installationId}/access_tokens`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${appToken}`,
        accept: "application/vnd.github+json",
        "user-agent": "handoff",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { token?: unknown };
  return typeof body.token === "string" && body.token.length > 0 ? body.token : null;
}

/** Turns a branch or commit into a 40-character commit id. */
export async function resolveCommitSha(input: {
  fullName: string;
  ref: string;
  token: string;
  fetch: typeof fetch;
}): Promise<string | null> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.fullName)) return null;
  const ref = input.ref.trim();
  if (!ref || /\s/.test(ref)) return null;
  let response: Response;
  try {
    response = await input.fetch(`${API}/repos/${input.fullName}/commits/${encodeURIComponent(ref)}`, {
      headers: {
        authorization: `Bearer ${input.token}`,
        accept: "application/vnd.github+json",
        "user-agent": "handoff",
      },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const body = (await response.json()) as { sha?: unknown };
  return typeof body.sha === "string" && /^[0-9a-f]{40}$/.test(body.sha) ? body.sha : null;
}

/** Reads one manifest and only the media it lists. Never follows a path outside that folder. */
export async function loadManifestBundle(input: {
  fullName: string;
  ref: string;
  manifestPath: string;
  token: string;
  fetch: typeof fetch;
}): Promise<BundleResult> {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.fullName)) return { ok: false, error: "invalid" };
  const manifestPath = safeRelativePath(input.manifestPath);
  if (!manifestPath || !input.ref.trim() || !input.token) return { ok: false, error: "invalid" };
  const loaded = await readRepoFile(input.fetch, input.fullName, manifestPath, input.ref, input.token);
  if (!loaded.ok) return loaded;
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(loaded.bytes));
  } catch {
    return { ok: false, error: "invalid" };
  }
  const manifest = parseManifest(parsed);
  if (!manifest) return { ok: false, error: "invalid" };
  const files: Record<string, ManifestFile> = {};
  for (const item of manifest.items) {
    for (const media of item.media) {
      if (files[media.path]) continue;
      const repoPath = repoMediaPath(manifestPath, media.path);
      if (!repoPath) return { ok: false, error: "invalid" };
      const file = await readRepoFile(input.fetch, input.fullName, repoPath, input.ref, input.token);
      if (!file.ok) return file;
      files[media.path] = { bytes: file.bytes, contentType: contentTypeFor(media.path) };
    }
  }
  return { ok: true, value: { manifest, files } };
}
