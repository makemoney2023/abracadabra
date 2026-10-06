import { describe, expect, it } from "vitest";
import { dayLabel, dayToUtc } from "./dates";

describe("dayToUtc", () => {
  it("turns a calendar day into UTC midnight", () => {
    expect(dayToUtc("")).toBeNull();
    expect(dayToUtc("  ")).toBeNull();
    expect(dayToUtc("2026-10-06")).toBe(Date.parse("2026-10-06T00:00:00.000Z"));
    expect(dayLabel(dayToUtc("2026-10-06") as number)).toBe("2026-10-06");
  });

  it("rejects a date that is not a real calendar day", () => {
    expect(dayToUtc("10/06/2026")).toBe("bad");
    expect(dayToUtc("2026-02-31")).toBe("bad");
    expect(dayToUtc("2026-13-01")).toBe("bad");
    expect(dayToUtc("2026-02-29")).toBe("bad");
  });
});
