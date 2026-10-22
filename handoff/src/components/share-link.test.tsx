import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ShareLink } from "./share-link";

describe("upload share link", () => {
  it("announces clipboard feedback to assistive technology", () => {
    const html = renderToStaticMarkup(<ShareLink url="https://handoff.example/share/token" />);

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain("Copy upload link");
  });
});
