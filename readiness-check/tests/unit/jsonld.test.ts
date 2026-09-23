import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectJsonLd } from "@/lib/detect/jsonld";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "src/fixtures", name), "utf8");

describe("detectJsonLd", () => {
  it("extracts types from healthy page", () => {
    const result = detectJsonLd(fixture("healthy-home.html"));
    expect(result.hasJsonLd).toBe(true);
    expect(result.schemaTypes).toEqual(expect.arrayContaining(["Organization", "FAQPage"]));
    expect(result.blocks).toHaveLength(2);
  });

  it("returns empty for page without JSON-LD", () => {
    const result = detectJsonLd(fixture("empty-home.html"));
    expect(result.hasJsonLd).toBe(false);
    expect(result.schemaTypes).toEqual([]);
  });

  it("parses JSON-LD embedded in markdown fences from Parallel extract", () => {
    const md = "Intro\n```html\n<script type=\"application/ld+json\">{\"@type\":\"Product\",\"name\":\"X\"}</script>\n```\n";
    const result = detectJsonLd(md);
    expect(result.schemaTypes).toContain("Product");
  });
});
