import { describe, expect, it } from "vitest";
import {
  currentOpportunities,
  dropOpportunities,
  expectedCtr,
  opportunityId,
  OPPORTUNITY_LIMIT,
  scaledThresholds,
  shortHash,
  siteDrop,
  topOpportunities,
} from "./opportunities";

const row = (label: string, clicks: number, impressions: number, position: number) => ({
  label,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : null,
  position,
});

describe("opportunity math", () => {
  it("uses a falling CTR curve and 1% past page 1", () => {
    expect(expectedCtr(1)).toBe(0.28);
    expect(expectedCtr(1.4)).toBe(0.28);
    expect(expectedCtr(3.6)).toBe(0.07);
    expect(expectedCtr(10)).toBe(0.018);
    expect(expectedCtr(14)).toBe(0.01);
    expect(expectedCtr(0.2)).toBe(0.28);
  });

  it("scales the 28-day thresholds with the window, never below a floor", () => {
    expect(scaledThresholds(28)).toEqual({ lowCtrImpressions: 300, strikingImpressions: 100, dropPreviousClicks: 10, siteDropPreviousClicks: 20 });
    expect(scaledThresholds(7)).toEqual({ lowCtrImpressions: 75, strikingImpressions: 25, dropPreviousClicks: 5, siteDropPreviousClicks: 10 });
    expect(scaledThresholds(90).lowCtrImpressions).toBe(964);
  });

  it("gives stable short ids per type and label", () => {
    expect(shortHash("shoes")).toMatch(/^[0-9a-f]{8}$/);
    expect(opportunityId("low_ctr", "shoes")).toBe(opportunityId("low_ctr", "shoes"));
    expect(opportunityId("low_ctr", "shoes")).not.toBe(opportunityId("striking_distance", "shoes"));
    expect(opportunityId("low_ctr", "shoes")).not.toBe(opportunityId("low_ctr", "boots"));
  });

  it("flags low CTR on page 1 with enough impressions, and estimates the clicks to gain", () => {
    const found = currentOpportunities(
      [
        row("low ctr", 10, 1000, 2), // 1% at position 2 (15% expected): low
        row("fine ctr", 120, 1000, 2), // 12%: fine
        row("few impressions", 0, 200, 2), // under 300
        row("page two", 1, 1000, 12), // not page 1, but striking distance
      ],
      28,
    );
    const low = found.find((item) => item.type === "low_ctr");
    expect(low).toMatchObject({ query: "low ctr", impressions: 1000, clicks_at_stake: 140 });
    expect(low?.why).toContain("1.0% CTR");
    expect(found.filter((item) => item.type === "low_ctr")).toHaveLength(1);
    expect(found.find((item) => item.query === "fine ctr")).toBeUndefined();
    expect(found.find((item) => item.query === "few impressions")).toBeUndefined();
    expect(found.find((item) => item.query === "page two")).toMatchObject({ type: "striking_distance", clicks_at_stake: 99 });
  });

  it("keeps striking distance to position 4-20 with 100+ impressions, and never doubles a low CTR query", () => {
    const found = currentOpportunities(
      [
        row("pos 3", 30, 500, 3),
        row("pos 4", 20, 500, 4),
        row("pos 20", 0, 150, 20),
        row("pos 21", 0, 500, 21),
        row("thin", 0, 99, 8),
        row("low and striking", 1, 1000, 5), // low CTR wins
      ],
      28,
    );
    const striking = found.filter((item) => item.type === "striking_distance").map((item) => item.query);
    expect(striking.sort()).toEqual(["pos 20", "pos 4"]);
    expect(found.filter((item) => item.query === "low and striking").map((item) => item.type)).toEqual(["low_ctr"]);
  });

  it("returns at most five of a kind, biggest first", () => {
    const rows = Array.from({ length: 9 }, (_, index) => row(`q${index}`, 0, 200 + index * 10, 12));
    const found = currentOpportunities(rows, 28);
    expect(found).toHaveLength(OPPORTUNITY_LIMIT);
    expect(found[0]?.query).toBe("q8");
  });

  it("flags query and page click drops of 30% and 5+ clicks against 10+ before", () => {
    const drop = (label: string, clicks: number, previous: number) => ({ label, clicks, previous_clicks: previous, impressions: 100, ctr: clicks / 100, position: 5 });
    const queries = dropOpportunities("query", [drop("big", 20, 50), drop("small share", 45, 50), drop("too few", 0, 8), drop("tiny", 7, 11)], 28);
    expect(queries.map((item) => [item.query, item.clicks_at_stake])).toEqual([["big", 30]]);
    expect(queries[0]?.why).toContain("-60%");
    const pages = dropOpportunities("page", [drop("https://a.com/x", 2, 12)], 28);
    expect(pages[0]).toMatchObject({ type: "page_drop", page: "https://a.com/x", query: null, previous_clicks: 12, clicks_at_stake: 10 });
  });

  it("flags a site drop of 20%+ only with a previous period", () => {
    const totals = (clicks: number) => ({ clicks, impressions: 1000, ctr: clicks / 1000, position: 5 });
    expect(siteDrop("sc-domain:a.com", totals(70), totals(100), 28)).toMatchObject({ type: "site_drop", clicks_at_stake: 30 });
    expect(siteDrop("sc-domain:a.com", totals(85), totals(100), 28)).toBeNull();
    expect(siteDrop("sc-domain:a.com", totals(5), totals(15), 28)).toBeNull();
    expect(siteDrop("sc-domain:a.com", totals(70), null, 28)).toBeNull();
  });

  it("picks the top few across kinds by clicks at stake", () => {
    const all = currentOpportunities([row("a", 0, 2000, 12), row("b", 10, 1000, 2)], 28);
    expect(topOpportunities(all, 1).map((item) => item.query)).toEqual(["a"]);
  });
});
