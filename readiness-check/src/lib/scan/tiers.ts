import { MAX_PAGES } from "@/lib/scoring/constants";

/** Free is today's 40-page scan. The deep tiers are built and priced but off (DEEP_SCAN_ENABLED) until checkout is wired. */
export type ScanTier = "free" | "deep-200" | "deep-1000";

export const SCAN_TIERS: readonly ScanTier[] = ["free", "deep-200", "deep-1000"];

export const DEFAULT_TIER_LIMITS: Readonly<Record<ScanTier, number>> = {
  free: MAX_PAGES,
  "deep-200": 200,
  "deep-1000": 1000,
};

export type TierPrice = {
  /** What we charge, in cents. 0 for the free scan. */
  amountCents: number;
  currency: "usd";
  /** As shown to buyers. */
  display: string;
  /** The generated fix files come with the scan (the free scan sells them separately). */
  includesFixFiles: boolean;
  label: string;
};

/**
 * Tier prices. Nothing charges these yet: checkout for the deep tiers is not wired, and the tiers stay behind
 * DEEP_SCAN_ENABLED. The free scan's separate fix-file offer (PRICE_DISPLAY / PRICE_AMOUNT_CENTS) is unchanged.
 */
export const TIER_PRICES: Readonly<Record<ScanTier, TierPrice>> = {
  free: { amountCents: 0, currency: "usd", display: "Free", includesFixFiles: false, label: "Free scan, 40 pages" },
  "deep-200": {
    amountCents: 9999,
    currency: "usd",
    display: "$99.99",
    includesFixFiles: true,
    label: "Deep scan, 200 pages, fix files included",
  },
  "deep-1000": {
    amountCents: 24999,
    currency: "usd",
    display: "$249.99",
    includesFixFiles: true,
    label: "Deep scan, 1,000 pages, fix files included",
  },
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
