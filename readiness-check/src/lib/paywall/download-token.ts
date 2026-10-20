import { hmacSha256, timingSafeEqual, toBase64Url } from "@/lib/paywall/crypto";

/**
 * Short-lived signed download token: `v1.<expiresAtMs>.<sig>`.
 * The signature binds the scan's public token and internal id, so a token
 * for one scan never opens another.
 */

export const DOWNLOAD_TOKEN_TTL_MS = 15 * 60 * 1000;
export const DOWNLOAD_TOKEN_HEADER = "x-download-token";

async function signingKey(config: { webhookSecret: string; tokenSecret: string | null }): Promise<Uint8Array> {
  if (config.tokenSecret) return new TextEncoder().encode(config.tokenSecret);
  // Domain-separated key derived from the webhook secret, so one less secret to manage.
  return hmacSha256(config.webhookSecret, "schema-download-token-v1");
}

function payload(scanToken: string, scanId: string, expiresAt: number): string {
  return `v1|${scanToken}|${scanId}|${expiresAt}`;
}

export async function issueDownloadToken(
  config: { webhookSecret: string; tokenSecret: string | null },
  scanToken: string,
  scanId: string,
  now = Date.now(),
): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = now + DOWNLOAD_TOKEN_TTL_MS;
  const sig = toBase64Url(await hmacSha256(await signingKey(config), payload(scanToken, scanId, expiresAt)));
  return { token: `v1.${expiresAt}.${sig}`, expiresAt };
}

export async function verifyDownloadToken(
  config: { webhookSecret: string; tokenSecret: string | null },
  token: string | null | undefined,
  scanToken: string,
  scanId: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  const expected = toBase64Url(
    await hmacSha256(await signingKey(config), payload(scanToken, scanId, expiresAt)),
  );
  return timingSafeEqual(expected, parts[2] ?? "");
}
