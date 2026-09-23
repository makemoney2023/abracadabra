import { describe, expect, it } from "vitest";
import { pagePathLabel } from "@/lib/fixes/page-path-label";

describe("pagePathLabel", () => {
  it("returns pathname for long URLs without the origin", () => {
    expect(
      pagePathLabel(
        "https://www.drbhasin.com/4-tips-to-stay-strong-for-life-weekly-video-by-dr-sandy-and-free-spinal-check-ups-for-family-and-friends",
      ),
    ).toBe(
      "/4-tips-to-stay-strong-for-life-weekly-video-by-dr-sandy-and-free-spinal-check-ups-for-family-and-friends",
    );
  });

  it("normalizes home to /", () => {
    expect(pagePathLabel("https://example.com/")).toBe("/");
  });
});
