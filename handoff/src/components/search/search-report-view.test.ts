import { describe, expect, it } from "vitest";
import { formatChange, formatCtr, formatPosition } from "./format";
import { searchViewState, type SearchPropertyView } from "./search-report-view";

const property = (patch: Partial<SearchPropertyView> = {}): SearchPropertyView => ({
  id: "p1",
  site_url: "sc-domain:example.com",
  status: "active",
  last_error: null,
  data_through: null,
  backfill_state: "none",
  ...patch,
});
const window = { current: { start: "2026-10-01", end: "2026-10-07", days: 7 }, previous: null };

describe("searchViewState", () => {
  it("covers every empty state", () => {
    expect(searchViewState(null, null)).toBe("no_property");
    expect(searchViewState(property({ status: "pending", last_error: "not_shared" }), null)).toBe("pending");
    expect(searchViewState(property(), { state: "unavailable", reason: "not_ready" })).toBe("unavailable");
    expect(searchViewState(property(), { state: "unavailable", reason: "no_db" })).toBe("unavailable");
    expect(searchViewState(property(), { state: "unavailable", reason: "error" })).toBe("sync_error");
    expect(searchViewState(property({ last_error: "Google had an error." }), { state: "empty", window })).toBe("sync_error");
    expect(searchViewState(property(), { state: "empty", window })).toBe("no_data");
  });

  it("still shows saved data when access was lost", () => {
    const ok = { state: "ok", window } as never;
    expect(searchViewState(property({ status: "access_lost" }), ok)).toBe("data");
  });
});

describe("search formatting", () => {
  it("formats rates and changes", () => {
    expect(formatCtr(0.0345)).toBe("3.5%");
    expect(formatCtr(null)).toBe("—");
    expect(formatPosition(9.24)).toBe("9.2");
    expect(formatChange("clicks", { delta: 0.25, better: true })).toBe("+25.0%");
    expect(formatChange("impressions", { delta: -0.5, better: false })).toBe("−50.0%");
    expect(formatChange("ctr", { delta: 0.005, better: true })).toBe("+0.5 pts");
    expect(formatChange("position", { delta: -1.25, better: true })).toBe("−1.3");
    expect(formatChange("clicks", { delta: null, better: null })).toBeNull();
  });
});

describe("pagePath", () => {
  it("shows the path of a page URL and leaves anything else alone", async () => {
    const { pagePath } = await import("./search-report-view");
    expect(pagePath("https://example.com/blog/a?x=1")).toBe("/blog/a?x=1");
    expect(pagePath("https://example.com/")).toBe("/");
    expect(pagePath("not a url")).toBe("not a url");
  });
});
