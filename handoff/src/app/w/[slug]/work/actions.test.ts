import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("client approval cadence", () => {
  it("still reaches autoScheduleApproved only from the existing approve path", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(source).toContain("autoScheduleApproved(");
    expect(source).toContain('decision === "approve"');
    expect(source).not.toContain("createArticlePromotionDraft");
  });

  it("schedules only the pieces this approval just approved, never every approved piece of the deliverable", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(source).toContain("itemIds: input.approvedItemIds");
    expect(source).toContain("input.approvedItemIds.length > 0");
    expect(source).not.toContain("itemIds: input.itemId ? [input.itemId] : null");
  });
});
