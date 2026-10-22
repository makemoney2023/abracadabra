import { describe, expect, it } from "vitest";
import { operationsView } from "./social-operations";

describe("social operations", () => {
  it("puts needs-attention first and offers only a valid recovery", () => {
    const view = operationsView({
      narrow: false,
      attention: [
        { id: "a1", kind: "disconnected_account", platform: "instagram" },
        { id: "a2", kind: "upload_failure", platform: "youtube" },
        { id: "a3", kind: "rejected_target", platform: "tiktok" },
        { id: "a4", kind: "uncertain_outcome", platform: "facebook" },
      ],
      posts: [
        {
          id: "p1",
          title: "Shelf",
          platform: "instagram",
          state: "scheduled",
          at: Date.UTC(2027, 2, 1, 14, 0),
          timezone: "America/New_York",
          thumbnailRole: "main",
        },
      ],
    });
    expect(view.sections[0]).toBe("attention");
    expect(view.recoveries).toEqual([
      { id: "a1", action: "connect" },
      { id: "a2", action: "retry" },
      { id: "a3", action: null },
      { id: "a4", action: null },
    ]);
    expect(view.calendar.mode).toBe("week");
    expect(view.calendar.modes).toEqual(["day", "week", "month"]);
    expect(view.filters).toEqual(["account", "platform", "collection", "status"]);
    expect(view.cards[0]).toMatchObject({
      thumbnailRole: "main",
      platform: "instagram",
      state: "scheduled",
    });
    expect(view.cards[0]?.localTime).toContain("9:00");
    expect(view.queueActions).toEqual([
      { action: "move", opens: "plan_review", mutatesDirectly: false },
      { action: "cancel", opens: "plan_review", mutatesDirectly: false },
      { action: "retry", opens: "plan_review", mutatesDirectly: false },
    ]);
    expect(view.reachable).toEqual(["account_health", "cadence", "history"]);
  });

  it("opens on the day view on a narrow width", () => {
    const view = operationsView({ narrow: true, attention: [], posts: [] });
    expect(view.calendar.mode).toBe("day");
  });
});
