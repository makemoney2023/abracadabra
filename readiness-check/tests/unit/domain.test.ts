import { describe, expect, it } from "vitest";
import { normalizeDomain } from "@/lib/domain";

describe("normalizeDomain", () => {
  it("accepts bare domain", () => {
    expect(normalizeDomain("Example.COM")).toEqual({
      domain: "example.com",
      origin: "https://example.com",
    });
  });

  it("strips path and www", () => {
    expect(normalizeDomain("https://www.example.com/about")).toEqual({
      domain: "example.com",
      origin: "https://example.com",
    });
  });

  it("rejects invalid input", () => {
    expect(() => normalizeDomain("not a url")).toThrow(/invalid/i);
  });
});
