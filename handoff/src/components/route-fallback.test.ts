import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RouteLoading, type RouteShape } from "./route-fallback";

const BARE_BORDER = /(?:^|\s)(?:border|border-b|border-t)(?:\s|$)/;

function bareBorderClasses(html: string) {
  return [...html.matchAll(/class="([^"]*)"/g)]
    .map((match) => match[1])
    .filter((value) => BARE_BORDER.test(value) && !value.split(/\s+/).includes("border-border"));
}

describe("route loading", () => {
  it("shows skeleton bars on the theme border instead of a light empty table", () => {
    const html = renderToStaticMarkup(createElement(RouteLoading, { title: "Clients", shape: "table" }));
    expect(html).toContain('data-slot="skeleton"');
    expect(html).toContain("bg-foreground/15");
    expect(html).not.toContain("bg-muted");
    expect(bareBorderClasses(html)).toEqual([]);
    expect((html.match(/data-slot="skeleton"/g) ?? []).length).toBeGreaterThan(8);
  });

  it("keeps every loading shape on the same skeleton treatment", () => {
    const shapes: RouteShape[] = ["metrics", "board", "thread", "frame", "cards", "tabs"];
    for (const shape of shapes) {
      const html = renderToStaticMarkup(createElement(RouteLoading, { title: "Screen", shape }));
      expect(html, shape).toContain('data-slot="skeleton"');
      expect(html, shape).toContain("bg-foreground/15");
      expect(bareBorderClasses(html), shape).toEqual([]);
    }
  });
});
