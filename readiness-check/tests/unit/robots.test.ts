import { afterEach, describe, expect, it } from "vitest";
import robots from "@/app/robots";
import { CHECK_GUIDES } from "@/content/check-guides";

const KEY = "NEXT_PUBLIC_CHECK_URL";

describe("robots", () => {
  const previous = process.env[KEY];

  afterEach(() => {
    if (previous === undefined) delete process.env[KEY];
    else process.env[KEY] = previous;
  });

  it("points crawlers at this host's sitemap", () => {
    process.env[KEY] = "https://check.abra-ca-dabra.app";
    expect(robots().sitemap).toBe("https://check.abra-ca-dabra.app/sitemap.xml");
  });
});

describe("guide further reading", () => {
  it("links the pressure and readiness guides to the matching notes", () => {
    const pressure = CHECK_GUIDES.find((guide) => guide.slug === "pressure");
    const readiness = CHECK_GUIDES.find((guide) => guide.slug === "readiness");
    expect(pressure?.furtherReading).toEqual({
      href: "https://abra-ca-dabra.app/blog/how-can-ai-help-small-businesses",
      label: "How surveys count AI in a small business",
    });
    expect(readiness?.furtherReading).toEqual({
      href: "https://abra-ca-dabra.app/blog/ai-readiness-assessment",
      label: "What an AI readiness assessment measures",
    });
  });
});
