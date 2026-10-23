import { describe, expect, it } from "vitest";
import { postActionState } from "./social-post-guard";

describe("what staff may do to a post", () => {
  it("opens both actions only for a scheduled post with a scheduled copy", () => {
    expect(postActionState({ status: "scheduled" })).toEqual({ canReschedule: true, canRemove: true, reason: null });
    expect(postActionState({ status: "scheduled", hasScheduledCopy: false })).toMatchObject({ canReschedule: false, canRemove: false });
  });

  it("lets a draft be removed but not moved, and says why", () => {
    const draft = postActionState({ status: "draft" });
    expect(draft).toMatchObject({ canReschedule: false, canRemove: true });
    expect(draft.reason).toContain("no send time");
  });

  it.each(["sending", "published", "partial", "failed"])("closes both actions for %s and gives a reason", (status) => {
    const state = postActionState({ status });
    expect(state.canReschedule).toBe(false);
    expect(state.canRemove).toBe(false);
    expect(state.reason).toBeTruthy();
  });

  it("names the reason for a post that is going out and one that is live", () => {
    expect(postActionState({ status: "sending" }).reason).toContain("going out now");
    expect(postActionState({ status: "published" }).reason).toContain("already live");
  });
});
