import { describe, expect, it } from "vitest";
import { computeOpsPriority } from "@/lib/ops/priority";

describe("computeOpsPriority", () => {
  it("ranks low score with contact higher than high score", () => {
    const low = computeOpsPriority({ scoreTotal: 20, hasContact: true });
    const high = computeOpsPriority({ scoreTotal: 90, hasContact: true });
    expect(low).toBeGreaterThan(high);
  });

  it("penalizes missing contact", () => {
    const withEmail = computeOpsPriority({ scoreTotal: 20, hasContact: true });
    const without = computeOpsPriority({ scoreTotal: 20, hasContact: false });
    expect(withEmail).toBeGreaterThan(without);
  });

  it("uses formula (100 - score) + contact bonus", () => {
    expect(computeOpsPriority({ scoreTotal: 40, hasContact: true })).toBe(85);
    expect(computeOpsPriority({ scoreTotal: 40, hasContact: false })).toBe(60);
  });

  it("keeps the old result when the new inputs are absent", () => {
    expect(computeOpsPriority({ scoreTotal: 40, hasContact: true, readiness: null })).toBe(85);
  });

  it("adds readiness, pressure, and booking bonuses", () => {
    expect(computeOpsPriority({ scoreTotal: 40, hasContact: false, readiness: 49 })).toBe(75);
    expect(
      computeOpsPriority({ scoreTotal: 40, hasContact: false, readiness: 49, topPressureSeverity: 3, booked: true }),
    ).toBe(135);
    expect(computeOpsPriority({ scoreTotal: 40, hasContact: false, readiness: 50, topPressureSeverity: 2 })).toBe(60);
  });
});
