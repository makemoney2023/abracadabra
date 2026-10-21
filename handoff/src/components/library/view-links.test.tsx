import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicLibraryView } from "./public-library-view";
import { ViewLinkDialog } from "./view-link-dialog";

describe("view link presentation", () => {
  it("uses a view-link label and a generic unavailable page", () => {
    const dialog = renderToStaticMarkup(
      <ViewLinkDialog workspaceId="ws-1" items={[{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }]} />,
    );
    expect(dialog).toContain("Create view link");
    expect(dialog).toContain("It does not let them upload.");
    expect(dialog).not.toContain("Share link");
    const unavailable = renderToStaticMarkup(<PublicLibraryView token="tok" result={{ ok: false, error: "unavailable" }} />);
    expect(unavailable).toContain("This link is not available");
    expect(unavailable).not.toContain("item-1");
    const hidden = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: false, items: [{ publicId: "pub-1", title: "Q4 article", externalUrl: null }] } }}
      />,
    );
    expect(hidden).toContain("Q4 article");
    expect(hidden).not.toContain("Download");
    expect(hidden).not.toContain("Open");
    const shown = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: true, items: [{ publicId: "pub-1", title: "Q4 article", externalUrl: "https://news.example/q4" }] } }}
      />,
    );
    expect(shown).toContain("https://news.example/q4");
    expect(shown).toContain("Download");
    expect(shown).toContain("break-all");
  });
});
