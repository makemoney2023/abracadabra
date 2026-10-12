/** Tell Handoff a run finished. The one-minute cron settles it if this call does not land. */
export async function notifyHandoffSettled(
  env: { HANDOFF_ORIGIN?: string; SWARM_RUN_SECRET?: string },
  runId: string,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<void> {
  const origin = env.HANDOFF_ORIGIN?.trim().replace(/\/$/, "") ?? "";
  const secret = env.SWARM_RUN_SECRET?.trim() ?? "";
  if (!origin || !secret || !runId.trim()) return;
  const body = JSON.stringify({ runId, sentAt: now });
  try {
    await fetchImpl(`${origin}/api/swarm-settled`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-handoff-signature": await hmacHex(secret, body),
      },
      body,
    });
  } catch {
    // The handoff cron remains the fallback.
  }
}

export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
