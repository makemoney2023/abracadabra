import { describe, expect, it } from "vitest";
import { previewSrc } from "./library-queries";

describe("library preview", () => {
  it("uses a later poster instead of an earlier image", () => {
    expect(previewSrc(JSON.stringify([
      { role: "main", content_type: "image/png" },
      { role: "poster", content_type: "image/jpeg" },
    ]), "d-1", "item-1")).toBe("/api/deliverables/d-1/items/item-1/media/poster");
  });

  it("returns nothing for video-only media", () => {
    expect(previewSrc(JSON.stringify([{ role: "main", content_type: "video/mp4" }]), "d-1", "item-1")).toBeNull();
  });
});
