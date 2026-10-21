import { describe, expect, it } from "vitest";
import { collectionSummary, pieceCardView } from "./social-piece-view";

const caption = "A finished caption that stays with the picture and runs long enough to excerpt.";

describe("finished-work piece card", () => {
  it("shows a static preview and the square crop when one is stored", () => {
    const view = pieceCardView({
      title: "Shelf",
      format: "static",
      caption,
      mediaJson: JSON.stringify([
        { r2_key: "main", role: "main", content_type: "image/png" },
        { r2_key: "square", role: "square", content_type: "image/jpeg" },
      ]),
      status: "approved",
      targets: [],
    });
    expect(view.preview.kind).toBe("image");
    expect(view.preview.roles).toEqual(["main"]);
    expect(view.preview.cropRole).toBe("square");
    expect(view.captionExcerpt.endsWith("…")).toBe(true);
    expect(view.captionExcerpt.length).toBeLessThan(caption.length);
    expect(view.approval).toBe("approved");
    expect(view.nextAction).toBe("Schedule");
  });

  it("keeps carousel slides in order after the main file", () => {
    const view = pieceCardView({
      title: "Lookbook",
      format: "carousel",
      caption: "Three slides",
      mediaJson: JSON.stringify([
        { r2_key: "b", role: "slide", content_type: "image/png" },
        { r2_key: "cover", role: "main", content_type: "image/png" },
        { r2_key: "c", role: "slide", content_type: "image/png" },
      ]),
      status: "pending",
      targets: [],
    });
    expect(view.preview.kind).toBe("carousel");
    expect(view.preview.roles).toEqual(["main", "slide", "slide"]);
    expect(view.postType).toBe("carousel");
  });

  it("shows a video poster, duration, aspect ratio, and safe-area status", () => {
    const view = pieceCardView({
      title: "Walkthrough",
      format: "video",
      caption: "Watch",
      mediaJson: JSON.stringify([
        { r2_key: "vid", role: "main", content_type: "video/mp4" },
        { r2_key: "cover", role: "poster", content_type: "image/jpeg" },
      ]),
      status: "approved",
      targets: [],
      durationSeconds: 18,
      aspectRatio: "9:16",
      safeArea: "ok",
    });
    expect(view.preview.posterRole).toBe("poster");
    expect(view.preview.durationSeconds).toBe(18);
    expect(view.preview.aspectRatio).toBe("9:16");
    expect(view.preview.safeArea).toBe("ok");
    expect(view.preview.vertical).toBe(true);
  });

  it("previews a vertical Reel or Short", () => {
    const reel = pieceCardView({
      title: "Reel",
      format: "video",
      caption: "Vertical",
      mediaJson: JSON.stringify([{ r2_key: "vid", role: "main", content_type: "video/mp4" }]),
      status: "approved",
      targets: [],
    });
    const short = pieceCardView({
      title: "Short",
      format: "video",
      caption: "Vertical",
      mediaJson: JSON.stringify([{ r2_key: "vid", role: "main", content_type: "video/mp4" }]),
      status: "approved",
      targets: [],
      postType: "short",
    });
    expect(reel.preview.kind).toBe("reel");
    expect(reel.preview.vertical).toBe(true);
    expect(reel.preview.aspectRatio).toBe("9:16");
    expect(short.preview.kind).toBe("short");
    expect(short.preview.vertical).toBe(true);
  });

  it("keeps published links beside targets that still need attention", () => {
    const view = pieceCardView({
      title: "Split",
      format: "static",
      caption: "Live on one network",
      mediaJson: JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]),
      status: "approved",
      scheduledFor: Date.UTC(2027, 2, 1, 9, 0),
      timezone: "UTC",
      warnings: ["One account is disconnected."],
      targets: [
        { platform: "instagram", outcome: "succeeded", url: "https://instagram.com/p/abc" },
        { platform: "youtube", outcome: "failed", attention: true },
      ],
    });
    expect(view.publishing).toBe("partial");
    expect(view.publishedLinks).toEqual([{ platform: "instagram", url: "https://instagram.com/p/abc" }]);
    expect(view.attentionTargets).toEqual([{ platform: "youtube" }]);
    expect(JSON.stringify(view)).not.toMatch(/token|bearer|expired/i);
    expect(view.warnings).toEqual(["One account is disconnected."]);
    expect(view.scheduleLabel).toContain("2027");
    expect(view.nextAction).toBe("Review attention");
  });

  it("keeps prior outcomes when changes are requested", () => {
    const view = pieceCardView({
      title: "Revise",
      format: "static",
      caption: "Please tighten the line",
      mediaJson: JSON.stringify([{ r2_key: "pic", role: "main", content_type: "image/png" }]),
      status: "changes_requested",
      targets: [{ platform: "instagram", outcome: "succeeded", url: "https://instagram.com/p/old" }],
    });
    expect(view.approval).toBe("needs_changes");
    expect(view.priorOutcomesKept).toBe(true);
    expect(view.publishedLinks).toEqual([{ platform: "instagram", url: "https://instagram.com/p/old" }]);
    expect(view.nextAction).toBe("Send for review");
  });
});

describe("collection summary", () => {
  it("counts approved, needs-changes, and unscheduled pieces", () => {
    const summary = collectionSummary([
      { status: "approved", scheduled: false },
      { status: "approved", scheduled: true },
      { status: "changes_requested", scheduled: false },
      { status: "pending", scheduled: false },
    ]);
    expect(summary).toMatchObject({
      approved: 2,
      needsChanges: 1,
      unscheduled: 1,
      actions: ["Send for review", "Schedule approved"],
    });
  });
});
