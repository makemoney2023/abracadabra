import { describe, expect, it } from "vitest";
import { attachPlan, canExecute, composerReview, editPriorStep, selectAllEligible, startComposer } from "./publishing-composer-state";

const pieces = [
  { id: "pic", title: "Picture", approved: true, compatible: true, postType: "feed" },
  { id: "reel", title: "Reel", approved: true, compatible: true, postType: "reel" },
  { id: "open", title: "Open", approved: false, compatible: true, postType: "feed" },
  { id: "pdf", title: "PDF", approved: true, compatible: false, postType: "feed" },
];

describe("publishing composer", () => {
  it("selects only approved and compatible pieces", () => {
    expect(selectAllEligible(pieces)).toEqual(["pic", "reel"]);
  });

  it("keeps a target-level type for mixed content and blocks what will not publish", () => {
    const state = startComposer(pieces, ["ig", "yt"]);
    const review = composerReview({
      ...state,
      step: "review",
      pieceIds: ["pic", "reel", "open"],
      rows: [
        { itemId: "pic", accountId: "ig", postType: "feed", blocked: false },
        { itemId: "reel", accountId: "yt", postType: "short", blocked: false },
        { itemId: "open", accountId: "ig", postType: "feed", blocked: true, reason: "Not approved yet" },
      ],
    });
    expect(review.rows.map((row) => row.postType)).toEqual(["feed", "short", "feed"]);
    expect(review.blocked).toEqual([{ itemId: "open", accountId: "ig", reason: "Not approved yet" }]);
    expect(review.whollySuccessful).toBe(false);
  });

  it("refuses execute until a current plan is attached on review", () => {
    const state = { ...startComposer(pieces, ["ig"]), step: "review" as const };
    expect(canExecute(state)).toBe(false);
    const planned = attachPlan(state, { planId: "plan-1", planHash: "hash-1" });
    expect(canExecute(planned)).toBe(true);
  });

  it("drops the plan when an earlier step changes and requires review again", () => {
    const planned = attachPlan(
      { ...startComposer(pieces, ["ig"]), step: "review" },
      { planId: "plan-1", planHash: "hash-1" },
    );
    const edited = editPriorStep(planned, "destinations");
    expect(edited.planId).toBeNull();
    expect(edited.planHash).toBeNull();
    expect(edited.step).toBe("destinations");
    expect(canExecute(edited)).toBe(false);
    expect(canExecute({ ...edited, step: "review" })).toBe(false);
    expect(canExecute(attachPlan({ ...edited, step: "review" }, { planId: "plan-2", planHash: "hash-2" }))).toBe(true);
  });
});
