import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SocialReviewPiece } from "@/lib/social-review";
import { ReviewList } from "./social-rail";

function piece(overrides: Partial<SocialReviewPiece>): SocialReviewPiece {
  return {
    id: "item-1",
    title: "Window light",
    caption: "A long caption that stays in the detail.",
    status: "pending",
    format: "static",
    deliverableId: "d-1",
    deliverableTitle: "October social",
    version: 1,
    slug: "acme",
    accountName: "Acme",
    media: [],
    platforms: ["instagram"],
    ...overrides,
  };
}

describe("social review rail", () => {
  it("shows the picture address for an image and keeps the caption off the row", () => {
    const html = renderToStaticMarkup(
      <ReviewList
        title="Waiting for a look"
        empty="Nothing is waiting for a look."
        selectedId={null}
        onSelect={() => undefined}
        pieces={[piece({
          media: [
            { role: "main", video: false, contentType: "image/png" },
            { role: "poster", video: false, contentType: "image/jpeg" },
            { role: "square", video: false, contentType: "image/png" },
          ],
        })]}
      />,
    );
    expect(html).toContain("/api/deliverables/d-1/items/item-1/media/poster");
    expect(html).toContain("Window light");
    expect(html).toContain("Needs a look");
    expect(html).toContain(">3<");
    expect(html).not.toContain("A long caption");
  });

  it("renders no image for a video-only piece", () => {
    const html = renderToStaticMarkup(
      <ReviewList
        title="Waiting for a look"
        empty="Nothing is waiting for a look."
        selectedId={null}
        onSelect={() => undefined}
        pieces={[piece({ media: [{ role: "main", video: true, contentType: "video/mp4" }] })]}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Video");
  });
});
