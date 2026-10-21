import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("client approval cadence", () => {
  it("still reaches autoScheduleApproved only from the existing approve path", () => {
    const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");
    expect(source).toContain("autoScheduleApproved(");
    expect(source).toContain('decision === "approve"');
    expect(source).not.toContain("createArticlePromotionDraft");
  });
});
