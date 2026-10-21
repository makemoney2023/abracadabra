import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ArticlePromotionDialog } from "./article-promotion-dialog";

describe("article promotion dialog", () => {
  it("shows the exact article link and leaves blogs and Pinterest out", async () => {
    const html = renderToStaticMarkup(
      <ArticlePromotionDialog
        sourceItemId="item-1"
        sourceVersion={1}
        canonicalUrl="https://news.example/q4"
        exampleOutbound="https://news.example/q4?utm_source=linkedin&utm_medium=social&utm_campaign=article"
        action={async () => ({ message: "" })}
      />,
    );
    expect(html).toContain("https://news.example/q4");
    expect(html).toContain("utm_source=linkedin");
    expect(html).toContain("Create draft");
    expect(html).toContain("It does not post.");
    expect(html).not.toContain("wordpress");
    expect(html).not.toContain("wix");
    expect(html).not.toContain("pinterest");
    expect(html).toContain("min-h-11");
    expect(html).toContain("break-all");
  });
});
