import { describe, expect, it } from "vitest";
import {
  MAX_CRAWL_DELAY_MS,
  isAllowedByRobots,
  parseRobotsRules,
  robotsRulesFromFetch,
} from "@/lib/robots-rules";

const u = (path: string) => `https://acme.example${path}`;

describe("robots.txt rules (RFC 9309)", () => {
  it("uses our own group over *, matching the product token case-insensitively", () => {
    const rules = parseRobotsRules(
      "User-agent: *\nDisallow: /\n\nUser-agent: schemaaeoscanner\nDisallow: /private\n",
    );
    expect(isAllowedByRobots(u("/blog/post"), rules)).toBe(true);
    expect(isAllowedByRobots(u("/private/x"), rules)).toBe(false);
    // A version suffix on the user-agent line still names us.
    const versioned = parseRobotsRules("User-agent: SchemaAEOScanner/1.0\nDisallow: /x\n");
    expect(isAllowedByRobots(u("/x"), versioned)).toBe(false);
  });

  it("falls back to * and allows everything when no group applies", () => {
    expect(isAllowedByRobots(u("/a"), parseRobotsRules("User-agent: *\nDisallow: /a\n"))).toBe(false);
    expect(isAllowedByRobots(u("/a"), parseRobotsRules("User-agent: Googlebot\nDisallow: /\n"))).toBe(true);
    expect(isAllowedByRobots(u("/a"), parseRobotsRules(""))).toBe(true);
  });

  it("merges every group that names us, and lets consecutive user-agent lines share a group", () => {
    const rules = parseRobotsRules(
      "User-agent: Googlebot\nUser-agent: SchemaAEOScanner\nDisallow: /one\n\nUser-agent: SchemaAEOScanner\nDisallow: /two\n",
    );
    expect(isAllowedByRobots(u("/one"), rules)).toBe(false);
    expect(isAllowedByRobots(u("/two"), rules)).toBe(false);
    expect(isAllowedByRobots(u("/three"), rules)).toBe(true);
  });

  it("lets the longest match win, and Allow win a tie", () => {
    const rules = parseRobotsRules(
      "User-agent: *\nDisallow: /shop\nAllow: /shop/public\nAllow: /page\nDisallow: /page\n",
    );
    expect(isAllowedByRobots(u("/shop/cart"), rules)).toBe(false);
    expect(isAllowedByRobots(u("/shop/public/item"), rules)).toBe(true);
    expect(isAllowedByRobots(u("/page"), rules)).toBe(true);
    // Allow: / is shorter than Disallow: /admin, so /admin stays disallowed.
    const broad = parseRobotsRules("User-agent: *\nAllow: /\nDisallow: /admin\n");
    expect(isAllowedByRobots(u("/admin/x"), broad)).toBe(false);
    expect(isAllowedByRobots(u("/about"), broad)).toBe(true);
  });

  it("supports * and $, matches the query string, and ignores an empty Disallow", () => {
    const rules = parseRobotsRules("User-agent: *\nDisallow: /*.pdf$\nDisallow: /*?sort=\nDisallow:\n");
    expect(isAllowedByRobots(u("/files/a.pdf"), rules)).toBe(false);
    expect(isAllowedByRobots(u("/files/a.pdf?x=1"), rules)).toBe(true);
    expect(isAllowedByRobots(u("/list?sort=asc"), rules)).toBe(false);
    expect(isAllowedByRobots(u("/list"), rules)).toBe(true);
    expect(isAllowedByRobots(u("/anything"), parseRobotsRules("User-agent: *\nDisallow:\n"))).toBe(true);
  });

  it("compares percent-encoded and plain paths alike, and ignores comments", () => {
    const rules = parseRobotsRules("User-agent: * # everyone\nDisallow: /café # menu\n");
    expect(isAllowedByRobots(u("/caf%C3%A9/today"), rules)).toBe(false);
  });

  it("always allows /robots.txt itself", () => {
    expect(isAllowedByRobots(u("/robots.txt"), parseRobotsRules("User-agent: *\nDisallow: /\n"))).toBe(true);
  });

  it("reads Crawl-delay for our group and caps it", () => {
    expect(parseRobotsRules("User-agent: *\nCrawl-delay: 2.5\n").crawlDelayMs).toBe(2500);
    const capped = parseRobotsRules("User-agent: SchemaAEOScanner\nCrawl-delay: 60\nUser-agent: *\nCrawl-delay: 1\n");
    expect(capped.crawlDelayMs).toBe(MAX_CRAWL_DELAY_MS);
    expect(capped.crawlDelayCapped).toBe(true);
    expect(parseRobotsRules("User-agent: Googlebot\nCrawl-delay: 5\n").crawlDelayMs).toBe(0);
    expect(parseRobotsRules("User-agent: *\nCrawl-delay: soon\n").crawlDelayMs).toBe(0);
  });

  it("allows everything on 4xx and nothing on 5xx or a network error", () => {
    const missing = robotsRulesFromFetch({ content: "", error: "404" });
    expect(missing.status).toBe("missing");
    expect(isAllowedByRobots(u("/a"), missing)).toBe(true);
    for (const error of ["500", "503", "fetch failed"]) {
      const down = robotsRulesFromFetch({ content: "", error });
      expect(down.status).toBe("unreachable");
      expect(isAllowedByRobots(u("/a"), down)).toBe(false);
    }
    expect(robotsRulesFromFetch(undefined).status).toBe("unreachable");
    expect(robotsRulesFromFetch({ content: "User-agent: *\nDisallow: /x\n" }).status).toBe("ok");
  });
});
