import { MAX_PAGES } from "@/lib/scoring/constants";

/** Free is today's 40-page scan. The deep tiers are built but off until pricing and checkout are decided. */
export type ScanTier = "free" | "deep-200" | "deep-1000";

export const SCAN_TIERS: readonly ScanTier[] = ["free", "deep-200", "deep-1000"];

export const DEFAULT_TIER_LIMITS: Readonly<Record<ScanTier, number>> = {
  free: MAX_PAGES,
  "deep-200": 200,
  "deep-1000": 1000,
};

/** Hard ceiling whatever the config says: one plan stays well inside a Worker's memory and D1 limits. */
export const MAX_TIER_PAGES = 1000;

/** URLs per chunk message. Each chunk is fetched, parsed and written in its own invocation. */
export const CHUNK_SIZE = 50;

export type TierEnv = { DEEP_SCAN_ENABLED?: string; SCAN_TIER_LIMITS?: string };

export type TierConfig = {
  deepEnabled: boolean;
  limits: Record<ScanTier, number>;
};

export function isScanTier(value: unknown): value is ScanTier {
  return typeof value === "string" && (SCAN_TIERS as readonly string[]).includes(value);
}

export function isDeepTier(tier: ScanTier): boolean {
  return tier !== "free";
}

function parseLimits(raw: string | undefined): Partial<Record<ScanTier, number>> {
  const out: Partial<Record<ScanTier, number>> = {};
  for (const part of (raw ?? "").split(",")) {
    const [name, value] = part.split("=").map((item) => item.trim());
    if (!isScanTier(name)) continue;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1) continue;
    out[name] = Math.min(n, MAX_TIER_PAGES);
  }
  return out;
}

export function tierConfig(env: TierEnv = {}): TierConfig {
  return {
    deepEnabled: env.DEEP_SCAN_ENABLED?.trim() === "1",
    limits: { ...DEFAULT_TIER_LIMITS, ...parseLimits(env.SCAN_TIER_LIMITS) },
  };
}

export type TierDecision =
  | { ok: true; tier: ScanTier; pageLimit: number }
  | { ok: false; reason: "unknown_tier" | "deep_scan_disabled" };

/** The tier a new scan may run at. Deep tiers need the flag; nothing here charges anyone. */
export function resolveTier(requested: unknown, config: TierConfig): TierDecision {
  const tier = requested === undefined || requested === null || requested === "" ? "free" : requested;
  if (!isScanTier(tier)) return { ok: false, reason: "unknown_tier" };
  if (isDeepTier(tier) && !config.deepEnabled) return { ok: false, reason: "deep_scan_disabled" };
  return { ok: true, tier, pageLimit: config.limits[tier] };
}
