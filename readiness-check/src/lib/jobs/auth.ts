/** Constant-time comparison for the internal job token. An empty token never matches. */
export function tokensMatch(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.byteLength !== b.byteLength || a.byteLength === 0) return false;
  let mismatch = 0;
  for (let i = 0; i < a.byteLength; i += 1) mismatch |= a[i]! ^ b[i]!;
  return mismatch === 0;
}
