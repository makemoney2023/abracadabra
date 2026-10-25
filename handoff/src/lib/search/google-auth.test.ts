import { describe, expect, it, vi } from "vitest";
import { SearchApiError } from "./errors";
import {
  createTokenProvider,
  GSC_READONLY_SCOPE,
  GOOGLE_TOKEN_URI,
  parseServiceAccountKey,
  signServiceAccountJwt,
} from "./google-auth";
import { throwawayServiceAccount } from "./test-key";

const NOW = 1_800_000_000_000;

function decodePart(part: string): Record<string, unknown> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4))) as Record<string, unknown>;
}

function bytesFromBase64Url(part: string): Uint8Array<ArrayBuffer> {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function tokenResponse(token: string, expiresIn = 3600) {
  return new Response(JSON.stringify({ access_token: token, expires_in: expiresIn, token_type: "Bearer" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("parseServiceAccountKey", () => {
  it("reads a service-account JSON, including a key whose newlines were pasted as \\n", async () => {
    const { json, email } = await throwawayServiceAccount();
    const parsed = parseServiceAccountKey(json);
    expect(parsed?.clientEmail).toBe(email);
    expect(parsed?.privateKeyId).toBe("test-key-1");
    const flattened = JSON.parse(json) as Record<string, string>;
    flattened.private_key = flattened.private_key.replace(/\n/g, "\\n");
    expect(parseServiceAccountKey(JSON.stringify(flattened))?.privateKeyPem).toContain("\n");
  });

  it("fails closed on missing, malformed or foreign keys without throwing", async () => {
    const { json } = await throwawayServiceAccount();
    const base = JSON.parse(json) as Record<string, unknown>;
    expect(parseServiceAccountKey(undefined)).toBeNull();
    expect(parseServiceAccountKey("")).toBeNull();
    expect(parseServiceAccountKey("{not json")).toBeNull();
    expect(parseServiceAccountKey("[]")).toBeNull();
    expect(parseServiceAccountKey(JSON.stringify({ ...base, type: "authorized_user" }))).toBeNull();
    expect(parseServiceAccountKey(JSON.stringify({ ...base, client_email: "" }))).toBeNull();
    expect(parseServiceAccountKey(JSON.stringify({ ...base, private_key: "nope" }))).toBeNull();
    expect(parseServiceAccountKey(JSON.stringify({ ...base, token_uri: "https://evil.example/token" }))).toBeNull();
  });
});

describe("signServiceAccountJwt", () => {
  it("signs an RS256 JWT with WebCrypto that verifies with the public key and carries the read-only scope", async () => {
    const { json, publicKey, email } = await throwawayServiceAccount();
    const key = parseServiceAccountKey(json)!;
    const jwt = await signServiceAccountJwt(key, GSC_READONLY_SCOPE, NOW);
    const [header, claims, signature] = jwt.split(".");
    expect(decodePart(header)).toEqual({ alg: "RS256", typ: "JWT", kid: "test-key-1" });
    expect(decodePart(claims)).toEqual({
      iss: email,
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: GOOGLE_TOKEN_URI,
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    });
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      bytesFromBase64Url(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it("refuses any scope other than webmasters.readonly", async () => {
    const key = parseServiceAccountKey((await throwawayServiceAccount()).json)!;
    for (const scope of ["https://www.googleapis.com/auth/webmasters", "https://www.googleapis.com/auth/cloud-platform", ""]) {
      await expect(signServiceAccountJwt(key, scope, NOW)).rejects.toMatchObject({ kind: "not_configured", code: "scope_not_allowed" });
    }
  });

  it("reports a private key WebCrypto cannot import as not_configured", async () => {
    const key = parseServiceAccountKey((await throwawayServiceAccount()).json)!;
    const broken = { ...key, privateKeyPem: "-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----\n" };
    await expect(signServiceAccountJwt(broken, GSC_READONLY_SCOPE, NOW)).rejects.toMatchObject({ code: "invalid_private_key" });
  });
});

describe("createTokenProvider", () => {
  it("posts a jwt-bearer grant to Google and caches the token until five minutes before expiry", async () => {
    const key = parseServiceAccountKey((await throwawayServiceAccount()).json)!;
    let clock = NOW;
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(GOOGLE_TOKEN_URI);
      const form = new URLSearchParams(String(init?.body));
      expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
      expect(form.get("assertion")?.split(".")).toHaveLength(3);
      return tokenResponse(`token-${fetchImpl.mock.calls.length}`);
    });
    const provider = createTokenProvider({ key, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => clock });
    expect(await provider.token(GSC_READONLY_SCOPE)).toBe("token-1");
    clock += 54 * 60 * 1000;
    expect(await provider.token(GSC_READONLY_SCOPE)).toBe("token-1");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    clock += 2 * 60 * 1000;
    expect(await provider.token(GSC_READONLY_SCOPE)).toBe("token-2");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("shares one sign-in between concurrent callers and signs in again after invalidate", async () => {
    const key = parseServiceAccountKey((await throwawayServiceAccount()).json)!;
    const fetchImpl = vi.fn(async () => tokenResponse(`token-${fetchImpl.mock.calls.length}`));
    const provider = createTokenProvider({ key, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW });
    const [a, b] = await Promise.all([provider.token(GSC_READONLY_SCOPE), provider.token(GSC_READONLY_SCOPE)]);
    expect(a).toBe("token-1");
    expect(b).toBe("token-1");
    provider.invalidate(GSC_READONLY_SCOPE);
    expect(await provider.token(GSC_READONLY_SCOPE)).toBe("token-2");
  });

  it("maps token endpoint failures to safe errors that never include the key, assertion or body text", async () => {
    const { json } = await throwawayServiceAccount();
    const key = parseServiceAccountKey(json)!;
    const failing = (status: number, body: unknown) =>
      createTokenProvider({
        key,
        fetchImpl: (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch,
        now: () => NOW,
      });
    const denied = failing(400, { error: "invalid_grant", error_description: `Invalid JWT for ${key.clientEmail}` });
    const error = await denied.token(GSC_READONLY_SCOPE).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SearchApiError);
    expect(error).toMatchObject({ kind: "auth", status: 400, code: "invalid_grant" });
    const message = (error as Error).message;
    expect(message).not.toContain(key.clientEmail);
    expect(message).not.toContain("PRIVATE KEY");
    await expect(failing(429, {}).token(GSC_READONLY_SCOPE)).rejects.toMatchObject({ kind: "rate_limited" });
    await expect(failing(503, {}).token(GSC_READONLY_SCOPE)).rejects.toMatchObject({ kind: "server" });
    const offline = createTokenProvider({
      key,
      fetchImpl: (async () => {
        throw new Error("socket closed");
      }) as unknown as typeof fetch,
      now: () => NOW,
    });
    await expect(offline.token(GSC_READONLY_SCOPE)).rejects.toMatchObject({ kind: "network" });
  });

  it("refuses to mint a token for a wider scope", async () => {
    const key = parseServiceAccountKey((await throwawayServiceAccount()).json)!;
    const fetchImpl = vi.fn();
    const provider = createTokenProvider({ key, fetchImpl: fetchImpl as unknown as typeof fetch, now: () => NOW });
    await expect(provider.token("https://www.googleapis.com/auth/webmasters")).rejects.toMatchObject({ code: "scope_not_allowed" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
