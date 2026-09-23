import { describe, expect, it } from "vitest";
import { validateFixFiles } from "@/lib/fixes/validate-package";

describe("validateFixFiles", () => {
  it("errors on http schema.org context and any TODO_ placeholders", () => {
    const report = validateFixFiles([
      {
        path: "json-ld/home.jsonld",
        contentType: "application/ld+json",
        content: JSON.stringify({
          "@context": "http://schema.org",
          "@type": "Organization",
          name: "TODO_NAME",
          url: "https://example.com/",
        }),
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.todoCount).toBeGreaterThan(0);
    expect(report.issues.some((i) => /TODO_/.test(i.message))).toBe(true);
    expect(report.issues.some((i) => /https:\/\/schema\.org/.test(i.message))).toBe(true);
  });

  it("accepts a clean Organization document", () => {
    const report = validateFixFiles([
      {
        path: "json-ld/home.jsonld",
        contentType: "application/ld+json",
        content: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Acme",
          url: "https://acme.example/",
        }),
      },
    ]);
    expect(report.ok).toBe(true);
    expect(report.todoCount).toBe(0);
  });
});
