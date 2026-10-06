const FIVE_MINUTES = 5 * 60 * 1000;

export async function signIntakeBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

export async function verifyIntakeRequest(input: {
  secret: string;
  body: string;
  signature: string;
  timestamp: string;
  now: number;
}): Promise<{ ok: true } | { ok: false; error: "bad_signature" | "stale" }> {
  const secret = input.secret.trim();
  if (!secret) return { ok: false, error: "bad_signature" };
  const expected = await signIntakeBody(secret, input.body);
  const got = input.signature.trim().toLowerCase();
  if (!sameHex(expected, got)) return { ok: false, error: "bad_signature" };
  const stamp = Number(input.timestamp);
  if (!Number.isFinite(stamp) || Math.abs(input.now - stamp) > FIVE_MINUTES) {
    return { ok: false, error: "stale" };
  }
  return { ok: true };
}
