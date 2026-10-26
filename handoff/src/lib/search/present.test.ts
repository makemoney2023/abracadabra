import { describe, expect, it } from "vitest";
import { accessSummary, PROPERTY_STATUS, syncSummary } from "./present";

describe("accessSummary", () => {
  it("explains each state in plain words", () => {
    expect(accessSummary(null).text).toMatch(/not checked/);
    expect(accessSummary({ checkedAt: 1, ok: false, reason: "off" }).text).toMatch(/SEARCH_CONSOLE/);
    expect(accessSummary({ checkedAt: 1, ok: false, reason: "missing_key" }).text).toMatch(/GOOGLE_SA_KEY_JSON/);
    expect(accessSummary({ checkedAt: 1, ok: true, sites: [{ siteUrl: "sc-domain:a.com", permissionLevel: "siteRestrictedUser" }] })).toEqual({
      ok: true,
      text: "HQ's Google account can read 1 Search Console property.",
    });
    expect(accessSummary({ checkedAt: 1, ok: false, reason: "mystery" }).text).toMatch(/failed/);
  });

  it("labels every property status", () => {
    expect(Object.keys(PROPERTY_STATUS).sort()).toEqual(["access_lost", "active", "paused", "pending", "removed"]);
  });
});

describe("syncSummary", () => {
  it("says how fresh the data is, where history stands, and how the last day's jobs went", () => {
    expect(syncSummary({ data_through: null, backfill_state: "none" }, undefined)).toBe(
      "No final day stored yet. History not loaded yet. The next daily run loads 16 months, or use Load history.",
    );
    expect(syncSummary({ data_through: "2026-10-20", backfill_state: "running" }, { total: 26, queued: 3, running: 1, done: 20, failed: 2 })).toBe(
      "Final data through 2026-10-20. Loading 16 months of history, newest days first. Last 24 hours: 20 of 26 jobs done, 4 waiting, 2 failed.",
    );
    expect(syncSummary({ data_through: "2026-10-20", backfill_state: "done" }, { total: 26, queued: 0, running: 0, done: 26, failed: 0 })).toBe(
      "Final data through 2026-10-20. 16 months of history loaded. Last 24 hours: 26 of 26 jobs done.",
    );
  });
});
