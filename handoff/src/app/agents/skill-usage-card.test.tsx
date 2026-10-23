import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { UsageRow, UsageStats } from "@/lib/skill-usage";
import { SkillUsageCard } from "./skill-usage-card";

const NOW = 1_700_000_000_000;

function row(overrides: Partial<UsageRow>): UsageRow {
  return {
    key: "community/marketingskills/",
    name: "marketingskills",
    reads: 2,
    cites: 1,
    attaches: 0,
    useful: 0,
    notUseful: 0,
    cards: 1,
    reviewed: 0,
    approved: 0,
    sentBack: 0,
    approvalRate: null,
    agents: 1,
    lastUsedAt: NOW,
    ...overrides,
  };
}

function stats(packs: UsageRow[]): UsageStats {
  return {
    days: 30,
    since: NOW - 30 * 86_400_000,
    totals: { lists: 1, searches: 1, reads: 2, cites: 1, attaches: 0, detaches: 0, failedReads: 0, useful: 3, notUseful: 1 },
    packs,
    skills: packs,
    neverUsedPacks: [],
    trackingSince: NOW,
  };
}

describe("SkillUsageCard feedback columns", () => {
  it("shows Useful and Not useful columns with each pack's counts and the window totals", () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <SkillUsageCard stats={stats([row({ useful: 3, notUseful: 1 }), row({ key: "community/notfair-seo/", name: "notfair-seo" })])} now={NOW} />
      </TooltipProvider>,
    );
    expect(html).toContain(">Useful<");
    expect(html).toContain(">Not useful<");
    expect(html).toContain("3 marked useful, 1 not useful");
    expect(html).toContain('data-slot="badge"');
    expect(html).toContain(">3</span>");
    expect(html).toContain(">1</span>");
  });
});
