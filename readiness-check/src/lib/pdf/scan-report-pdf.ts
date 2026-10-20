/**
 * Scan report PDF, Worker-safe.
 *
 * @react-pdf/renderer can't run on Cloudflare Workers (its layout engine compiles
 * WebAssembly at runtime and its fonts load from the filesystem), so the scan
 * report is drawn with pdf-lib, which is plain JavaScript. Fonts are passed in as
 * bytes; without them the report falls back to the built-in Helvetica.
 */
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { STUDIO } from "@/lib/brand/studio";
import type { ReportProps } from "@/lib/pdf/report-props";

export type StudioFontBytes = {
  display?: Uint8Array | null; // Inter Tight Bold
  body?: Uint8Array | null; // IBM Plex Sans Regular
  bodyStrong?: Uint8Array | null; // IBM Plex Sans SemiBold
};

export const STUDIO_PDF_FONT_FILES = {
  display: "InterTight-Bold.ttf",
  body: "IBMPlexSans-Regular.ttf",
  bodyStrong: "IBMPlexSans-SemiBold.ttf",
} as const;

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 40;

function hex(color: string) {
  const n = Number.parseInt(color.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

const INK = hex(STUDIO.ink);
const SOFT = hex(STUDIO.inkSoft);
const ACCENT = hex(STUDIO.accent);
const CANVAS = hex(STUDIO.canvas);
const RULE = rgb(0.2, 0.2, 0.19);

/** Helvetica (WinAnsi) can't draw every character; keep text drawable. */
function winAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "*")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private readonly doc: PDFDocument,
    private readonly fonts: { display: PDFFont; body: PDFFont; strong: PDFFont },
    private readonly safe: (text: string) => string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage(A4);
    this.page.drawRectangle({ x: 0, y: 0, width: A4[0], height: A4[1], color: CANVAS });
    this.y = A4[1] - MARGIN;
  }

  ensure(height: number) {
    if (this.y - height < MARGIN) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of this.safe(text).split("\n")) {
      let line = "";
      for (const word of para.split(/\s+/).filter(Boolean)) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        // Break very long tokens (URLs) by character.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let cut = rest.length;
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
          lines.push(rest.slice(0, cut));
          rest = rest.slice(cut);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    opts: { font?: "display" | "body" | "strong"; size?: number; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {},
  ) {
    const font = this.fonts[opts.font ?? "body"];
    const size = opts.size ?? 10;
    const x = opts.x ?? MARGIN;
    const width = opts.width ?? A4[0] - MARGIN - x;
    const lineHeight = size * 1.35;
    for (const line of this.wrap(text, font, size, width)) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      this.page.drawText(line, { x, y: this.y + size * 0.25, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 4;
  }

  heading(text: string) {
    this.y -= 10;
    this.ensure(40);
    this.text(text, { font: "display", size: 13, color: ACCENT, gap: 6 });
  }

  row(cells: string[], widths: number[], opts: { strong?: boolean } = {}) {
    const font = opts.strong ? this.fonts.strong : this.fonts.body;
    const size = 9;
    const lineHeight = size * 1.35;
    const wrapped = cells.map((c, i) => this.wrap(c, font, size, widths[i]! - 6));
    const height = Math.max(...wrapped.map((w) => w.length)) * lineHeight + 6;
    this.ensure(height);
    let x = MARGIN;
    wrapped.forEach((lines, i) => {
      lines.forEach((line, j) => {
        this.page.drawText(line, {
          x,
          y: this.y - (j + 1) * lineHeight + size * 0.25,
          size,
          font,
          color: opts.strong ? SOFT : INK,
        });
      });
      x += widths[i]!;
    });
    this.y -= height;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y + 2 },
      end: { x: A4[0] - MARGIN, y: this.y + 2 },
      thickness: 0.5,
      color: RULE,
    });
  }
}

export async function renderScanReportPdf(props: ReportProps, fontBytes: StudioFontBytes = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(props.title);
  doc.setCreator("Abracadabra Schema");
  doc.registerFontkit(fontkit);

  const embed = async (bytes: Uint8Array | null | undefined, fallback: StandardFonts) => {
    if (bytes?.length) {
      try {
        return { font: await doc.embedFont(bytes, { subset: true }), custom: true };
      } catch {
        // fall through to the built-in font
      }
    }
    return { font: await doc.embedFont(fallback), custom: false };
  };
  const display = await embed(fontBytes.display, StandardFonts.HelveticaBold);
  const body = await embed(fontBytes.body, StandardFonts.Helvetica);
  const strong = await embed(fontBytes.bodyStrong, StandardFonts.HelveticaBold);
  const allCustom = display.custom && body.custom && strong.custom;

  const w = new Writer(doc, { display: display.font, body: body.font, strong: strong.font }, allCustom ? (t) => t : winAnsi);
  const contentWidth = A4[0] - MARGIN * 2;

  w.text(props.title, { font: "display", size: 18, gap: 2 });
  w.text(`Domain: ${props.domain}`, { color: SOFT, gap: 10 });
  w.text(`Score: ${props.scoreTotal ?? "—"}`, { font: "display", size: 28, gap: 8 });
  w.text(props.summaryHeadline, { font: "strong", size: 12, color: ACCENT, gap: 4 });
  w.text(props.summaryBody, { color: SOFT, gap: 6 });
  for (const driver of props.summaryDrivers) w.text(`• ${driver}`, { x: MARGIN + 6, gap: 2 });

  w.heading("Pillars");
  for (const p of props.pillars) w.row([p.label, String(p.score)], [contentWidth - 60, 60]);

  w.heading("Page matrix");
  if (props.pages.length === 0) {
    w.text("No pages recorded.", { color: SOFT });
  } else {
    const widths = [contentWidth * 0.52, contentWidth * 0.16, contentWidth * 0.14, contentWidth * 0.18];
    w.row(["Page", "Type", "Fetched", "Structured data"], widths, { strong: true });
    for (const page of props.pages) {
      w.row([page.url, page.pageType, page.fetchStatus, page.hasJsonLd ? "JSON-LD" : "no schema"], widths);
    }
  }

  w.heading("Findings");
  if (props.findings.length === 0) {
    w.text("No findings.", { color: SOFT });
  } else {
    for (const f of props.findings) {
      w.text(`[${f.severity}] ${f.code}: ${f.message}${f.passed ? " (passed)" : ""}`, { gap: 3 });
    }
  }

  w.heading("Next steps");
  w.text(
    "Install the fix package (see INSTALL.md). Validate JSON-LD at validator.schema.org and Google Rich Results Test, then re-scan the domain.",
    { color: SOFT },
  );

  return doc.save();
}
