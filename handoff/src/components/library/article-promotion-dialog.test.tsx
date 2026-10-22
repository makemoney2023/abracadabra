import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticlePromotionDialog, promotionPreviewUrls } from "./article-promotion-dialog";

describe("article promotion dialog", () => {
  it("shows the exact article link and leaves blogs and Pinterest out", async () => {
    const html = renderToStaticMarkup(
      <ArticlePromotionDialog
        sourceItemId="item-1"
        sourceVersion={1}
        canonicalUrl="https://news.example/q4"
        media={[{ key: "ws-1/hero.jpg", role: "main", contentType: "image/jpeg", previewSrc: "/media/hero" }]}
        targets={[{ id: "draft-1", title: "Q4 social campaign" }]}
        action={async () => ({ message: "" })}
      />,
    );
    expect(html).toContain("https://news.example/q4");
    expect(html).toContain("utm_source=linkedin");
    expect(html).toContain("Create draft");
    expect(html).toContain("LinkedIn");
    expect(html).toContain("name=\"externalId\"");
    expect(html).toContain("name=\"selectedMediaKeys\"");
    expect(html).toContain("name=\"mediaSelectionPresented\"");
    expect(html).toContain("ws-1/hero.jpg");
    expect(html).toContain("Q4 social campaign");
    expect(html).toContain("It does not post.");
    expect(html).not.toContain("wordpress");
    expect(html).not.toContain("wix");
    expect(html).not.toContain("pinterest");
    expect(html).toContain("min-h-11");
    expect(html).toContain("break-all");
  });

  it("previews the exact tracked URL for every chosen network", () => {
    expect(promotionPreviewUrls("https://news.example/q4?ref=launch", ["linkedin", "facebook"])).toEqual([
      {
        label: "LinkedIn",
        url: "https://news.example/q4?ref=launch&utm_source=linkedin&utm_medium=social&utm_campaign=article",
      },
      {
        label: "Facebook",
        url: "https://news.example/q4?ref=launch&utm_source=facebook&utm_medium=social&utm_campaign=article",
      },
    ]);
  });
});
