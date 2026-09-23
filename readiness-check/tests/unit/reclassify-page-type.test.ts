import { describe, expect, it } from "vitest";
import { reclassifyPageType } from "@/lib/scan/reclassify-page-type";

describe("reclassifyPageType", () => {
  it("keeps URL-classified types", () => {
    expect(
      reclassifyPageType({
        url: "https://example.com/testimonials",
        origin: "https://example.com",
        currentType: "other",
        html: "",
      }),
    ).toBe("testimonial");
  });

  it("bumps other pages from content signals", () => {
    expect(
      reclassifyPageType({
        url: "https://example.com/happy-patients",
        origin: "https://example.com",
        currentType: "other",
        html: "<h1>Patient Testimonials</h1><p>What our patients say</p>",
      }),
    ).toBe("testimonial");

    expect(
      reclassifyPageType({
        url: "https://example.com/get-started",
        origin: "https://example.com",
        currentType: "other",
        html: "<a href='/x'>Book an appointment</a>",
      }),
    ).toBe("appointment");
  });
});
