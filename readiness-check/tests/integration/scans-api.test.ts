import { describe, expect, it, vi } from "vitest";
import { countRecentPublicScans } from "@/lib/rate-limit";
import { selectScanPayload, type FullScanView } from "@/lib/scan/present";
import { normalizeDomain } from "@/lib/domain";

/**
 * Integration-style coverage for scan create/status soft-gate + rate-limit
 * without live Supabase/Inngest. Handlers compose these pure/injected helpers.
 */

describe("scans API helpers (soft gate + rate limit)", () => {
  it("maps create body through normalizeDomain for public scans", () => {
    const { domain, origin } = normalizeDomain("https://www.Acme.example/");
    expect(domain).toBe("acme.example");
    expect(origin).toBe("https://acme.example");
  });

  it("rate-limits public create when 3 scans already exist", async () => {
    const gte = vi.fn().mockResolvedValue({ count: 3, error: null });
    const eqSource = vi.fn(() => ({ gte }));
    const eqDomain = vi.fn(() => ({ eq: eqSource }));
    const select = vi.fn(() => ({ eq: eqDomain }));
    const from = vi.fn(() => ({ select }));

    const result = await countRecentPublicScans("acme.example", { from } as never);
    expect(result.allowed).toBe(false);
    expect(result.count).toBe(3);
  });

  it("builds locked GET payload without pages", () => {
    const full: FullScanView = {
      domain: "acme.example",
      status: "complete",
      scoreTotal: 55,
      scoreBreakdown: { structuredData: 10 },
      findings: [
        {
          code: "NO_ORG_SCHEMA",
          severity: "critical",
          passed: false,
          message: "Missing Organization",
        },
        {
          code: "MISSING_FAQ_SCHEMA",
          severity: "warn",
          passed: false,
          message: "No FAQ",
        },
      ],
      pages: [
        {
          url: "https://acme.example/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
      ],
    };

    const locked = selectScanPayload(full, false);
    expect(locked).toMatchObject({
      domain: "acme.example",
      status: "complete",
      scoreTotal: 55,
      unlocked: false,
    });
    expect(locked.topGaps).toHaveLength(2);
    expect(locked.pillarWhy.structuredData.bullets.length).toBeGreaterThan(0);
    expect(locked.pagesMissingJsonLd).toEqual([
      { url: "https://acme.example/", pageType: "home" },
    ]);
    expect(locked).not.toHaveProperty("pages");
    expect(locked).not.toHaveProperty("findings");
  });

  it("builds unlocked GET payload with pages when cookie gate opens", () => {
    const full: FullScanView = {
      domain: "acme.example",
      status: "complete",
      scoreTotal: 55,
      scoreBreakdown: {},
      findings: [
        {
          code: "NO_ORG_SCHEMA",
          severity: "critical",
          passed: false,
          message: "Missing Organization",
        },
      ],
      pages: [
        {
          url: "https://acme.example/",
          pageType: "home",
          fetchStatus: "ok",
          hasJsonLd: false,
          schemaTypes: [],
        },
      ],
    };

    // Public unlock: scan_unlock_${token} cookie === '1' (no query bypass)
    const unlocked = selectScanPayload(full, true);
    expect(unlocked.unlocked).toBe(true);
    if (unlocked.unlocked) {
      expect(unlocked.pages).toHaveLength(1);
      expect(unlocked.findings).toHaveLength(1);
    }
  });
});
