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
          {
            id: "file-1",
            name: "brand/brief.pdf",
            status: "clean",
            selected: false,
            usedIn: [{ title: "Launch article", href: "/w/acme/work/article-1" }],
            deliveredAs: [{ title: "Campaign brief", href: "/w/acme/work/brief-1" }],
          },
          { id: "file-2", name: "brand/raw.pdf", status: "pending" },
        ]}
      />,
    );
    expect(html).toContain("brand/brief.pdf");
    expect(html).toContain("clean");
    expect(html).toContain("Show in Library");
    expect(html).toContain("/w/acme/files/file-1");
    expect(html).toContain("/w/acme?folder=brand");
    expect(html).toContain("Used in");
    expect(html).toContain("Launch article");
    expect(html).toContain("Delivered as");
    expect(html).toContain("Campaign brief");
    expect(html).not.toContain("file-2");
    expect(html).toContain("min-h-11");
  });

  it("shows a picture for a photo and no preview image for a pdf", () => {
    const html = renderToStaticMarkup(
      <SourcesBrowser
        slug="acme"
        canSelect
        query={{}}
        files={[
          { id: "pic-1", name: "brand/window.png", status: "clean", selected: false },
          { id: "doc-1", name: "brand/brief.pdf", status: "clean", selected: false },
          { id: "clip-1", name: "brand/clip.mp4", status: "clean", selected: false },
        ]}
      />,
    );
    expect(html).toContain("/api/files/pic-1/preview");
    expect(html).toContain("Show in Library");
    expect(html).not.toContain("/api/files/doc-1/preview");
    expect(html).toContain("Video");
    expect(html).not.toContain("/api/files/clip-1/preview");
  });
});
