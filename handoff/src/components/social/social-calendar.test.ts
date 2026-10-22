import { describe, expect, it } from "vitest";
import { anchorForDay, buildSocialCalendar, calendarTimeZone, shiftCalendarAnchor } from "./social-calendar";

const TORONTO = "America/Toronto";
/** Sunday 22 Nov 2026, 09:00 in Toronto. */
const AT = Date.UTC(2026, 10, 22, 14, 0);

describe("social calendar", () => {
  it("lays a week out Monday through Sunday in the client zone", () => {
    const calendar = buildSocialCalendar({
      mode: "week",
      anchor: AT,
      now: AT,
      timeZone: TORONTO,
      posts: [{ id: "p1", title: "Shelf", platform: "instagram", state: "scheduled", at: AT }],
    });
    expect(calendar.days).toHaveLength(7);
    expect(calendar.days.map((day) => day.key)).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
    expect(calendar.days[0]?.weekdayLabel).toBe("Mon");
    expect(calendar.days[6]?.posts.map((post) => post.id)).toEqual(["p1"]);
    expect(calendar.days[6]?.posts[0]?.timeLabel).toContain("9:00");
    expect(calendar.days[6]?.isToday).toBe(true);
    expect(calendar.label).toContain("Nov");
  });

  it("keeps empty days so a gap stays visible", () => {
    const calendar = buildSocialCalendar({ mode: "week", anchor: AT, now: AT, timeZone: TORONTO, posts: [] });
    expect(calendar.days).toHaveLength(7);
    expect(calendar.days.every((day) => day.posts.length === 0)).toBe(true);
  });

  it("pads a month to whole weeks and marks days outside the month", () => {
    const oct = Date.UTC(2026, 9, 1, 16, 0);
    const calendar = buildSocialCalendar({ mode: "month", anchor: oct, now: oct, timeZone: TORONTO, posts: [] });
    expect(calendar.days[0]?.key).toBe("2026-09-28");
    expect(calendar.days[0]?.inMonth).toBe(false);
    expect(calendar.days.find((day) => day.key === "2026-10-01")?.inMonth).toBe(true);
    expect(calendar.days.length % 7).toBe(0);
    expect(calendar.label).toBe("October 2026");
  });

  it("shows a day as hours that include the working day and an early post", () => {
    const early = Date.UTC(2026, 10, 22, 7, 30);
    const calendar = buildSocialCalendar({
      mode: "day",
      anchor: early,
      now: early,
      timeZone: TORONTO,
      posts: [{ id: "p", title: "Early", platform: "twitter", state: "scheduled", at: early }],
    });
    expect(calendar.days).toHaveLength(1);
    expect(calendar.days[0]?.key).toBe("2026-11-22");
    expect(calendar.hours[0]).toBe(2);
    expect(calendar.hours).toContain(9);
    expect(calendar.hours).toContain(20);
    expect(calendar.days[0]?.posts[0]?.hour).toBe(2);
    expect(calendar.days[0]?.posts[0]?.minute).toBe(30);
  });

  it("steps a day, a week, and a month inside the client zone", () => {
    const nextWeek = shiftCalendarAnchor(AT, "week", 1, TORONTO);
    const week = buildSocialCalendar({ mode: "week", anchor: nextWeek, now: AT, timeZone: TORONTO, posts: [] });
    expect(week.days[0]?.key).toBe("2026-11-23");
    const previous = shiftCalendarAnchor(AT, "day", -1, TORONTO);
    const day = buildSocialCalendar({ mode: "day", anchor: previous, now: AT, timeZone: TORONTO, posts: [] });
    expect(day.days[0]?.key).toBe("2026-11-21");
    const nextMonth = shiftCalendarAnchor(Date.UTC(2026, 0, 31, 17, 0), "month", 1, TORONTO);
    const month = buildSocialCalendar({ mode: "month", anchor: nextMonth, now: AT, timeZone: TORONTO, posts: [] });
    expect(month.days.some((entry) => entry.key === "2026-02-01" && entry.inMonth)).toBe(true);
  });

  it("uses the cadence zone when cadence is on, otherwise the zone posts were scheduled in", () => {
    expect(calendarTimeZone({ enabled: true, timezone: "America/Toronto" }, ["UTC"])).toBe("America/Toronto");
    expect(calendarTimeZone({ enabled: false, timezone: "UTC" }, ["America/Toronto", "America/Toronto", "UTC"])).toBe(
      "America/Toronto",
    );
    expect(calendarTimeZone({ enabled: false, timezone: "" }, [])).toBe("UTC");
  });

  it("opens a calendar day at noon in that zone", () => {
    expect(anchorForDay("2026-11-22", TORONTO)).toBe(Date.UTC(2026, 10, 22, 17, 0));
  });

  it("sorts two posts on the same day by time", () => {
    const later = AT + 3_600_000;
    const calendar = buildSocialCalendar({
      mode: "day",
      anchor: AT,
      now: AT,
      timeZone: TORONTO,
      posts: [
        { id: "later", title: "Later", platform: "facebook", state: "scheduled", at: later },
        { id: "earlier", title: "Earlier", platform: "facebook", state: "scheduled", at: AT },
      ],
    });
    expect(calendar.days[0]?.posts.map((post) => post.id)).toEqual(["earlier", "later"]);
  });
});
