import { describe, expect, it } from "vitest";
import { defaultPostType, pieceMedia, planTarget, spacedTimes, type PlannedMedia } from "./social-plan";

const media = (rows: { role: string; content_type: string }[]) =>
  JSON.stringify(rows.map((row, index) => ({ r2_key: `k${index}`, size: 1, ...row })));

const video: PlannedMedia = { key: "v", contentType: "video/mp4", role: "main", kind: "video" };
const picture = (key: string): PlannedMedia => ({ key, contentType: "image/png", role: "slide", kind: "image" });

describe("pieceMedia", () => {
  it("sends main then slides in order, and keeps the poster as the cover", () => {
    const planned = pieceMedia(
      media([
        { role: "main", content_type: "image/png" },
        { role: "slide", content_type: "image/jpeg" },
        { role: "poster", content_type: "image/png" },
        { role: "slide", content_type: "image/jpeg" },
      ]),
    );
    expect(planned.items.map((row) => row.key)).toEqual(["k0", "k1", "k3"]);
    expect(planned.poster?.key).toBe("k2");
  });

  it("falls back to the square crop and ignores bad json", () => {
    expect(pieceMedia(media([{ role: "square", content_type: "image/webp" }])).items).toHaveLength(1);
    expect(pieceMedia("not json")).toEqual({ items: [], poster: null });
  });
});

describe("defaultPostType", () => {
  it("follows the piece's format", () => {
    const one = pieceMedia(media([{ role: "main", content_type: "image/png" }]));
    const clip = pieceMedia(media([{ role: "main", content_type: "video/mp4" }]));
    expect(defaultPostType("static", one)).toBe("feed");
    expect(defaultPostType("story", one)).toBe("story");
    expect(defaultPostType("video", clip)).toBe("reel");
    expect(defaultPostType("carousel", one)).toBe("carousel");
  });
});

describe("planTarget", () => {
  it("marks Instagram and Facebook stories and reels", () => {
    expect(planTarget("instagram", "story", [video], "t")).toEqual({ ok: true, platformSpecificData: { contentType: "story" } });
    expect(planTarget("instagram", "reel", [video], "t")).toEqual({ ok: true, platformSpecificData: { shareToFeed: true } });
    expect(planTarget("facebook", "reel", [video], "t")).toEqual({ ok: true, platformSpecificData: { contentType: "reel" } });
  });

  it("sends a YouTube Short as one video with a title", () => {
    expect(planTarget("youtube", "short", [video], "Launch day")).toEqual({
      ok: true,
      platformSpecificData: { title: "Launch day", visibility: "public", madeForKids: false },
    });
    expect(planTarget("youtube", "feed", [picture("a")], "t")).toMatchObject({ ok: false });
  });

  it("checks carousels", () => {
    expect(planTarget("instagram", "carousel", [picture("a"), picture("b")], "t")).toEqual({ ok: true });
    expect(planTarget("instagram", "carousel", [picture("a"), video], "t")).toMatchObject({ ok: false });
    expect(planTarget("instagram", "carousel", [picture("a")], "t")).toMatchObject({ ok: false });
    expect(planTarget("twitter", "carousel", [1, 2, 3, 4, 5].map((n) => picture(String(n))), "t")).toMatchObject({ ok: false });
  });

  it("sends TikTok to the creator inbox and skips blogs and stories where there are none", () => {
    expect(planTarget("tiktok", "reel", [video], "t")).toMatchObject({ ok: true, platformSpecificData: { draft: true, mediaType: "video" } });
    expect(planTarget("wordpress", "feed", [], "t")).toMatchObject({ ok: false });
    expect(planTarget("pinterest", "feed", [picture("a")], "t")).toMatchObject({ ok: false });
    expect(planTarget("linkedin", "story", [video], "t")).toMatchObject({ ok: false });
    expect(planTarget("linkedin", "reel", [video], "t")).toEqual({ ok: true });
  });
});

describe("spacedTimes", () => {
  it("spaces pieces from the start time", () => {
    expect(spacedTimes(1_000, 60, 3)).toEqual([1_000, 3_601_000, 7_201_000]);
    expect(spacedTimes(1_000, 0, 2)).toEqual([1_000, 1_000]);
  });
});
