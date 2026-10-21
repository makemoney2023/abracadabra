import { describe, expect, it } from "vitest";
import { scoreScan } from "@/lib/scoring/score";
import { compactSiteFiles, parseStoredSiteFiles, STORED_LIMITS } from "@/lib/scan/site-files-store";
import type { DetectedPage, SiteFiles } from "@/lib/types";

const pages: DetectedPage[] = [{ url: "https://a.example/", pageType: "home", fetchStatus: "ok", hasJsonLd: true, schemaTypes: ["Organization"] }];

describe("stored site files", () => {
  it("scores the same as the full files, even when the files are huge", () => {
    const filler = "Lorem ipsum dolor sit amet.\n".repeat(20_000);
    const files: SiteFiles = {
      robotsTxt: "User-agent: GPTBot\nDisallow: /\n",
      sitemapXml: `<?xml version="1.0"?><urlset>${"<!-- x -->".repeat(5_000)}${Array.from({ length: 50_000 }, (_, i) => `<url><loc>https://a.example/p/${i}</loc></url>`).join("")}</urlset>`,
      llmsTxt: `# A\n\n> Summary\n\n${filler}\n- [Home](https://a.example/): home\n`,
      llmsFullTxt: `# A full\n\n${filler}`,
    };
    const compact = compactSiteFiles(files);
    expect(compact.sitemapXml!.length).toBeLessThan(STORED_LIMITS.sitemapXml + 200);
    expect(compact.llmsTxt!.length).toBeLessThan(STORED_LIMITS.llmsTxt + 200);
    expect(scoreScan({ pages, siteFiles: compact })).toEqual(scoreScan({ pages, siteFiles: files }));
    expect(parseStoredSiteFiles(JSON.stringify(compact))).toEqual(compact);
  });

  it("keeps small files as they are and survives a bad row", () => {
    const files: SiteFiles = { robotsTxt: null, sitemapXml: "<urlset><url><loc>https://a.example/</loc></url></urlset>", llmsTxt: null, llmsFullTxt: "x" };
    expect(compactSiteFiles(files)).toEqual(files);
    expect(parseStoredSiteFiles("{oops")).toEqual({ robotsTxt: null, sitemapXml: null, llmsTxt: null, llmsFullTxt: null });
  });
});
