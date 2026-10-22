import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectLibraryArtifact } from "@/lib/library-artifacts";
import { ArticleCard } from "./article-card";
import { ArtifactCard } from "./artifact-card";
import { LibraryBrowser } from "./library-browser";
import { copyLinkFeedback, emptyLibraryCopy, libraryHref, nextLibraryHref } from "./library-view";

const article = projectLibraryArtifact({
  sourceKind: "deliverable_item",
  sourceId: "item-1",
  version: 1,
  workspaceId: "ws-1",
  organizationId: "org-1",
  title: "Q4 article",
  format: "link",
  hasArticleMetadata: true,
  canonicalUrl: "https://news.example/q4?utm_source=keep",
  dek: "The launch story",
  authorName: "Ada",
  publishedAt: Date.UTC(2026, 9, 21),
  approval: "approved",
  publication: "partially_published",
  updatedAt: 1,
  audience: "client",
  destinations: [
    { platform: "linkedin", outcome: "succeeded", url: "https://www.linkedin.com/feed/update/1" },
    { platform: "instagram", outcome: "failed" },
  ],
});

describe("library cards", () => {
  it("shows an article with its public link and partial destinations", () => {
    const html = renderToStaticMarkup(createElement(ArticleCard, { artifact: article }));
    expect(html).toContain("Q4 article");
    expect(html).toContain("The launch story");
    expect(html).toContain("news.example");
    expect(html).toContain("Ada");
    expect(html).toContain("Partly published");
    expect(html).toContain("LinkedIn");
    expect(html).toContain("Needs attention");
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("https://news.example/q4?utm_source=keep");
    expect(html).not.toContain("Zernio");
  });

  it("keeps a failed copy selectable", () => {
    expect(copyLinkFeedback(false)).toEqual({ message: "Could not copy", showUrl: true });
    expect(copyLinkFeedback(true).message).toBe("Copied");
  });

  it("chooses a visit action for a website and keeps the library query in the next link", () => {
    const site = projectLibraryArtifact({
      sourceKind: "built_work",
      sourceId: "built-1",
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "Live site",
      canonicalUrl: "https://live.example",
      approval: "approved",
      publication: "published",
      updatedAt: 2,
      audience: "client",
      href: "https://live.example",
    });
    const html = renderToStaticMarkup(createElement(ArtifactCard, { artifact: site }));
    expect(html).toContain("Visit site");
    expect(html).toContain("https://live.example");
    const href = nextLibraryHref("acme", { type: "article", search: "Q4" }, "cursor-1");
    expect(href).toContain("/w/acme/library?");
    expect(href).toContain("type=article");
    expect(href).toContain("search=Q4");
    expect(href).toContain("cursor=cursor-1");
    expect(libraryHref("acme", { type: "social" })).toBe("/w/acme/library?type=social");
    expect(emptyLibraryCopy({ search: "missing" })).toContain("missing");
  });

  it("renders one column of cards and a clear empty state", () => {
    const html = renderToStaticMarkup(createElement(LibraryBrowser, {
      slug: "acme",
      page: { artifacts: [], nextCursor: null, counts: { total: 0 } },
      query: { type: "article" },
    }));
    expect(html).toContain("No articles yet.");
    expect(html).toContain("Sources");
    expect(html).toContain("xl:grid-cols-3");
    expect(html).toContain("Recently delivered");
    expect(html).toContain("min-h-11");
    expect(html).toContain("/w/acme/library?type=social");
  });
});
