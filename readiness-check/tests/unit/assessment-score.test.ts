import { describe, expect, it } from "vitest";
import { bandFor } from "@/lib/assessment/bands";
import { config } from "@/lib/assessment/config";
import { scoreAssessment } from "@/lib/assessment/score";

function all(value: "0" | "1" | "2" | "3") {
  const answers: Record<string, unknown> = {
    pressure: [],
    R01: value, R02: value, R03: value, R04: value,
    R05: value, R06: value, R07: value, R08: value,
    G01: value, G02: value, G03: value,
  };
  return answers;
}

describe("scoreAssessment", () => {
  it("scores the extremes", () => {
    const zero = scoreAssessment({ answers: all("0"), scan: null, config });
    expect(zero.readiness.total).toBe(0);
    expect(zero.growth.total).toBe(0);
    expect(zero.overall.total).toBe(0);
    expect(zero.overall.band).toBe("early");
    expect(zero.overall.weights).toEqual({ readiness: 0.7, visibility: 0, growth: 0.3 });

    const full = scoreAssessment({
      answers: all("3"),
      scan: { status: "complete", scoreTotal: 100, breakdown: null },
      config,
    });
    expect(full.readiness).toMatchObject({ data: 100, process: 100, people: 100, decision: 100, total: 100 });
    expect(full.growth.total).toBe(100);
    expect(full.visibility).toMatchObject({ total: 100, status: "complete" });
    expect(full.overall.total).toBe(100);
    expect(full.overall.band).toBe("running");
    expect(full.overall.weights.visibility).toBe(0.3);
  });

  it("reweights when visibility is missing and stays deterministic", () => {
    const pending = scoreAssessment({
      answers: all("3"),
      scan: { status: "running", scoreTotal: null, breakdown: null },
      config,
    });
    expect(pending.visibility.status).toBe("pending");
    expect(pending.overall.total).toBe(100);
    expect(pending.overall.weights).toEqual({ readiness: 0.7, visibility: 0, growth: 0.3 });
    const again = scoreAssessment({
      answers: all("3"),
      scan: { status: "running", scoreTotal: null, breakdown: null },
      config,
    });
    expect(again).toEqual(pending);
  });

  it("uses the weighted blend when a scan score exists", () => {
    const mixed = scoreAssessment({
      answers: { ...all("0"), R01: "3", R02: "3" },
      scan: { status: "complete", scoreTotal: 40, breakdown: null },
      config,
    });
    expect(mixed.readiness.data).toBe(100);
    expect(mixed.readiness.process).toBe(0);
    expect(mixed.visibility.total).toBe(40);
    expect(mixed.overall.weights.readiness).toBe(0.5);
  });

  it("flags an unanswered sub-dimension", () => {
    const scores = scoreAssessment({ answers: { R03: "3", R04: "3" }, scan: null, config });
    expect(scores.readiness.incomplete.data).toBe(true);
    expect(scores.readiness.data).toBe(0);
    expect(scores.readiness.process).toBe(100);
  });

  it("orders pressures by severity, then selection", () => {
    const scores = scoreAssessment({
      answers: { pressure: ["P02", "P01", "P05"], severity: { P02: 1, P01: 3, P05: 3 } },
      scan: null,
      config,
    });
    expect(scores.pressures.map((p) => p.code)).toEqual(["P01", "P05", "P02"]);
    expect(scores.topPressure).toBe("P01");
    expect(scores.pressures[0].offerRow).toBe("custom_fit");
  });

  it("places every band boundary", () => {
    expect(bandFor(39, config).id).toBe("early");
    expect(bandFor(40, config).id).toBe("forming");
    expect(bandFor(59, config).id).toBe("forming");
    expect(bandFor(60, config).id).toBe("ready");
    expect(bandFor(79, config).id).toBe("ready");
    expect(bandFor(80, config).id).toBe("running");
  });
});
