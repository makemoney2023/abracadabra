import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PublicLibraryView } from "./public-library-view";
import { ViewLinkDialog } from "./view-link-dialog";

describe("view link presentation", () => {
  it("uses a view-link label and a generic unavailable page", () => {
    const dialog = renderToStaticMarkup(
      <ViewLinkDialog workspaceId="ws-1" items={[{ resourceKind: "deliverable_item", resourceId: "item-1", resourceVersion: 1 }]} />,
    );
    expect(dialog).toContain(">Share<");
    expect(dialog).toContain("It does not let them upload.");
    expect(dialog).not.toContain("Share link");
    expect(dialog).not.toContain("view link");
    const newer = renderToStaticMarkup(
      <ViewLinkDialog workspaceId="ws-1" items={[]} shares={[{ id: "share-1", title: "Q4", expiresAt: null, revokedAt: null, newer: true, events: [{ kind: "opened", at: 1_800_000_000_000, userAgent: "desktop-chrome" }] }]} />,
    );
    expect(newer).toContain("A newer version is available");
    expect(newer).toContain("desktop-chrome");
    expect(newer).toContain("Update to the latest version");
    const unavailable = renderToStaticMarkup(<PublicLibraryView token="tok" result={{ ok: false, error: "unavailable" }} />);
    expect(unavailable).toContain("This link is not available");
    expect(unavailable).not.toContain("item-1");
    const hidden = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: false, items: [{ publicId: "pub-1", title: "Q4 article", externalUrl: null, hasPicture: true }] } }}
      />,
    );
    expect(hidden).toContain("Q4 article");
    expect(hidden).toContain("/view/tok/media/pub-1");
    expect(hidden).not.toContain("Download");
    expect(hidden).not.toContain("Open");
    const shown = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: true, items: [{ publicId: "pub-1", title: "Q4 article", externalUrl: "https://news.example/q4", kind: "deliverable_item", artifactType: "article" }] } }}
      />,
    );
    expect(shown).toContain("https://news.example/q4");
    expect(shown).toContain("Article");
    expect(shown).toContain("Read article");
    expect(shown).not.toContain(">Open</a>");
    expect(shown).not.toContain("Download");
    expect(shown).toContain("break-all");
    const website = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: false, items: [{ publicId: "pub-site", title: "Campaign site", externalUrl: "https://site.example", kind: "built_work", artifactType: "website" }] } }}
      />,
    );
    expect(website).toContain("Website");
    expect(website).toContain("Visit site");
    const file = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: true, items: [{ publicId: "pub-2", title: "brief.pdf", externalUrl: null, kind: "file", artifactType: "file" }] } }}
      />,
    );
    expect(file).toContain("Download");
    expect(file).toContain("/view/tok/files/pub-2");
    const clip = renderToStaticMarkup(
      <PublicLibraryView
        token="tok"
        result={{ ok: true, view: { title: "Q4", downloads: false, items: [{ publicId: "pub-clip", title: "clip.mp4", externalUrl: null, kind: "file", artifactType: "file" }] } }}
      />,
    );
    expect(clip).toContain("Video");
    expect(clip).not.toContain("<img");
  });
});
