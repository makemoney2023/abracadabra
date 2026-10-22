import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/w/[slug]/work/actions", () => ({
  feedbackAction: async () => ({ message: "" }),
}));

import { ChangesForm } from "@/app/w/[slug]/work/forms";
import { CollectionItemState, CollectionReviewFooter, CollectionReviewHeader } from "./collection-review";

describe("collection review", () => {
  it("counts review states and keeps change requests collapsed", () => {
    const header = renderToStaticMarkup(
      <CollectionReviewHeader
        title="Q4 launch"
        status="In review"
        version={2}
        deliveredAt={Date.UTC(2026, 9, 21)}
        reviewed={1}
        total={3}
        approved={1}
        changes={0}
        pending={2}
      />,
    );
    expect(header).toContain("Version 2");
    expect(header).toContain("Delivered 2026-10-21");
    expect(header).toContain("1 of 3 reviewed");
    expect(header).toContain("1 approved");
    expect(header).toContain("2 pending");
    const itemState = renderToStaticMarkup(<CollectionItemState status="changes_requested" />);
    expect(itemState).toContain("Changes requested");
    expect(itemState).toContain("rounded-full");
    const footer = renderToStaticMarkup(
      <CollectionReviewFooter pending={2} changes={1}>
        <button type="submit">Approve all (2)</button>
      </CollectionReviewFooter>,
    );
    expect(footer).toContain("Approve all (2)");
    expect(footer).toContain("Some pieces already have a change request.");
    expect(footer).toContain("sticky");
    const changes = renderToStaticMarkup(
      <ChangesForm slug="acme" deliverableId="d-1" itemId="item-1" version={2} />,
    );
    expect(changes).toContain("Ask for changes");
    expect(changes).not.toContain("<textarea");
  });
});