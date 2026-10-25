import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import { CHECK_GUIDES, guideBySlug, guidesByKind } from "@/content/check-guides";
import { config } from "@/lib/assessment/config";
import { buildBooking, selectAssessmentPayload } from "@/lib/assessment/present";
import { scoreAssessment } from "@/lib/assessment/score";
import { STAGE_IDS, stageRedirects } from "@/lib/assessment/stage-redirects";
import { AssessmentReportDocument } from "@/lib/pdf/assessment-report";

// Mixed answers so every score is a distinct, non-trivial number we can look for in the payload.
const answers: Record<string, unknown> = {
  pressure: ["P02", "P01"],
  severity: { P02: 3, P01: 1 },
  R01: "2", R02: "1", R03: "2", R04: "1",
  R05: "2", R06: "1", R07: "2", R08: "3",
  G01: "1", G02: "2", G03: "1",
};

const scores = scoreAssessment({
  answers,
  scan: {
    status: "complete",
    scoreTotal: 73,
    breakdown: { structuredData: 21, aiDiscoveryFiles: 11, aiCrawlability: 17, pageCoverage: 13, answerReadiness: 9 },
  },
  config,
});

function payload(optedIn: boolean) {
  return selectAssessmentPayload({
    status: "completed",
    currentStep: "gate",
    answers,
    qualifiers: {},
    scores,
    optedIn,
    token: "tok_abc",
    email: "ada@acme.example",
    name: "Ada",
    domain: "acme.example",
    config,
    scan: { status: "complete", findings: [], token: "scan_tok" },
    calLink: null,
  });
}

/** Every number the scoring produced, so the public payload can be checked for none of them. */
function scoreNumbers(): number[] {
  return [
    scores.overall.total,
    scores.readiness.total,
    scores.readiness.data,
    scores.readiness.process,
    scores.readiness.people,
    scores.readiness.decision,
    scores.growth.total,
    scores.visibility.total ?? 73,
  ];
}

/** The visitor's own answers come back so the check can resume; everything else must be number-free. */
function withoutOwnAnswers<T extends { answers?: unknown }>(body: T) {
  const rest: Record<string, unknown> = { ...body };
  delete rest.answers;
  return rest;
}

function numbersIn(value: unknown): number[] {
  const found: number[] = [];
  JSON.stringify(value, (_key, v) => {
    if (typeof v === "number") found.push(v);
    return v;
  });
  return found;
}

describe("visitor results show a stage and next steps, never a score", () => {
  it("still computes the score internally", () => {
    expect(scores.overall.total).toBeGreaterThan(0);
    expect(scores.overall.band).toMatch(/^(early|forming|ready|running)$/);
  });

  it("the results payload carries the stage name and next steps and no number", () => {
    const body = payload(true);
    const results = body.results!;
    expect(results.stage.id).toBe(scores.overall.band);
    expect(results.stage.label.length).toBeGreaterThan(0);
    expect(results.stage.sentence.length).toBeGreaterThan(0);
    expect(results.pressures[0]).toEqual({
      code: "P02",
      label: "Answers have to wait for two or three busy experts.",
      severityLabel: "It holds back how much we can grow",
    });
    expect(results.visibility).toEqual({ status: "complete" });
    expect(results.scan).toEqual({ token: "scan_tok", status: "complete" });
    expect(results).not.toHaveProperty("scores");
    expect(numbersIn(withoutOwnAnswers(body))).toEqual([]);
    const json = JSON.stringify(body);
    expect(json).not.toMatch(/"(scores|total|scoreTotal|breakdown|weights|score)"/);
  });

  it("the gate preview names the stage only", () => {
    const body = payload(false);
    expect(body.results).toBeUndefined();
    expect(body.preview).toEqual({ stage: scores.overall.band, stageLabel: expect.any(String) });
    expect(numbersIn(withoutOwnAnswers(body))).toEqual([]);
  });

  it("the payload never includes any of the computed score values as text either", () => {
    const json = JSON.stringify(withoutOwnAnswers(payload(true)));
    for (const n of scoreNumbers()) {
      expect(json).not.toMatch(new RegExp(`(^|[^\\w.-])${n}([^\\w.-]|$)`));
    }
  });

  it("the booking email names the stage, not a band or a number", () => {
    const booking = buildBooking({
      calLink: null,
      token: "t",
      email: "a@b.c",
      name: "A",
      domain: "acme.example",
      band: "forming",
      stageLabel: "Forming",
      pressure: "",
    });
    expect(decodeURIComponent(booking.mailto)).toContain("Stage: Forming");
    expect(decodeURIComponent(booking.mailto)).not.toMatch(/band/i);
  });

  it("the PDF report renders from the score-free payload", async () => {
    const results = payload(true).results!;
    const buffer = await renderToBuffer(createElement(AssessmentReportDocument, { results }));
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });
});

describe("stage guides replace band guides", () => {
  it("has a stage guide for every stage and no band guides", () => {
    expect(guidesByKind("stage").map((g) => g.slug).sort()).toEqual(STAGE_IDS.map((id) => `stage/${id}`).sort());
    expect(CHECK_GUIDES.some((g) => g.slug.startsWith("band/"))).toBe(false);
    for (const band of config.bands) expect(guideBySlug(`stage/${band.id}`)).toBeTruthy();
  });

  it("no guide promises a score or a band", () => {
    const text = JSON.stringify(CHECK_GUIDES);
    expect(text).not.toMatch(/\bscores?\b/i);
    expect(text).not.toMatch(/\bband\b/i);
  });

  it("visitor-facing copy in the config promises no score", () => {
    const copy = JSON.stringify(config.copy);
    expect(copy).not.toMatch(/\bscor/i);
    expect(copy).not.toMatch(/\bband\b/i);
    expect(copy).not.toMatch(/\bfree\b/i);
  });

  it("llms.txt describes a stage and next steps, not scores", async () => {
    const text = await llmsTxt().text();
    expect(text).toContain("stage name and next steps");
    expect(text).not.toMatch(/that scores|Scores are/);
    expect(text).not.toContain("/check/guide/band/");
  });
});

describe("old band URLs redirect", () => {
  const rules = stageRedirects();
  function resolve(path: string): string | null {
    for (const rule of rules) {
      const pattern = new RegExp(
        `^${rule.source
          .replace(/:stage\(([^)]+)\)/, "(?<stage>$1)")
          .replace(/\/:path\*$/, "(?:/.*)?")}$`,
      );
      const match = path.match(pattern);
      if (match) return rule.destination.replace(":stage", match.groups?.stage ?? "");
    }
    return null;
  }

  it("sends each known band to its stage guide", () => {
    for (const id of STAGE_IDS) {
      expect(resolve(`/check/guide/band/${id}`)).toBe(`/check/guide/stage/${id}`);
      expect(resolve(`/band/${id}`)).toBe(`/check/guide/stage/${id}`);
    }
  });

  it("sends anything else under /band to the check", () => {
    expect(resolve("/band/unknown")).toBe("/check");
    expect(resolve("/band")).toBe("/check");
    expect(resolve("/check/guide/band/whatever")).toBe("/check");
    expect(resolve("/check/guide/stage/forming")).toBeNull();
  });

  it("every redirect is permanent", () => {
    expect(rules.every((rule) => rule.permanent)).toBe(true);
  });
});
