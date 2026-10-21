import { describe, expect, it } from "vitest";
import { fileLabel, listedMedia } from "./labels";

describe("fileLabel", () => {
  it("uses the piece title", () => {
    expect(fileLabel({ title: "Hero", role: "cover" })).toBe("Hero");
  });

  it("turns a role into words when the title is blank", () => {
    expect(fileLabel({ title: "  ", role: "cover_still" })).toBe("cover still");
  });

  it("says File when the title and the role are blank", () => {
    expect(fileLabel({})).toBe("File");
  });
});

describe("listedMedia", () => {
  it("marks pictures, videos and other stored files", () => {
    const media = listedMedia(
      JSON.stringify([
        { role: "main", content_type: "image/png" },
        { role: "clip", content_type: "video/mp4" },
        { role: "doc", content_type: "text/markdown" },
        { role: "page", content_type: "text/html" },
        { role: "old" },
      ]),
    );
    expect(media).toEqual([
      { role: "main", video: false, image: true },
      { role: "clip", video: true, image: false },
      { role: "doc", video: false, image: false },
      { role: "page", video: false, image: false },
      { role: "old", video: false, image: true },
    ]);
    expect(listedMedia("not json")).toEqual([]);
  });
});
