import { describe, expect, it } from "vitest";
import { buildReportProps } from "@/lib/pdf/report-props";
import { renderScanReportPdf } from "@/lib/pdf/scan-report-pdf";
import { csvCell, groupPages, pageSection, pageSlice, pagesCsv, worstPages, type MatrixPage } from "@/lib/scan/page-groups";

function page(url: string, pageType: string, fetchStatus = "ok", hasJsonLd = true): MatrixPage {
  return { url, pageType, fetchStatus, hasJsonLd, schemaTypes: hasJsonLd ? ["WebPage"] : [] };
}

const O = "https://acme.example";

describe("page matrix groups", () => {
  it("groups typed pages by type and other pages by top-level section", () => {
    expect(pageSection(page(`${O}/blog/a`, "blogPost"))).toEqual({ key: "blogPost", label: "Blog posts" });
    expect(pageSection(page(`${O}/portfolio/x`, "other"))).toEqual({ key: "other:portfolio", label: "/portfolio/" });
    expect(pageSection(page(`${O}/robots.txt`, "other"))).toEqual({ key: "other:", label: "Other pages" });
  });

  it("puts groups with failures first and the worst pages first inside each group", () => {
    const pages = [
      page(`${O}/`, "home"),
      page(`${O}/blog/a`, "blogPost"),
      page(`${O}/blog/b`, "blogPost", "ok", false),
      page(`${O}/portfolio/x`, "other"),
      page(`${O}/portfolio/y`, "other", "failed", false),
      page(`${O}/portfolio/z`, "other", "ok", false),
    ];
    const groups = groupPages(pages);
    expect(groups.map((g) => [g.label, g.failed, g.missingSchema])).toEqual([
      ["/portfolio/", 1, 1],
      ["Blog posts", 0, 1],
      ["Home", 0, 0],
    ]);
    expect(groups[0]!.pages.map((p) => p.url)).toEqual([`${O}/portfolio/y`, `${O}/portfolio/z`, `${O}/portfolio/x`]);
  });

  it("paginates and clamps the page number", () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    expect(pageSlice(items, 0, 25)).toEqual({ items: items.slice(0, 25), page: 0, pages: 3 });
    expect(pageSlice(items, 9, 25).items).toEqual(items.slice(50));
    expect(pageSlice([], 0, 25)).toEqual({ items: [], page: 0, pages: 1 });
  });

  it("picks the 50 worst pages for the PDF, failures first, in scan order", () => {
    const pages = Array.from({ length: 1000 }, (_, i) =>
      page(`${O}/p/${i}`, "other", i % 100 === 0 ? "failed" : "ok", i % 3 !== 0),
    );
    const worst = worstPages(pages);
    expect(worst).toHaveLength(50);
    expect(worst.slice(0, 10).every((p) => p.fetchStatus === "failed")).toBe(true);
    expect(worst.slice(10).every((p) => p.fetchStatus === "ok" && !p.hasJsonLd)).toBe(true);
  });
});

describe("pages CSV", () => {
  it("lists every page, worst first, with safe cells", () => {
    const csv = pagesCsv([
      page(`${O}/`, "home"),
      page(`${O}/a,b`, "other", "failed", false),
      { url: `${O}/x`, pageType: "other", fetchStatus: "ok", hasJsonLd: true, schemaTypes: ["Organization", "WebSite"] },
    ]);
    const lines = csv.trimEnd().split("\r\n");
    expect(lines[0]).toBe("url,section,page_type,fetch_status,structured_data,schema_types,issue");
    expect(lines[1]).toBe(`"${O}/a,b","/a,b/",other,failed,no,,Could not be fetched`);
    expect(lines[3]).toContain("Organization; WebSite");
    expect(lines).toHaveLength(4);
  });

  it("neutralises cells that a spreadsheet would run as formulas", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});

describe("PDF for a 1,000-page scan", () => {
  it("has the summary and the worst 50 pages, not all 1,000", async () => {
    const pages = Array.from({ length: 1000 }, (_, i) =>
      page(`${O}/${i % 2 ? "blog" : "portfolio"}/${i}`, i % 2 ? "blogPost" : "other", i % 50 === 0 ? "failed" : "ok", i % 4 !== 0),
    );
    const props = buildReportProps({ domain: "acme.example", scoreTotal: 61, scoreBreakdown: {}, pages, findings: [] });
    expect(props.pages).toHaveLength(50);
    expect(props.pagesTotal).toBe(1000);
    expect(props.pagesFailed).toBe(20);
    expect(props.sections.map((s) => s.label)).toEqual(["/portfolio/", "Blog posts"]);
    const bytes = await renderScanReportPdf(props);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeLessThan(200_000);
  }, 30_000);
});
