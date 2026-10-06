import { createHmac, createSign, timingSafeEqual } from "node:crypto";

/** GitHub sends `sha256=` plus the hex HMAC of the raw body. */
export function githubSignature(secret: string, body: string): string {
  const hex = createHmac("sha256", secret).update(body).digest("hex");
  return `sha256=${hex}`;
}

export function githubSignatureOk(secret: string, body: string, header: string): boolean {
  if (!secret) return false;
  const expected = Buffer.from(githubSignature(secret, body));
  const actual = Buffer.from(header);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/** A private key pasted into an env var often stores newlines as the two characters `\n`. */
export function githubPrivateKey(pem: string): string {
  if (pem.includes("\n")) return pem;
  return pem.replace(/\\n/g, "\n");
}

function base64Url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

/** Short-lived RS256 JWT. GitHub wants iat a minute ago and exp under 10 minutes. */
export function signGithubAppJwt(appId: string, pem: string, nowMs: number): string {
  const nowSec = Math.floor(nowMs / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iat: nowSec - 60, exp: nowSec + 540, iss: appId }));
  const data = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(data).sign(githubPrivateKey(pem));
  return `${data}.${signature.toString("base64url")}`;
}
