import { describe, expect, it } from "vitest";
import { dropPayload } from "./social-calendar-view";

describe("calendar drop", () => {
  it("keeps 9:00 for a piece dropped on a day and changes the hour on an hour", () => {
    expect(dropPayload({ postId: "", pieceId: "piece-1", hour: "", minute: "" }, "2027-06-04")).toEqual({
      kind: "piece",
      id: "piece-1",
      startAt: "2027-06-04T09:00",
    });
    expect(dropPayload({ postId: "", pieceId: "piece-1", hour: "09", minute: "15" }, "2027-06-04", "14")).toEqual({
      kind: "piece",
      id: "piece-1",
      startAt: "2027-06-04T14:15",
    });
  });

  it("keeps a scheduled post on its own clock time", () => {
    expect(dropPayload({ postId: "post-1", pieceId: "", hour: "11", minute: "30" }, "2027-06-04")).toEqual({
      kind: "post",
      id: "post-1",
      startAt: "2027-06-04T11:30",
    });
  });
});
