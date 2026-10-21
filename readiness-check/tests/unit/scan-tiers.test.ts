import { describe, expect, it } from "vitest";
import { dispatchJob, InvalidJobError, isJobBody } from "@/lib/jobs/dispatch";
import { perTypeFirstPass, prioritizeUrls } from "@/lib/prioritize-urls";
import { DEFAULT_TIER_LIMITS, MAX_TIER_PAGES, resolveTier, tierConfig } from "@/lib/scan/tiers";

describe("scan tiers", () => {
  it("defaults to free 40, deep 200 and 1000, with deep scans off", () => {
    const config = tierConfig({});
    expect(config).toEqual({ deepEnabled: false, limits: { free: 40, "deep-200": 200, "deep-1000": 1000 } });
    expect(DEFAULT_TIER_LIMITS.free).toBe(40);
  });

  it("refuses deep tiers while the flag is off, and allows them when it is on", () => {
    expect(resolveTier(undefined, tierConfig({}))).toEqual({ ok: true, tier: "free", pageLimit: 40 });
    expect(resolveTier("free", tierConfig({}))).toEqual({ ok: true, tier: "free", pageLimit: 40 });
    expect(resolveTier("deep-200", tierConfig({}))).toEqual({ ok: false, reason: "deep_scan_disabled" });
    expect(resolveTier("deep-1000", tierConfig({ DEEP_SCAN_ENABLED: "true" }))).toEqual({ ok: false, reason: "deep_scan_disabled" });
    expect(resolveTier("deep-1000", tierConfig({ DEEP_SCAN_ENABLED: "1" }))).toEqual({ ok: true, tier: "deep-1000", pageLimit: 1000 });
    expect(resolveTier("deep-5000", tierConfig({ DEEP_SCAN_ENABLED: "1" }))).toEqual({ ok: false, reason: "unknown_tier" });
  });

  it("reads tier limits from config, clamped to the 1,000-page ceiling", () => {
    const config = tierConfig({ SCAN_TIER_LIMITS: "deep-200=250, deep-1000=5000, free=nope, bogus=3" });
    expect(config.limits).toEqual({ free: 40, "deep-200": 250, "deep-1000": MAX_TIER_PAGES });
  });

  it("keeps the one-fifth type cap at every page budget", () => {
    expect(perTypeFirstPass(40)).toBe(8);
    expect(perTypeFirstPass(200)).toBe(40);
    expect(perTypeFirstPass(1000)).toBe(200);
    const origin = "https://acme.example";
    const sitemapUrls = [
      ...Array.from({ length: 900 }, (_, i) => `${origin}/blog/post-${i}`),
      ...Array.from({ length: 300 }, (_, i) => `${origin}/portfolio/item-${i}`),
    ];
    const picked = prioritizeUrls({ origin, sitemapUrls, searchUrls: [], seedUrls: [], maxPages: 200 });
    expect(picked).toHaveLength(200);
    // 1 home + 40 blog posts + 40 portfolio in the first pass, then the overflow fills the rest in sitemap order.
    expect(picked.slice(0, 81).filter((p) => p.url.includes("/portfolio/"))).toHaveLength(40);
    expect(prioritizeUrls({ origin, sitemapUrls, searchUrls: [], seedUrls: [] })).toHaveLength(40);
  });
});

describe("chunked scan jobs", () => {
  it("accepts chunk, finalize and watchdog jobs and rejects malformed ones", () => {
    expect(isJobBody({ type: "scan-chunk", scanId: "s", chunk: 0 })).toBe(true);
    expect(isJobBody({ type: "scan-chunk", scanId: "s", chunk: -1 })).toBe(false);
    expect(isJobBody({ type: "scan-chunk", scanId: "s", chunk: 1.5 })).toBe(false);
    expect(isJobBody({ type: "scan-chunk", scanId: "s" })).toBe(false);
    expect(isJobBody({ type: "scan-finalize", scanId: "s" })).toBe(true);
    expect(isJobBody({ type: "scan-watchdog", scanId: "" })).toBe(false);
  });

  it("routes chunk steps to their handler, and rejects them without one", async () => {
    const seen: unknown[] = [];
    const handlers = { runScan: async () => {}, runProspect: async () => {}, runScanStep: async (job: unknown) => void seen.push(job) };
    await dispatchJob({ type: "scan-chunk", scanId: "s", chunk: 2 }, {}, handlers);
    await dispatchJob({ type: "scan-watchdog", scanId: "s" }, {}, handlers);
    expect(seen).toEqual([{ type: "scan-chunk", scanId: "s", chunk: 2 }, { type: "scan-watchdog", scanId: "s" }]);
    await expect(
      dispatchJob({ type: "scan-finalize", scanId: "s" }, {}, { runScan: async () => {}, runProspect: async () => {} }),
    ).rejects.toBeInstanceOf(InvalidJobError);
  });
});

describe("tier prices", () => {
  it("prices the deep tiers with fix files included and keeps the free scan free", async () => {
    const { TIER_PRICES } = await import("@/lib/scan/tiers");
    expect(TIER_PRICES.free).toMatchObject({ amountCents: 0, includesFixFiles: false });
    expect(TIER_PRICES["deep-200"]).toMatchObject({ amountCents: 9999, display: "$99.99", currency: "usd", includesFixFiles: true });
    expect(TIER_PRICES["deep-1000"]).toMatchObject({ amountCents: 24999, display: "$249.99", currency: "usd", includesFixFiles: true });
  });
});
