import { describe, expect, it } from "vitest";
import { config } from "@/lib/assessment/config";
import { mapPressuresToOffers } from "@/lib/assessment/offers";
import { scoreAssessment } from "@/lib/assessment/score";
import { selectSuggestions } from "@/lib/assessment/suggest";
import { buildBooking, selectAssessmentPayload } from "@/lib/assessment/present";
import { decideScanLink } from "@/lib/assessment/scan-link";
import { allowAssessmentCreate, resetAssessmentIpLimit } from "@/lib/assessment/ip-limit";
import { parseCalPayload } from "@/lib/booking/cal-payload";
import { verifyCalSignature } from "@/lib/booking/cal-signature";
import { createHmac } from "node:crypto";

function scored(answers: Record<string, unknown>, scan = null as null) {
  return scoreAssessment({ answers, scan, config });
}

describe("suggestions and offers", () => {
  it("selects low, mid, and strong readiness", () => {
    const low = selectSuggestions({
      scores: scored({ R01: "0", R02: "0", R03: "3", R04: "3", R05: "3", R06: "3", R07: "3", R08: "3" }),
      answers: {},
      scan: null,
      config,
    });
    expect(low.readiness.map((s) => s.code)).toContain("READY_DATA_LOW");
    expect(low.readiness[0].severity).toBe("critical");

    const mid = selectSuggestions({
      scores: scored({ R01: "1", R02: "2", R03: "3", R04: "3", R05: "3", R06: "3", R07: "3", R08: "3" }),
      answers: {},
      scan: null,
      config,
    });
    expect(mid.readiness.map((s) => s.code)).toContain("READY_DATA_MID");

    const strong = selectSuggestions({
      scores: scored({
        R01: "3", R02: "3", R03: "3", R04: "3", R05: "3", R06: "3", R07: "3", R08: "3",
      }),
      answers: {},
      scan: { status: "unavailable" },
      config,
    });
    expect(strong.readiness.map((s) => s.code)).toEqual(["READY_STRONG"]);
  });

  it("caps readiness suggestions at three", () => {
    const allLow = selectSuggestions({
      scores: scored({}),
      answers: {},
      scan: null,
      config,
    });
    expect(allLow.readiness).toHaveLength(3);
    expect(allLow.readiness.every((s) => s.severity === "critical")).toBe(true);
  });

  it("triggers growth suggestions from low answers", () => {
    const selected = selectSuggestions({
      scores: scored({ G01: "0", G02: "1", G03: "3" }),
      answers: { G01: "0", G02: "1", G03: "3" },
      scan: { status: "pending" },
      config,
    });
    expect(selected.growth.map((s) => s.code)).toEqual(["GROWTH_ONE_CHANNEL", "GROWTH_AI_UNCHECKED"]);
    expect(selected.visibility[0].code).toBe("VIS_PENDING");
  });

  it("maps scan findings and falls back when unavailable", () => {
    const vis = selectSuggestions({
      scores: scored({}),
      answers: {},
      scan: {
        status: "complete",
        findings: [
          { code: "NO_JSON_LD_HOME", severity: "critical", passed: false },
          { code: "MISSING_LLMS_TXT", severity: "warn", passed: false },
        ],
      },
      config,
    });
    expect(vis.visibility[0].guideSlug).toBe("fix/no-json-ld-home");
    const missing = selectSuggestions({ scores: scored({}), answers: {}, scan: null, config });
    expect(missing.visibility[0].code).toBe("VIS_UNAVAILABLE");
  });

  it("offers the studio fit when nothing was selected", () => {
    expect(mapPressuresToOffers({ pressures: [], config }).map((o) => o.row)).toEqual(["custom_fit"]);
    const three = mapPressuresToOffers({
      pressures: [
        { code: "P08", severity: 3, offerRow: "sale_visit" },
        { code: "P10", severity: 2, offerRow: "one_person" },
        { code: "P05", severity: 1, offerRow: "ai_visibility" },
        { code: "P01", severity: 1, offerRow: "custom_fit" },
      ],
      config,
    });
    expect(three).toHaveLength(3);
    expect(three[0].specimens.map((s) => s.name)).toContain("Showdesk");
  });
});

