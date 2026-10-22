import { describe, expect, it } from "vitest";
import { clientSocialReview } from "./client-social-review";

describe("client social review", () => {
  it("keeps media with the caption and never names the provider", () => {
    const view = clientSocialReview({
      title: "Shelf",
      caption: "The finished line",
      mediaRoles: ["main", "poster"],
      platform: "instagram",
      targetState: "scheduled",
      cadenceEnabled: true,
      cadenceLabel: "America/New_York weekdays at 09:00",
      previewSlots: ["Tue, Nov 3, 9:00 AM"],
      fingerprint: "cadence-a",
      confirmedFingerprint: "cadence-a",
      role: "owner",
    });
    expect(view.mediaRoles).toEqual(["main", "poster"]);
    expect(view.caption).toBe("The finished line");
    expect(view.platformState).toBe("Scheduled on Instagram");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("zernio");
    expect(view.actions).toEqual(["approve_with_cadence", "request_changes"]);
    expect(view.recommendation).toMatchObject({
      cadence: "America/New_York weekdays at 09:00",
      preview: ["Tue, Nov 3, 9:00 AM"],
      valid: true,
    });
    expect(view.canReconnect).toBe(true);
    expect(view.calendarReadOnly).toBe(true);
    const pending = clientSocialReview({
      title: "Shelf",
      caption: "Line",
      mediaRoles: ["main"],
      platform: "instagram",
      targetState: "pending",
      cadenceEnabled: false,
      cadenceLabel: "Approve",
      previewSlots: [],
      fingerprint: "a",
      confirmedFingerprint: "a",
      role: "owner",
    });
    expect(pending.platformState).toBe("Needs a look on Instagram");
  });

  it("uses a plain approve label when cadence is off and blocks a stale preview", () => {
    const off = clientSocialReview({
      title: "Shelf",
      caption: "Line",
      mediaRoles: ["main"],
      platform: "youtube",
      targetState: "unpublished",
      cadenceEnabled: false,
      cadenceLabel: "Approve",
      previewSlots: [],
      fingerprint: "a",
      confirmedFingerprint: "a",
      role: "member",
    });
    expect(off.actions).toEqual(["approve", "request_changes"]);
    expect(off.canReconnect).toBe(false);
    const stale = clientSocialReview({
      title: "Shelf",
      caption: "Line",
      mediaRoles: ["main"],
      platform: "instagram",
      targetState: "unpublished",
      cadenceEnabled: true,
      cadenceLabel: "UTC weekdays at 09:00",
      previewSlots: ["Mon 9:00"],
      fingerprint: "now",
      confirmedFingerprint: "then",
      role: "owner",
    });
    expect(stale.recommendation.valid).toBe(false);
    expect(stale.canConfirmSchedule).toBe(false);
  });
});
