export const OPS_COOKIE = "rc_ops";
export const OPS_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const PASSWORD_PEPPER = "rc-ops";

async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

/** Compare passwords without leaking which one is longer. */
export async function passwordsMatch(given: string, expected: string): Promise<boolean> {
  const left = await hmacHex(PASSWORD_PEPPER, given);
  const right = await hmacHex(PASSWORD_PEPPER, expected);
  return timingSafeEqualHex(left, right);
}

export async function signOpsCookie(password: string, now = Date.now()): Promise<string> {
  const exp = now + OPS_MAX_AGE_SECONDS * 1000;
  const payload = `ops.${exp}`;
  const signature = await hmacHex(password, payload);
  return `${payload}.${signature}`;
}

export async function verifyOpsCookie(
  token: string | undefined,
  password: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token || !password) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [prefix, expRaw, signature] = parts;
  if (prefix !== "ops" || !expRaw || !signature) return false;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= now) return false;
  const expected = await hmacHex(password, `ops.${expRaw}`);
  return timingSafeEqualHex(expected, signature);
}
