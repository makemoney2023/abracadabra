import { describe, expect, it } from "vitest";
import { approvalTone, boardLists, calendarStatusLabel, postOnCalendar, scheduledItemIds, visibleReview } from "./social-board";

describe("social board", () => {
  it("colors a post by the decision that matters first", () => {
    expect(approvalTone({ state: "failed", approval: "pending" })).toBe("failed");
    expect(approvalTone({ state: "scheduled", approval: "pending" })).toBe("needs_review");
    expect(approvalTone({ state: "scheduled", approval: "changes_requested" })).toBe("changes");
    expect(approvalTone({ state: "published", approval: "approved" })).toBe("posted");
    expect(approvalTone({ state: "partial", approval: "approved" })).toBe("posted");
    expect(approvalTone({ state: "draft", approval: "approved" })).toBe("draft");
    expect(approvalTone({ state: "scheduled", approval: "approved" })).toBe("scheduled");
    expect(approvalTone({ state: "scheduled", approval: "approved", cancelled: true })).toBeNull();
  });

  it("keeps timed work on the calendar and leaves cancelled posts and untimed drafts off it", () => {
    expect(postOnCalendar({ status: "scheduled", error: null, scheduledFor: 1 })).toBe(true);
    expect(postOnCalendar({ status: "published", error: null, scheduledFor: 1 })).toBe(true);
    expect(postOnCalendar({ status: "failed", error: "Nope", scheduledFor: 1 })).toBe(true);
    expect(postOnCalendar({ status: "draft", error: null, scheduledFor: 1 })).toBe(true);
    expect(postOnCalendar({ status: "draft", error: null, scheduledFor: null })).toBe(false);
    expect(postOnCalendar({ status: "scheduled", error: "Cancelled.", scheduledFor: 1 })).toBe(false);
    expect(postOnCalendar({ status: "failed", error: "Piece removed.", scheduledFor: 1 })).toBe(false);
  });

  it("puts pieces that need a look ahead of change requests, and approved work with no live post in the ready list", () => {
    const lists = boardLists(
      [
        { id: "changes", status: "changes_requested" },
        { id: "approved-live", status: "approved" },
        { id: "pending", status: "pending" },
        { id: "ready", status: "approved" },
      ],
      new Set(["approved-live"]),
    );
    expect(lists.waiting.map((piece) => piece.id)).toEqual(["pending", "changes"]);
    expect(lists.ready.map((piece) => piece.id)).toEqual(["ready"]);
  });

  it("keeps a failed post off the ready rail", () => {
    const lists = boardLists(
      [
        { id: "failed", status: "approved" },
        { id: "ready", status: "approved" },
      ],
      new Set(),
      new Set(["failed"]),
    );
    expect(lists.ready.map((piece) => piece.id)).toEqual(["ready"]);
  });

  it("does not hide a piece that has no network yet when a network filter is on", () => {
    const pieces = [
      { id: "open", platforms: [] as string[] },
      { id: "ig", platforms: ["instagram"] },
      { id: "yt", platforms: ["youtube"] },
    ];
    expect(visibleReview(pieces, "").map((piece) => piece.id)).toEqual(["open", "ig", "yt"]);
    expect(visibleReview(pieces, "instagram").map((piece) => piece.id)).toEqual(["open", "ig"]);
  });

  it("names a draft without the publishing provider", () => {
    expect(calendarStatusLabel("draft")).toBe("Draft");
    expect(calendarStatusLabel("published")).toBe("Posted");
    expect(calendarStatusLabel("draft").toLowerCase()).not.toContain("zernio");
  });

  it("takes an approved piece off the rail once a post is on the calendar for it", () => {
    const posts = [
      { item_id: "sent", status: "sending", scheduled_for: 1 },
      { item_id: "booked", status: "scheduled", scheduled_for: 2 },
      { item_id: "posted", status: "published", scheduled_for: 3 },
      { item_id: "some", status: "partial", scheduled_for: 4 },
      { item_id: "dated-draft", status: "draft", scheduled_for: 5 },
      { item_id: "undated-draft", status: "draft", scheduled_for: null },
      { item_id: "failed", status: "failed", scheduled_for: 6 },
    ];
    const scheduled = scheduledItemIds(posts);
    expect([...scheduled].sort()).toEqual(["booked", "dated-draft", "posted", "sent", "some"]);
    const pieces = ["booked", "dated-draft", "undated-draft", "unplaced"].map((id) => ({ id, status: "approved" }));
    expect(boardLists(pieces, scheduled).ready.map((piece) => piece.id)).toEqual(["undated-draft", "unplaced"]);
  });
});
