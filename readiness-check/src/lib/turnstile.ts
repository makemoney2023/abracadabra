type SiteverifyResponse = { success?: boolean };

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Skip the check when no secret is configured so local tests can post email alone. */
export async function assertTurnstile(
  token: string | undefined,
  fetchImpl: FetchImpl = fetch,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim() ?? "";
  if (!secret) return { ok: true };
  if (!token?.trim()) return { ok: false, error: "Complete the check" };
  const body = new URLSearchParams({ secret, response: token });
  const response = await fetchImpl(SITEVERIFY, { method: "POST", body });
  let data: SiteverifyResponse;
  try {
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, error: "Check failed" };
  }
  if (!data.success) return { ok: false, error: "Check failed" };
  return { ok: true };
}
