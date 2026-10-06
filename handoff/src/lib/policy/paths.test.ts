import { describe, expect, it } from "vitest";
import { normalizeRelativePath } from "./paths";

describe("normalizeRelativePath", () => {
  it("normalizes a nested brand path", () => {
    expect(normalizeRelativePath("Brand/logos/primary.svg")).toEqual({
      ok: true,
      path: "Brand/logos/primary.svg",
    });
  });

  it("treats Unicode compositions as the same path", () => {
    const composed = normalizeRelativePath("caf\u00e9/logo.svg");
    const decomposed = normalizeRelativePath("cafe\u0301/logo.svg");
    expect(composed.ok && decomposed.ok).toBe(true);
    if (composed.ok && decomposed.ok) {
      expect(composed.path).toBe(decomposed.path);
    }
  });

  it.each([
    ["/etc/passwd", "slash"],
    ["a\\b.pdf", "backslash"],
    ["a/../b.pdf", "dot"],
    ["a/./b.pdf", "dot"],
    ["a//b.pdf", "empty"],
    [".github/x.yml", "dot"],
    ["a/\u0001b.pdf", "hidden"],
    [Array.from({ length: 17 }, (_, index) => (index === 16 ? "file.pdf" : "dir")).join("/"), "folders"],
    ["a/" + "b".repeat(256), "too long"],
  ])("refuses %j", (input, token) => {
    const result = normalizeRelativePath(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain(token);
  });
});
