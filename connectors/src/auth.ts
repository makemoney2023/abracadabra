async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

/** Constant-time bearer check. An empty expected token never matches. */
export async function bearerMatches(authorization: string | null, expected: string): Promise<boolean> {
  const token = expected.trim();
  if (!token) return false;
  const provided = /^Bearer\s+(\S+)\s*$/i.exec(authorization ?? "")?.[1] ?? "";
  const [left, right] = await Promise.all([sha256(provided), sha256(token)]);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}
