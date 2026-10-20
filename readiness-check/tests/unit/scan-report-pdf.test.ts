import { writeFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildReportProps } from "@/lib/pdf/report-props";
import { renderScanReportPdf } from "@/lib/pdf/scan-report-pdf";
import { loadStudioFontBytes } from "@/lib/pdf/studio-font-bytes";
import abra from "../fixtures/real-scans/abra-ca-dabra.app.json";

const props = buildReportProps({
  domain: abra.scan.domain,
  scoreTotal: abra.scan.score_total,
  scoreBreakdown: JSON.parse(abra.scan.score_breakdown_json),
  pages: abra.pages.map((p) => ({
    url: p.url,
    pageType: p.page_type,
    fetchStatus: p.fetch_status,
    hasJsonLd: p.has_json_ld === 1,
    schemaTypes: JSON.parse(p.schema_types_json),
  })),
  findings: abra.findings.map((f) => ({ code: f.code, severity: f.severity, passed: f.passed === 1, message: f.message })),
});

describe("scan report PDF (pdf-lib, Worker-safe)", () => {
  it("renders a multi-page report for a real 40-page scan with the brand fonts", async () => {
    const fonts = await loadStudioFontBytes(null);
    expect(fonts.display?.length).toBeGreaterThan(1000);
    const bytes = await renderScanReportPdf(props, fonts);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toContain("abra-ca-dabra.app");
    if (process.env.SCHEMA_SAMPLE_OUT) writeFileSync(`${process.env.SCHEMA_SAMPLE_OUT}/abra-ca-dabra.app/report.pdf`, bytes);
  });

  it("falls back to Helvetica without fonts and still draws dashes, quotes and bullets", async () => {
    const bytes = await renderScanReportPdf(
      { ...props, summaryBody: "It’s “fine” — mostly…", summaryDrivers: ["• one"] },
      {},
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
  });

  it("loads fonts from the Worker's static assets when bound", async () => {
    const seen: string[] = [];
    const fonts = await loadStudioFontBytes(
      { fetch: async (req) => { seen.push(typeof req === "string" ? req : req.url); return new Response(new Uint8Array([1, 2, 3])); } },
      "https://check.example",
    );
    expect(seen).toContain("https://check.example/pdf-fonts/InterTight-Bold.ttf");
    expect(fonts.body).toEqual(new Uint8Array([1, 2, 3]));
  });
});
