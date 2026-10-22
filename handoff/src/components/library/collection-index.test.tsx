import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/w/[slug]/work/actions", () => ({
  feedbackAction: async () => ({ message: "" }),
  shelfAction: async () => ({ message: "" }),
}));

import { CollectionIndex } from "./collection-index";
import { PieceDecision } from "@/app/w/[slug]/work/forms";

describe("collection index", () => {
  it("links each picture to its piece and does not offer Remove", () => {
    const html = renderToStaticMarkup(
      createElement(CollectionIndex, {
        slug: "acme",
        deliverableId: "d-1",
        pieces: [
          { id: "open", title: "Launch post", status: "pending", previewSrc: "/pic.png" },
          { id: "gone", title: "Old post", status: "removed", previewSrc: null },
        ],
      }),
    );
    expect(html).toContain('href="/w/acme/work/d-1?item=open"');
    expect(html).toContain("Launch post");
    expect(html).toContain("Removed");
    expect(html).toContain('src="/pic.png"');
    expect(html).not.toContain(">Remove<");
  });

  it("keeps Remove on the open piece", () => {
    const html = renderToStaticMarkup(
      createElement(PieceDecision, {
        slug: "acme",
        deliverableId: "d-1",
        itemId: "open",
        version: 1,
        removed: false,
        approveLabel: "Approve",
      }),
    );
    expect(html).toContain("Remove");
    expect(html).toContain("Approve");
  });
});
