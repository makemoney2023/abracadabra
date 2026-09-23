const PUBLIC_SCAN_LIMIT = 3;
const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Minimal Supabase-like client surface for counting recent public scans. */
export type RateLimitClient = {
  // `any` avoids Supabase generic deep-instantiation while remaining mockable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
};

/**
 * Count public scans for a domain in the last 24 hours.
 * Limit: 3 public scans / domain / day.
 */
export async function countRecentPublicScans(
  domain: string,
  client: RateLimitClient,
): Promise<RateLimitResult> {
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { count, error } = await client
    .from("scans")
    .select("*", { count: "exact", head: true })
    .eq("domain", domain)
    .eq("source", "public")
    .gte("created_at", since);

  if (error) {
    throw new Error(`Rate limit check failed: ${error.message}`);
  }

  const n = count ?? 0;
  return { allowed: n < PUBLIC_SCAN_LIMIT, count: n };
}

export { PUBLIC_SCAN_LIMIT };
