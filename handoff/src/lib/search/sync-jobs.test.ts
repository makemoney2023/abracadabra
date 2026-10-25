import { describe, expect, it } from "vitest";
import {
  ANALYTICS_REQUESTS,
  addDays,
  backfillDays,
  dailyWindow,
  isFinalDay,
  monthsBefore,
  parseSearchJob,
  utcDay,
} from "./sync-jobs";

const NOW = Date.UTC(2026, 9, 24, 8, 30);

describe("sync dates", () => {
  it("re-pulls the last 4 days, D-4 to D-1, oldest first", () => {
    expect(utcDay(NOW)).toBe("2026-10-24");
    expect(dailyWindow(NOW)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]);
  });

  it("treats the last 3 days as not final (Google still changes them)", () => {
    expect(isFinalDay("2026-10-20", NOW)).toBe(true);
    expect(isFinalDay("2026-10-21", NOW)).toBe(false);
    expect(isFinalDay("2026-10-23", NOW)).toBe(false);
  });

  it("does day and month arithmetic across month and year ends", () => {
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(monthsBefore("2026-10-23", 16)).toBe("2025-06-23");
    expect(monthsBefore("2026-03-31", 1)).toBe("2026-02-28");
  });

  it("backfills 16 months newest day first, starting the day before the daily window", () => {
    const days = backfillDays(NOW);
    expect(days[0]).toBe("2026-10-19");
    expect(days.at(-1)).toBe("2025-06-24");
    expect(days.length).toBeGreaterThan(470);
    expect(days.length).toBeLessThan(490);
    expect([...days].sort().reverse()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });
});

describe("analytics requests", () => {
  it("pulls site totals, pages, queries, query x page, country x device, and the full grain for R2", () => {
    expect(ANALYTICS_REQUESTS).toEqual({
      site: ["date"],
      page: ["date", "page"],
      query: ["date", "query"],
      query_page: ["date", "query", "page"],
      segment: ["date", "country", "device"],
      raw: ["date", "query", "page", "country", "device"],
    });
  });
});

describe("parseSearchJob", () => {
  it("accepts each job shape and rejects anything else", () => {
    expect(parseSearchJob({ v: 1, kind: "plan", propertyId: "p1", mode: "daily" })).toEqual({ v: 1, kind: "plan", propertyId: "p1", mode: "daily" });
    expect(parseSearchJob({ v: 1, kind: "plan", propertyId: "p1", mode: "backfill", includeRaw: true })).toEqual({ v: 1, kind: "plan", propertyId: "p1", mode: "backfill", includeRaw: true });
    expect(parseSearchJob({ v: 1, kind: "analytics", propertyId: "p1", runId: "r1", day: "2026-10-20", request: "page", backfill: false })).toEqual({
      v: 1, kind: "analytics", propertyId: "p1", runId: "r1", day: "2026-10-20", request: "page", backfill: false,
    });
    expect(parseSearchJob({ v: 1, kind: "sitemaps", propertyId: "p1", runId: "r1" })).toEqual({ v: 1, kind: "sitemaps", propertyId: "p1", runId: "r1" });
    expect(parseSearchJob({ v: 1, kind: "inspect", propertyId: "p1", runId: "r1" })).toEqual({ v: 1, kind: "inspect", propertyId: "p1", runId: "r1" });
    expect(parseSearchJob({ v: 1, kind: "retention", propertyId: "p1" })).toEqual({ v: 1, kind: "retention", propertyId: "p1" });
    for (const bad of [
      null,
      "x",
      { kind: "plan", propertyId: "p1", mode: "daily" },
      { v: 1, kind: "plan", propertyId: "", mode: "daily" },
      { v: 1, kind: "plan", propertyId: "p1", mode: "weekly" },
      { v: 1, kind: "analytics", propertyId: "p1", runId: "r1", day: "2026-1-2", request: "page" },
      { v: 1, kind: "analytics", propertyId: "p1", runId: "r1", day: "2026-10-20", request: "everything" },
      { v: 1, kind: "sitemaps", propertyId: "p1" },
      { v: 1, kind: "scan", propertyId: "p1" },
      { source: "assessment" },
    ]) {
      expect(parseSearchJob(bad)).toBeNull();
    }
  });
});
