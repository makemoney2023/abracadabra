import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeRobots } from "@/lib/detect/robots";
import { analyzeLlmsTxt } from "@/lib/detect/llms-txt";
import { parseSitemapUrls } from "@/lib/detect/sitemap";

const fx = (n: string) => readFileSync(path.join(process.cwd(), "src/fixtures", n), "utf8");

describe("site file detectors", () => {
  it("flags GPTBot disallow", () => {
    const r = analyzeRobots(fx("blocked-robots.txt"));
    expect(r.blocksGptBot).toBe(true);
    expect(r.blockedAiBots).toContain("GPTBot");
  });

  it("does not treat path Disallows or later bot groups as blocking GPTBot", () => {
    const robots = `User-Agent: GPTBot
Allow: /
Disallow: /api/
Disallow: /dashboard

User-Agent: Bytespider
Disallow: /
`;
    const r = analyzeRobots(robots);
    expect(r.blocksGptBot).toBe(false);
    expect(r.blockedAiBots).toEqual([]);
  });

  it("treats useful llms.txt as present", () => {
    const r = analyzeLlmsTxt(fx("sample-llms.txt"));
    expect(r.present).toBe(true);
    expect(r.useful).toBe(true);
  });

  it("parses sitemap urls", () => {
    const urls = parseSitemapUrls(fx("sample-sitemap.xml"));
    expect(urls).toContain("https://example.com/about");
  });

  it("parses Parallel-flattened sitemap text without XML loc tags", () => {
    const flat =
      "https://www.pirx.ca 2026-08-11T14:34:09.860Z weekly 1 https://www.pirx.ca/faq 2026-06-24T00:00:00.000Z weekly 0.8";
    const urls = parseSitemapUrls(flat);
    expect(urls).toEqual(["https://www.pirx.ca", "https://www.pirx.ca/faq"]);
  });
});
