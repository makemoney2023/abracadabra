import { describe, expect, it } from "vitest";
import { pictureAddress, pictureCount, pictureRole } from "./picture-role";

describe("picture role", () => {
  it("prefers a poster over an earlier unrelated image", () => {
    expect(pictureRole([
      { role: "main", contentType: "image/png" },
      { role: "poster", contentType: "image/jpeg" },
    ])).toBe("poster");
    expect(pictureAddress("d-1", "item-1", "poster")).toBe("/api/deliverables/d-1/items/item-1/media/poster");
  });

  it("walks cover, thumbnail, square, and main before any other image", () => {
    expect(pictureRole([
      { role: "slide", contentType: "image/png" },
      { role: "square", contentType: "image/png" },
    ])).toBe("square");
    expect(pictureRole([{ role: "cover", contentType: "image/png" }, { role: "thumbnail", contentType: "image/png" }])).toBe("cover");
  });

  it("returns no picture for video-only media or an empty list", () => {
    expect(pictureRole([{ role: "main", video: true, contentType: "video/mp4" }])).toBeNull();
    expect(pictureRole([{ role: "main", contentType: "video/mp4" }])).toBeNull();
    expect(pictureRole([])).toBeNull();
    expect(pictureCount([{ role: "main", contentType: "image/png" }, { role: "square", contentType: "image/png" }, { role: "clip", contentType: "video/mp4" }])).toBe(2);
  });
});
