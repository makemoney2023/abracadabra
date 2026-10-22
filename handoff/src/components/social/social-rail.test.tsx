import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SocialReviewPiece } from "@/lib/social-review";
import { ReviewList, waitingHeading } from "./social-rail";

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

  it("names how many pieces need a look and keeps Approve off until the row is chosen", () => {
    expect(waitingHeading(0)).toBe("Waiting for a look");
    expect(waitingHeading(1)).toBe("1 needs a look");
    expect(waitingHeading(3)).toBe("3 need a look");
    const bare = renderToStaticMarkup(
      <ReviewList title={waitingHeading(2)} empty="" showCount={false} selectedId="item-1" onSelect={() => undefined} pieces={[piece({ id: "item-1" }), piece({ id: "item-2", title: "Second" })]} />,
    );
    expect(bare).toContain("2 need a look");
    expect(bare).not.toContain(">(2)<");
    expect(bare).not.toContain('type="submit"');
    const armed = renderToStaticMarkup(
      <ReviewList
        title={waitingHeading(1)}
        empty=""
        showCount={false}
        selectedId="item-1"
        onSelect={() => undefined}
        approvePieceId="item-1"
        approve={<form action="/approve"><button type="submit">Approve</button></form>}
        pieces={[piece({ id: "item-1" })]}
      />,
    );
    expect(armed).toContain('type="submit"');
    expect(armed).toContain("Approve");
  });

  it("lets staff drag an approved piece and leaves the client row still", () => {
    const staff = renderToStaticMarkup(
      <ReviewList title="Approved, not on the calendar" empty="" selectedId={null} onSelect={() => undefined} draggableIds={["item-1"]} pieces={[piece({ status: "approved" })]} />,
    );
    expect(staff).toContain('draggable="true"');
    const client = renderToStaticMarkup(
      <ReviewList title="Approved, not on the calendar" empty="" selectedId={null} onSelect={() => undefined} pieces={[piece({ status: "approved" })]} />,
    );
    expect(client).not.toContain("draggable");
  });
});
