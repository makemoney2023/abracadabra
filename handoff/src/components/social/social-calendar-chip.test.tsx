import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SocialCalendarView, type CalendarEvent } from "./social-calendar-view";

const NOW = Date.parse("2026-11-03T14:00:00Z");

function event(id: string, state: string): CalendarEvent {
  return { id, title: `Post ${id}`, platform: "linkedin", state, at: NOW, approval: "approved", itemId: `i-${id}` };
}

function render(posts: CalendarEvent[], onQuick?: (id: string, action: "reschedule" | "remove") => void) {
  return renderToStaticMarkup(
    <SocialCalendarView posts={posts} timeZone="UTC" now={NOW} initialMode="day" selectedId={null} onSelect={() => undefined} canReschedule onQuick={onQuick} />,
  );
}

describe("calendar chip quick actions", () => {
  it("puts Reschedule and Remove on a scheduled chip, as separate buttons from the open button", () => {
    const html = render([event("a", "scheduled")], () => undefined);
    expect(html).toContain('aria-label="Reschedule Post a"');
    expect(html).toContain('aria-label="Remove Post a"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("group-focus-within/chip:opacity-100");
  });

  it("offers only Remove on a draft and nothing on a live or finished post", () => {
    const html = render([event("d", "draft"), event("s", "sending"), event("p", "published"), event("f", "failed")], () => undefined);
    expect(html).toContain('aria-label="Remove Post d"');
    expect(html).not.toContain('aria-label="Reschedule Post d"');
    for (const id of ["s", "p", "f"]) {
      expect(html).not.toContain(`Remove Post ${id}"`);
      expect(html).not.toContain(`Reschedule Post ${id}"`);
    }
  });

  it("shows no quick buttons without a handler (a client's calendar)", () => {
    expect(render([event("a", "scheduled")])).not.toContain("Reschedule Post a");
  });
});
