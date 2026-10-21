import { describe, expect, it } from "vitest";
import {
  artifactKey,
  deriveArtifactType,
  inspectCanonicalUrl,
  primaryLibraryStatus,
  projectLibraryArtifact,
  redactUrlForActivity,
} from "./library-artifacts";

describe("library artifact projection", () => {
  it("builds stable keys for each source family", () => {
    expect(artifactKey({ sourceKind: "deliverable_item", sourceId: "item-1", version: 3 })).toBe("deliverable_item:item-1:3");
    expect(artifactKey({ sourceKind: "built_work", sourceId: "built-1" })).toBe("built_work:built-1");
    expect(artifactKey({ sourceKind: "file", sourceId: "file-1" })).toBe("file:file-1");
  });

  it("derives artifact types and ignores an unknown override", () => {
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "link", hasArticleMetadata: true })).toBe("article");
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "link" })).toBe("document");
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "static", channel: "linkedin" })).toBe("social");
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "video" })).toBe("video");
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "carousel" })).toBe("image");
    expect(deriveArtifactType({ sourceKind: "deliverable_item", format: "page" })).toBe("document");
    expect(deriveArtifactType({ sourceKind: "built_work" })).toBe("website");
    expect(deriveArtifactType({ sourceKind: "file" })).toBe("file");
    expect(
      deriveArtifactType({ sourceKind: "deliverable_item", format: "page", artifactTypeOverride: "article" }),
    ).toBe("article");
    expect(
      deriveArtifactType({ sourceKind: "deliverable_item", format: "page", artifactTypeOverride: "cms" }),
    ).toBe("document");
  });

  it("uses the specified primary status precedence", () => {
    expect(primaryLibraryStatus({ approval: "changes_requested", publication: "published" })).toBe("changes_requested");
    expect(primaryLibraryStatus({ approval: "approved", publication: "needs_attention" })).toBe("needs_attention");
    expect(primaryLibraryStatus({ approval: "needs_review", publication: "scheduled" })).toBe("needs_review");
    expect(primaryLibraryStatus({ approval: "approved", publication: "publishing" })).toBe("publishing");
    expect(primaryLibraryStatus({ approval: "approved", publication: "scheduled" })).toBe("scheduled");
    expect(primaryLibraryStatus({ approval: "approved", publication: "partially_published" })).toBe("partially_published");
    expect(primaryLibraryStatus({ approval: "approved", publication: "published" })).toBe("published");
    expect(primaryLibraryStatus({ approval: "approved", publication: "ready" })).toBe("ready");
    expect(primaryLibraryStatus({ approval: "approved", publication: "not_published" })).toBe("approved");
    expect(primaryLibraryStatus({ approval: "draft", publication: "not_published" })).toBe("draft");
  });

  it("keeps successful and failed destinations visible on a partial article", () => {
    const artifact = projectLibraryArtifact({
      sourceKind: "deliverable_item",
      sourceId: "item-1",
      version: 2,
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "Q4 launch",
      format: "link",
      hasArticleMetadata: true,
      canonicalUrl: "https://news.example/q4?utm_source=keep",
      dek: "The launch story",
      authorName: "Ada",
      publishedAt: 1_700_000_000_000,
      approval: "approved",
      publication: "partially_published",
      updatedAt: 1_700_000_000_100,
      audience: "client",
      destinations: [
        { platform: "linkedin", outcome: "succeeded", url: "https://www.linkedin.com/feed/update/1" },
        { platform: "twitter", outcome: "failed", staffReason: "Provider rejected the media." },
      ],
    });
    expect(artifact.artifactType).toBe("article");
    expect(artifact.primaryStatus).toBe("partially_published");
    expect(artifact.destinations).toEqual([
      { platform: "linkedin", label: "LinkedIn", state: "published", url: "https://www.linkedin.com/feed/update/1" },
      { platform: "twitter", label: "X", state: "failed" },
    ]);
    expect(JSON.stringify(artifact)).not.toContain("Zernio");
    expect(JSON.stringify(artifact)).not.toContain("Provider rejected");
    expect(artifact.actions[0]).toMatchObject({ kind: "read_article", href: "https://news.example/q4?utm_source=keep" });
    expect(artifact.actions.some((action) => action.kind === "copy_link" && action.copyValue?.includes("utm_source=keep"))).toBe(true);
  });

  it("chooses the primary action from the visible state", () => {
    const review = projectLibraryArtifact({
      sourceKind: "deliverable_item",
      sourceId: "item-2",
      version: 1,
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "Needs a look",
      format: "link",
      canonicalUrl: "https://news.example/draft",
      approval: "needs_review",
      publication: "not_published",
      updatedAt: 2,
      audience: "client",
    });
    expect(review.actions[0]?.kind).toBe("review");
    const site = projectLibraryArtifact({
      sourceKind: "built_work",
      sourceId: "built-1",
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "Renew",
      canonicalUrl: "https://renew.example",
      approval: "approved",
      publication: "published",
      updatedAt: 3,
      audience: "client",
    });
    expect(site.actions[0]).toMatchObject({ kind: "visit_site", label: "Visit site" });
    const file = projectLibraryArtifact({
      sourceKind: "file",
      sourceId: "file-1",
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "brief.pdf",
      approval: "approved",
      publication: "not_published",
      updatedAt: 4,
      audience: "client",
      href: "/w/acme/files/file-1",
    });
    expect(file.actions[0]).toMatchObject({ kind: "open_file", href: "/w/acme/files/file-1" });
  });

  it("refuses an unsafe stored link instead of opening it", () => {
    const artifact = projectLibraryArtifact({
      sourceKind: "deliverable_item",
      sourceId: "item-3",
      version: 1,
      workspaceId: "ws-1",
      organizationId: "org-1",
      title: "Bad link",
      format: "link",
      hasArticleMetadata: true,
      canonicalUrl: "javascript:alert(1)",
      approval: "approved",
      publication: "published",
      updatedAt: 5,
      audience: "client",
    });
    expect(artifact.canonical?.unavailable).toBe(true);
    expect(artifact.actions.every((action) => !action.href?.startsWith("javascript:"))).toBe(true);
    expect(artifact.actions[0]?.kind).toBe("unavailable");
  });
});

describe("canonical URLs", () => {
  it("accepts legacy http and https and preserves the stored parts", () => {
    const parsed = inspectCanonicalUrl("https://News.Example/path/a?q=1#part", "legacy");
    expect(parsed).toEqual({ ok: true, url: "https://News.Example/path/a?q=1#part", hostname: "news.example" });
    expect(inspectCanonicalUrl("http://example.com/old", "legacy").ok).toBe(true);
  });

  it("requires https for a production staff write and rejects unsafe forms", () => {
    expect(inspectCanonicalUrl("http://example.com/a", "write", { production: true }).ok).toBe(false);
    expect(inspectCanonicalUrl("https://example.com/a", "write", { production: true }).ok).toBe(true);
    for (const value of ["javascript:alert(1)", "data:text/html,hi", "https://user:pass@example.com/a", "not a url", "https://example.com/" + "a".repeat(2000)]) {
      expect(inspectCanonicalUrl(value, "legacy").ok).toBe(false);
    }
  });

  it("redacts the query before activity metadata", () => {
    expect(redactUrlForActivity("https://news.example/q4?utm_source=secret&x=1#top")).toBe("https://news.example/q4");
  });
});
