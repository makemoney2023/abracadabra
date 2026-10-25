import { describe, expect, it } from "vitest";
import { accessSummary, PROPERTY_STATUS } from "./present";

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
