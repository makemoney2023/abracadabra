import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaffLibrarySummary } from "./staff-library-summary";

describe("staff library summary", () => {
  it("shows counts, review work, links, and view-link state", () => {
    const html = renderToStaticMarkup(
      <StaffLibrarySummary
        summary={{
          workspaceId: "ws-1",
          slug: "acme",
          name: "Acme",
          counts: { total: 2, article: 1, social: 1 },
          reviewNeeded: 1,
          recent: [{ title: "Q4 article", status: "needs_review" }],
          viewLinks: { live: 1, revoked: 2 },
        }}
      />,
    );
    expect(html).toContain("Acme");
    expect(html).toContain("article: 1");
    expect(html).toContain("1 need review");
    expect(html).toContain("Q4 article");
    expect(html).toContain("Held work stays on the studio side");
    expect(html).toContain("1 view links · 2 revoked");
    expect(html).toContain("/w/acme/library");
    expect(html).toContain("min-h-11");
  });
});