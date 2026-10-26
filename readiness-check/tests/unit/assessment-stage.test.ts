import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { GET as llmsTxt } from "@/app/llms.txt/route";
import { CHECK_GUIDES, guideBySlug, guidesByKind } from "@/content/check-guides";
import { config } from "@/lib/assessment/config";
import { buildBooking, costliestJobSentence, selectAssessmentPayload } from "@/lib/assessment/present";
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
    scan: {
      status: "complete",
      findings: [],
      token: "scan_tok",
      scoreTotal: 73,
      breakdown: { structuredData: 21, aiDiscoveryFiles: 11, aiCrawlability: 17, pageCoverage: 13, answerReadiness: 9 },
    },
    calLink: null,
  });
}

describe("visitor results show the scores together with the stage and next steps", () => {
  it("computes the score and the stage from the same band", () => {
    expect(scores.overall.total).toBeGreaterThan(0);
    expect(scores.overall.band).toMatch(/^(early|forming|ready|running)$/);
  });

  it("the results payload carries the scores, the stage name and next steps", () => {
    const body = payload(true);
    const results = body.results!;
    // Stage and next steps from #225 stay.
    expect(results.stage.id).toBe(scores.overall.band);
    expect(results.stage.label.length).toBeGreaterThan(0);
    expect(results.stage.sentence.length).toBeGreaterThan(0);
    expect(results.pressures[0]).toEqual({
      code: "P02",
      label: "Answers have to wait for two or three busy experts.",
      severityLabel: "It holds back how much we can grow",
    });
    expect(results.visibility).toEqual({ status: "complete" });
    // Scores are back, in the same shape as before #225.
    expect(results.scores).toEqual(scores);
    expect(results.scores.readiness).toMatchObject({
      total: expect.any(Number),
      data: expect.any(Number),
      process: expect.any(Number),
      people: expect.any(Number),
      decision: expect.any(Number),
    });
    expect(results.scores.growth.total).toEqual(expect.any(Number));
    expect(results.scores.visibility.total).toBe(73);
    expect(results.bandLabel).toBe(results.stage.label);
    expect(results.bandSentence).toBe(results.stage.sentence);
    expect(results.scan).toEqual({
      token: "scan_tok",
      status: "complete",
      scoreTotal: 73,
      breakdown: { structuredData: 21, aiDiscoveryFiles: 11, aiCrawlability: 17, pageCoverage: 13, answerReadiness: 9 },
    });
  });

  it("the gate preview names the stage and holds the scores back until the email", () => {
    const body = payload(false);
    expect(body.results).toBeUndefined();
    expect(body.preview).toEqual({
      stage: scores.overall.band,
      stageLabel: expect.any(String),
      band: scores.overall.band,
      bandLabel: expect.any(String),
    });
    expect(JSON.stringify(body.preview)).not.toMatch(/\d/);
  });

  it("the costliest job line never doubles the period", () => {
    expect(costliestJobSentence("Only one person knows how an important job gets done.")).toBe(
      "The job that costs the most right now: Only one person knows how an important job gets done.",
    );
    expect(costliestJobSentence("Quotes take too long")).toBe("The job that costs the most right now: Quotes take too long.");
    expect(costliestJobSentence("Trailing dots... ")).toBe("The job that costs the most right now: Trailing dots.");
    expect(costliestJobSentence(null)).toBe("");
    expect(costliestJobSentence(" . ")).toBe("");
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

  it("the PDF report renders the stage and the scores", async () => {
    const results = payload(true).results!;
    const buffer = await renderToBuffer(createElement(AssessmentReportDocument, { results }));
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("the PDF report prints the stage, every score and the next steps", () => {
    const results = payload(true).results!;
    const text = pdfText(createElement(AssessmentReportDocument, { results }));
    expect(text).toContain(results.stage.label);
    expect(text).toContain(`Overall score ${scores.overall.total} of 100`);
    expect(text).toContain(`Readiness ${scores.readiness.total} of 100`);
    expect(text).toContain(`Data ${scores.readiness.data}`);
    expect(text).toContain(`Decision ${scores.readiness.decision}`);
    expect(text).toContain(`Growth ${scores.growth.total} of 100`);
    expect(text).toContain("Website visibility 73 of 100");
    expect(text).toContain("Next steps for how the work runs");
    expect(text).not.toContain("..");
  });
});

/** Every string child in a react-pdf element tree, joined, so the test can read what the PDF prints. */
function pdfText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(pdfText).join("");
  if (typeof node === "object" && "type" in (node as object)) {
    const element = node as { type: unknown; props: { children?: unknown } };
    if (typeof element.type === "function") {
      return pdfText((element.type as (p: unknown) => unknown)(element.props));
    }
    return `${pdfText(element.props.children)}\n`;
  }
  return "";
}

describe("stage guides replace band guides", () => {
  it("has a stage guide for every stage and no band guides", () => {
    expect(guidesByKind("stage").map((g) => g.slug).sort()).toEqual(STAGE_IDS.map((id) => `stage/${id}`).sort());
    expect(CHECK_GUIDES.some((g) => g.slug.startsWith("band/"))).toBe(false);
    for (const band of config.bands) expect(guideBySlug(`stage/${band.id}`)).toBeTruthy();
  });

  it("no guide talks about bands", () => {
    const text = JSON.stringify(CHECK_GUIDES);
    expect(text).not.toMatch(/\bband\b/i);
  });

  it("visitor-facing copy in the config promises a score and the stage, and never says free", () => {
    const copy = JSON.stringify(config.copy);
    expect(copy).toMatch(/\bscore\b/i);
    expect(copy).toMatch(/\bstage\b/i);
    expect(copy).not.toMatch(/\bband\b/i);
    expect(copy).not.toMatch(/\bfree\b/i);
  });

  it("llms.txt describes the scores, a stage and next steps", async () => {
    const text = await llmsTxt().text();
    expect(text).toContain("the scores, a stage name and next steps");
    expect(text).not.toMatch(/no numeric score/i);
    expect(text).not.toMatch(/\bfree\b/i);
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
