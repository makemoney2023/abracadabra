import { describe, expect, it } from "vitest";
import { formatBytes, formatCount, formatMoney, formatRelative, initials } from "./format";

const now = new Date("2026-03-10T12:00:00Z");

describe("formatCount", () => {
  it("adds thousands separators", () => {
    expect(formatCount(1240)).toBe("1,240");
    expect(formatCount(0)).toBe("0");
    expect(formatCount(1000000)).toBe("1,000,000");
  });
});

describe("formatRelative", () => {
  it("says now for under a minute", () => {
    expect(formatRelative(new Date("2026-03-10T11:59:30Z"), now)).toBe("now");
  });

  it("uses minutes, hours, and days", () => {
    expect(formatRelative(new Date("2026-03-10T11:55:00Z"), now)).toBe("5m");
    expect(formatRelative(new Date("2026-03-10T10:00:00Z"), now)).toBe("2h");
    expect(formatRelative(new Date("2026-03-07T12:00:00Z"), now)).toBe("3d");
  });

  it("switches to a short date after a week", () => {
    expect(formatRelative(new Date("2026-03-04T12:00:00Z").getTime() - 86400000 * 2, now)).toBe(
      "Mar 2",
    );
  });

  it("adds the year when the date is in another year", () => {
    expect(formatRelative("2025-03-04T12:00:00Z", now)).toBe("Mar 4, 2025");
  });

  it("accepts ISO strings and milliseconds", () => {
    expect(formatRelative("2026-03-10T11:55:00Z", now)).toBe("5m");
    expect(formatRelative(now.getTime() - 60_000 * 5, now)).toBe("5m");
  });

  it("treats future dates as now", () => {
    expect(formatRelative(new Date("2026-03-10T12:30:00Z"), now)).toBe("now");
  });
});

describe("formatMoney", () => {
  it("formats cents as dollars", () => {
    expect(formatMoney(0)).toBe("$0");
    expect(formatMoney(99)).toBe("$0.99");
    expect(formatMoney(125000)).toBe("$1,250");
    expect(formatMoney(125050)).toBe("$1,250.50");
  });

  it("handles null and undefined", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
  });
});

describe("formatBytes", () => {
  it("uses bytes under 1 KB", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("steps up through KB and MB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("leaves a missing or bad size blank", () => {
    expect(formatBytes(null)).toBe("");
    expect(formatBytes(undefined)).toBe("");
    expect(formatBytes(-1)).toBe("");
    expect(formatBytes(Number.NaN)).toBe("");
  });
});

describe("initials", () => {
  it("uses one letter for one word", () => {
    expect(initials("ada")).toBe("A");
  });

  it("uses first and last for several words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Ada Byron Lovelace")).toBe("AL");
  });

  it("falls back to a question mark", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
    expect(initials(null)).toBe("?");
  });
});
