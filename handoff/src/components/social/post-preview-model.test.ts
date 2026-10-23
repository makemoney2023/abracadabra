import { describe, expect, it } from "vitest";
import { accountsLine, rescheduleCheck, whenLabel, type PostPreviewData } from "./post-preview-model";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const account = { id: "a-1", platform: "linkedin", name: "Acme", label: "LinkedIn · Acme" };

function post(id: string, at: number | null, extra: Partial<PostPreviewData> = {}) {
  return { postId: id, title: `Post ${id}`, status: "scheduled", scheduledFor: at, accounts: [account], ...extra };
}

const current = post("p-1", Date.parse("2026-11-03T15:00:00Z"));

describe("calendar preview reschedule check", () => {
  it("needs a time that parses", () => {
    expect(rescheduleCheck({ local: "", timeZone: "UTC", now: NOW, current, others: [] })).toEqual({ ok: false, error: "Pick a date and time." });
    expect(rescheduleCheck({ local: "soon", timeZone: "UTC", now: NOW, current, others: [] })).toMatchObject({ ok: false });
  });

  it("refuses a time in the past or under a minute away", () => {
    expect(rescheduleCheck({ local: "2026-11-01T09:00", timeZone: "UTC", now: NOW, current, others: [] })).toMatchObject({ ok: false, error: expect.stringContaining("one minute") });
    expect(rescheduleCheck({ local: "2026-11-02T12:00", timeZone: "UTC", now: NOW, current, others: [] })).toMatchObject({ ok: false });
  });

  it("reads the typed time in the post's zone", () => {
    const toronto = rescheduleCheck({ local: "2026-11-04T10:00", timeZone: "America/Toronto", now: NOW, current, others: [] });
    expect(toronto).toEqual({ ok: true, at: Date.parse("2026-11-04T15:00:00Z"), warnings: [] });
  });

  it("refuses the time it already has", () => {
    expect(rescheduleCheck({ local: "2026-11-03T15:00", timeZone: "UTC", now: NOW, current, others: [] })).toMatchObject({ ok: false, error: expect.stringContaining("already has") });
  });

  it("warns about another live post on the same account inside the hour, and only that", () => {
    const near = post("p-2", Date.parse("2026-11-05T10:30:00Z"));
    const far = post("p-3", Date.parse("2026-11-05T13:00:00Z"));
    const otherAccount = post("p-4", Date.parse("2026-11-05T10:00:00Z"), { accounts: [{ ...account, id: "a-2" }] });
    const done = post("p-5", Date.parse("2026-11-05T10:15:00Z"), { status: "published" });
    const self = post("p-1", Date.parse("2026-11-05T10:00:00Z"));
    const result = rescheduleCheck({ local: "2026-11-05T10:00", timeZone: "UTC", now: NOW, current, others: [near, far, otherAccount, done, self] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Post p-2");
    expect(result.warnings[0]).toContain("LinkedIn · Acme");
  });
});

describe("preview labels", () => {
  it("names the accounts and the time with its zone", () => {
    expect(accountsLine([])).toBe("No account");
    expect(accountsLine([account, { ...account, id: "a-2", label: "Instagram · Acme" }])).toBe("LinkedIn · Acme, Instagram · Acme");
    expect(whenLabel(Date.parse("2026-11-03T15:00:00Z"), "America/Toronto")).toBe("Tue, Nov 3, 2026, 10:00 AM (America/Toronto)");
    expect(whenLabel(null, "UTC")).toBe("No time set");
  });
});
