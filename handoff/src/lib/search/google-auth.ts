import { SearchApiError, safeErrorCode } from "./errors";

/**
 * Google service-account sign-in for HQ's Search Console reader.
 * The key is the JSON Google gives for a service account, stored only as the GOOGLE_SA_KEY_JSON secret on the `handoff`
 * Worker. We sign a short RS256 JWT with WebCrypto and trade it for a one-hour access token, which is cached in memory
 * per isolate and per scope. Nothing here writes a key or a token anywhere.
 */

export const GSC_READONLY_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/** Read-only Search Console only. GA4's analytics.readonly joins this list in its own PR. */
const ALLOWED_SCOPES: ReadonlySet<string> = new Set([GSC_READONLY_SCOPE]);

/** Refresh this long before Google's expiry so a request never goes out with a token about to lapse. */
const REFRESH_EARLY_MS = 5 * 60 * 1000;
const JWT_LIFETIME_S = 3600;

export type ServiceAccountKey = {
  clientEmail: string;
  privateKeyPem: string;
  privateKeyId: string | null;
  projectId: string | null;
};

/**
 * Parses the service-account JSON. Returns null (never throws) for anything missing or malformed, so a bad secret
 * fails closed. token_uri, when present, must be Google's: the signed assertion is never sent anywhere else.
 */
export function parseServiceAccountKey(raw: unknown): ServiceAccountKey | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const body = parsed as Record<string, unknown>;
  if (body.type !== undefined && body.type !== "service_account") return null;
  const clientEmail = typeof body.client_email === "string" ? body.client_email.trim() : "";
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(clientEmail)) return null;
  const privateKeyPem = typeof body.private_key === "string" ? normalizePem(body.private_key) : "";
  if (!privateKeyPem.includes("-----BEGIN PRIVATE KEY-----") || !privateKeyPem.includes("-----END PRIVATE KEY-----")) return null;
  if (body.token_uri !== undefined && body.token_uri !== GOOGLE_TOKEN_URI) return null;
  return {
    clientEmail,
    privateKeyPem,
    privateKeyId: typeof body.private_key_id === "string" ? body.private_key_id : null,
    projectId: typeof body.project_id === "string" ? body.project_id : null,
  };
}

/** A key pasted into a secret often stores newlines as the two characters `\n`. */
function normalizePem(pem: string): string {
  return pem.includes("\n") ? pem : pem.replace(/\\n/g, "\n");
}

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromJson(value: unknown): string {
  return base64UrlFromBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function pkcs8FromPem(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

export function assertAllowedScope(scope: string): void {
  if (!ALLOWED_SCOPES.has(scope)) throw new SearchApiError("not_configured", 0, "scope_not_allowed");
}

/** RS256 JWT for Google's jwt-bearer grant, signed with WebCrypto (RSASSA-PKCS1-v1_5, SHA-256). */
export async function signServiceAccountJwt(key: ServiceAccountKey, scope: string, nowMs: number): Promise<string> {
  assertAllowedScope(scope);
  const iat = Math.floor(nowMs / 1000);
  const header = { alg: "RS256", typ: "JWT", ...(key.privateKeyId ? { kid: key.privateKeyId } : {}) };
  const claims = { iss: key.clientEmail, scope, aud: GOOGLE_TOKEN_URI, iat, exp: iat + JWT_LIFETIME_S };
  const data = `${base64UrlFromJson(header)}.${base64UrlFromJson(claims)}`;
  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8FromPem(key.privateKeyPem),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new SearchApiError("not_configured", 0, "invalid_private_key");
  }
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(data));
  return `${data}.${base64UrlFromBytes(new Uint8Array(signature))}`;
}

export type TokenProvider = {
  /** A live access token for the scope, from cache when it has more than five minutes left. */
  token(scope: string): Promise<string>;
  /** Drop the cached token (after a 401) so the next call signs in again. */
  invalidate(scope: string): void;
};

type Cached = { token: string; expiresAt: number };

export function createTokenProvider(input: {
  key: ServiceAccountKey;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): TokenProvider {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  const cache = new Map<string, Cached>();
  const inFlight = new Map<string, Promise<string>>();

  async function mint(scope: string): Promise<string> {
    const issuedAt = now();
    const assertion = await signServiceAccountJwt(input.key, scope, issuedAt);
    let response: Response;
    try {
      response = await fetchImpl(GOOGLE_TOKEN_URI, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
      });
    } catch {
      throw new SearchApiError("network", 0, "token_request_failed");
    }
    let body: Record<string, unknown> = {};
    try {
      const parsed: unknown = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
    } catch {
      body = {};
    }
    if (!response.ok) {
      const code = safeErrorCode(body.error);
      if (response.status === 429) throw new SearchApiError("rate_limited", 429, code);
      if (response.status >= 500) throw new SearchApiError("server", response.status, code);
      throw new SearchApiError("auth", response.status, code);
    }
    const token = typeof body.access_token === "string" ? body.access_token : "";
    const expiresIn = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
    if (!token) throw new SearchApiError("auth", response.status, "no_access_token");
    cache.set(scope, { token, expiresAt: issuedAt + expiresIn * 1000 });
    return token;
  }

  return {
    async token(scope) {
      assertAllowedScope(scope);
      const cached = cache.get(scope);
      if (cached && cached.expiresAt - REFRESH_EARLY_MS > now()) return cached.token;
      const pending = inFlight.get(scope);
      if (pending) return pending;
      const next = mint(scope).finally(() => inFlight.delete(scope));
      inFlight.set(scope, next);
      return next;
    },
    invalidate(scope) {
      cache.delete(scope);
    },
  };
}

const shared = new Map<string, TokenProvider>();

/**
 * One provider per key per isolate, so cron and queue runs in the same isolate reuse a cached token.
 * Keyed by the service-account email and key id: a rotated key gets a fresh provider (and a fresh token).
 */
export function sharedTokenProvider(key: ServiceAccountKey, fetchImpl?: typeof fetch): TokenProvider {
  const id = `${key.clientEmail}|${key.privateKeyId ?? ""}`;
  const existing = shared.get(id);
  if (existing) return existing;
  const provider = createTokenProvider({ key, fetchImpl });
  shared.set(id, provider);
  return provider;
}
