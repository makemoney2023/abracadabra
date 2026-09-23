export type ScanRef = { id: string; token: string; status: string };

export type ScanLinkDecision =
  | { action: "reuse"; scan: ScanRef }
  | { action: "create" }
  | { action: "unavailable" };

/**
 * newest completed public scan within 24h → reuse
 * else if the public rate limit allows → create
 * else newest scan of any status → reuse
 * else unavailable
 */
export async function decideScanLink(deps: {
  findNewestCompletedWithin24h: () => Promise<ScanRef | null>;
  countRecentPublicScans: () => Promise<{ allowed: boolean }>;
  findNewestAny: () => Promise<ScanRef | null>;
}): Promise<ScanLinkDecision> {
  const recent = await deps.findNewestCompletedWithin24h();
  if (recent) return { action: "reuse", scan: recent };
  const limit = await deps.countRecentPublicScans();
  if (limit.allowed) return { action: "create" };
  const any = await deps.findNewestAny();
  if (any) return { action: "reuse", scan: any };
  return { action: "unavailable" };
}