describe("presentation and scan link", () => {
  it("hides results until opt-in and builds a mailto fallback", () => {
    const scores = scored({ pressure: ["P05"], severity: { P05: 2 } });
    const gated = selectAssessmentPayload({
      status: "completed",
      currentStep: "gate",
      answers: {},
      qualifiers: {},
      scores,
      optedIn: false,
      token: "tok",
      email: "a@b.co",
      name: "Ada",
      domain: "acme.example",
      config,
      scan: null,
    });
    expect(gated.results).toBeUndefined();
    expect(gated.preview?.band).toBe(scores.overall.band);
    expect(JSON.stringify(gated)).not.toContain("a@b.co");

    const open = selectAssessmentPayload({
      status: "completed",
      currentStep: "results",
      answers: { pressure: ["P05"], severity: { P05: 2 } },
      qualifiers: { Q04: "the queue" },
      scores,
      optedIn: true,
      token: "tok",
      email: "a@b.co",
      name: "Ada",
      domain: "acme.example",
      config,
      scan: null,
      calLink: null,
    });
    expect(open.results?.booking.calLink).toBeNull();
    expect(open.results?.booking.mailto).toContain("mailto:dev@pirx.ca");
    expect(open.results?.booking.mailto).toContain("acme.example");
    expect(open.results?.booking.prefill.assessment).toBe("tok");
    expect(open.results?.offers[0].row).toBe("ai_visibility");
  });

  it("includes the band in the mailto body", () => {
    const booking = buildBooking({
      calLink: "studio/working-session",
      token: "tok",
      email: "a@b.co",
      name: "Ada",
      domain: "acme.example",
      band: "forming",
      pressure: "P05",
    });
    expect(booking.calLink).toBe("studio/working-session");
    expect(decodeURIComponent(booking.mailto)).toContain("forming");
  });

  it("covers the four scan-link branches", async () => {
    const scan = { id: "1", token: "t", status: "complete" };
    await expect(
      decideScanLink({
        findNewestCompletedWithin24h: async () => scan,
        countRecentPublicScans: async () => ({ allowed: true }),
        findNewestAny: async () => null,
      }),
    ).resolves.toEqual({ action: "reuse", scan });
    await expect(
      decideScanLink({
        findNewestCompletedWithin24h: async () => null,
        countRecentPublicScans: async () => ({ allowed: true }),
        findNewestAny: async () => null,
      }),
    ).resolves.toEqual({ action: "create" });
    await expect(
      decideScanLink({
        findNewestCompletedWithin24h: async () => null,
        countRecentPublicScans: async () => ({ allowed: false }),
        findNewestAny: async () => ({ ...scan, status: "running" }),
      }),
    ).resolves.toMatchObject({ action: "reuse" });
    await expect(
      decideScanLink({
        findNewestCompletedWithin24h: async () => null,
        countRecentPublicScans: async () => ({ allowed: false }),
        findNewestAny: async () => null,
      }),
    ).resolves.toEqual({ action: "unavailable" });
  });
});

describe("limits and booking parse", () => {
  it("allows 20 creates per ip hash per day", () => {
    resetAssessmentIpLimit();
    for (let i = 0; i < 20; i++) expect(allowAssessmentCreate("ip", 1_000)).toBe(true);
    expect(allowAssessmentCreate("ip", 1_000)).toBe(false);
  });

  it("verifies and parses a Cal.com webhook", () => {
    const raw = JSON.stringify({
      triggerEvent: "BOOKING_CREATED",
      payload: {
        uid: "bk_1",
        startTime: "2026-10-01T15:00:00.000Z",
        attendees: [{ email: "a@b.co", name: "Ada" }],
        metadata: { assessment: "tok" },
      },
    });
    const sig = createHmac("sha256", "secret").update(raw).digest("hex");
    expect(verifyCalSignature(raw, sig, "secret")).toBe(true);
    expect(verifyCalSignature(raw + "x", sig, "secret")).toBe(false);
    expect(parseCalPayload(JSON.parse(raw))).toMatchObject({
      kind: "created",
      externalId: "bk_1",
      assessmentToken: "tok",
      email: "a@b.co",
    });
    expect(parseCalPayload({ triggerEvent: "PING" }).kind).toBe("ignored");
  });
});
