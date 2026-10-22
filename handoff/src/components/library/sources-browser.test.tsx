import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/w/[slug]/sources-actions", () => ({
  selectSourceAction: async () => ({ ok: true }),
  revokeSourceAction: async () => ({ ok: true }),
  toggleSourceAction: async () => undefined,
}));

import { SourcesBrowser } from "./sources-browser";

describe("sources browser", () => {
  it("links folders, shows scan state, and offers Library selection only for clean files", () => {
    const html = renderToStaticMarkup(
      <SourcesBrowser
        slug="acme"
        canSelect
        query={{ folder: "brand", search: "brief" }}
        files={[
          { id: "file-1", name: "brand/brief.pdf", status: "clean", selected: false },
          { id: "file-2", name: "brand/raw.pdf", status: "pending" },
        ]}
      />,
    );
    expect(html).toContain("brand/brief.pdf");
    expect(html).toContain("clean");
    expect(html).toContain("Show in Library");
    expect(html).toContain("/w/acme/files/file-1");
    expect(html).toContain("/w/acme?folder=brand");
    expect(html).not.toContain("file-2");
    expect(html).toContain("min-h-11");
  });
});
