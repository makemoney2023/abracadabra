import { generateKeyPairSync, createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { githubSignature, githubSignatureOk, signGithubAppJwt } from "./sign";

const SECRET = "github-webhook-secret";
const BODY = JSON.stringify({ zen: "keep it small" });

describe("githubSignature", () => {
  it("prefixes a hex HMAC of the raw body", () => {
    const signature = githubSignature(SECRET, BODY);
    expect(signature.startsWith("sha256=")).toBe(true);
    expect(signature.slice("sha256=".length)).toMatch(/^[0-9a-f]{64}$/);
    expect(githubSignatureOk(SECRET, BODY, signature)).toBe(true);
  });

  it("rejects a bad signature, a short header, and a missing secret", () => {
    const signature = githubSignature(SECRET, BODY);
    expect(githubSignatureOk(SECRET, BODY, "sha256=00")).toBe(false);
    expect(githubSignatureOk(SECRET, BODY, signature.slice(0, -1))).toBe(false);
    expect(githubSignatureOk("", BODY, signature)).toBe(false);
    expect(githubSignatureOk(SECRET, `${BODY} `, signature)).toBe(false);
  });
});

describe("signGithubAppJwt", () => {
  it("signs an RS256 token for the app id", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const now = 1_700_000_000_000;
    const token = signGithubAppJwt("12345", pem, now);
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual({
      iat: 1_700_000_000 - 60,
      exp: 1_700_000_000 + 540,
      iss: "12345",
    });
    const ok = createVerify("RSA-SHA256")
      .update(`${header}.${payload}`)
      .verify(publicKey, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
  });
});
