import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { AgentType, Workflow, WorkflowExecution } from '../types';

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 52;
const CONTENT_W = PAGE_W - MARGIN * 2;

// Palette — professional, high-contrast, print-friendly
const NAVY = rgb(0.06, 0.18, 0.35); // #0F2E59
const NAVY_LIGHT = rgb(0.1, 0.27, 0.49);
const SLATE = rgb(0.17, 0.22, 0.28);
const BODY_TEXT = rgb(0.22, 0.27, 0.33);
const MUTED = rgb(0.42, 0.47, 0.55);
const FAINT = rgb(0.55, 0.6, 0.67);
const CARD_BG = rgb(0.96, 0.97, 0.985);
const CARD_BORDER = rgb(0.87, 0.89, 0.92);
const LIGHT_LINE = rgb(0.88, 0.9, 0.93);
const ACCENT = rgb(0.2, 0.45, 0.9);
const ACCENT_BG = rgb(0.92, 0.95, 1.0);
const SUCCESS = rgb(0.07, 0.5, 0.3);
const SUCCESS_BG = rgb(0.9, 0.96, 0.92);
const ERROR = rgb(0.75, 0.18, 0.18);
const ERROR_BG = rgb(0.99, 0.92, 0.92);
const WARN_BG = rgb(1.0, 0.96, 0.9);
const FOOTER_BG = rgb(0.95, 0.96, 0.98);
const COVER_SUB = rgb(0.62, 0.71, 0.85);
const TABLE_HEADER_BG = NAVY;
const TABLE_ALT_BG = rgb(0.965, 0.97, 0.985);

interface Ctx {
  doc: PDFDocument;
  body: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  page: PDFPage;
  y: number;
}

const AGENT_LABEL: Record<AgentType, string> = {
  researcher: 'Researcher',
  writer: 'Writer',
  editor: 'Editor',
  publisher: 'Publisher',
  critic: 'Critic',
  summarizer: 'Summarizer',
};

// ---------------------------------------------------------------- helpers

function newPage(ctx: Ctx) {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.y = PAGE_H - MARGIN;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN + 28) newPage(ctx);
}

function wrapParagraph(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of sanitize(text).split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
      } else {
        if (line) lines.push(line);
        let chunk = '';
        for (const ch of word) {
          const next = chunk + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            chunk = next;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

// pdf-lib StandardFonts only support WinAnsi (CP1252). LLM output is arbitrary
// Unicode, so sanitize everything before measuring/drawing — otherwise
// widthOfTextAtSize / drawText throw and the whole report fails.
const CP1252_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
const UNICODE_FALLBACKS: Record<string, string> = {
  '→': '->',
  '←': '<-',
  '↑': '^',
  '↓': 'v',
  '⇒': '=>',
  '⇐': '<=',
  '✓': 'x',
  '✔': 'x',
  '✗': 'x',
  '✘': 'x',
  '★': '*',
  '☆': '*',
  '«': '"',
  '»': '"',
  '‹': "'",
  '›': "'",
  '　': ' ',
  ' ': ' ',
  '​': '',
  '﻿': '',
};

export function sanitize(text: string): string {
  let out = '';
  for (const ch of String(text ?? '')) {
    const mapped = UNICODE_FALLBACKS[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff) || CP1252_EXTRA.has(ch) || ch === '\n') {
      out += ch;
    }
    // else: drop characters WinAnsi cannot encode (emoji, CJK, arrows, …)
  }
  return out;
}

/** Strip markdown affordances that look noisy in print, keep structure. */
function cleanInline(text: string): string {
  const clean = sanitize(text)
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/`([^`]+?)`/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
  return sanitize(clean);
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string; ordered: string | null }
  | { kind: 'paragraph'; text: string };

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = [];
  const lines = raw.replace(/\r/g, '').split('\n');
  let para: string[] = [];
  let orderedIdx = 0;

  const flush = () => {
    if (para.length) {
      const text = cleanInline(para.join(' ').trim());
      if (text) blocks.push({ kind: 'paragraph', text });
      para = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      flush();
      continue;
    }
    // Markdown heading
    if (/^#{1,4}\s+/.test(t)) {
      flush();
      blocks.push({ kind: 'heading', text: cleanInline(t) });
      continue;
    }
    // Bullet
    const bullet = t.match(/^([-*•·]|\d+[.)])\s+(.*)/);
    if (bullet) {
      flush();
      const marker = bullet[1];
      const isOrdered = /^\d/.test(marker);
      orderedIdx = isOrdered ? orderedIdx + 1 : 0;
      blocks.push({
        kind: 'bullet',
        text: cleanInline(bullet[2]),
        ordered: isOrdered ? String(orderedIdx) : null,
      });
      continue;
    }
    // ALL-CAPS short line reads as a subheading
    if (t.length < 72 && t === t.toUpperCase() && /[A-Z]{3,}/.test(t)) {
      flush();
      blocks.push({ kind: 'heading', text: cleanInline(t) });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

function drawTextBlock(
  ctx: Ctx,
  text: string,
  opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; gap?: number; lineHeight?: number } = {},
) {
  const font = opts.font ?? ctx.body;
  const size = opts.size ?? 10.5;
  const color = opts.color ?? BODY_TEXT;
  const lineHeight = opts.lineHeight ?? size * 1.5;
  for (const line of wrapParagraph(text, font, size, CONTENT_W)) {
    ensureSpace(ctx, lineHeight);
    if (line) ctx.page.drawText(line, { x: MARGIN, y: ctx.y - size, size, font, color });
    ctx.y -= lineHeight;
  }
  ctx.y -= opts.gap ?? 6;
}

function drawRule(ctx: Ctx, gap = 14) {
  ensureSpace(ctx, gap + 4);
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y },
    end: { x: PAGE_W - MARGIN, y: ctx.y },
    thickness: 0.75,
    color: LIGHT_LINE,
  });
  ctx.y -= gap;
}

/** Section header with small accent bar + uppercase label. */
function drawSectionHeader(ctx: Ctx, label: string, hint?: string) {
  ensureSpace(ctx, 52);
  ctx.y -= 6;
  // Accent bar
  ctx.page.drawRectangle({ x: MARGIN, y: ctx.y - 14, width: 26, height: 3, color: ACCENT });
  ctx.y -= 8;
  ctx.page.drawText(label.toUpperCase(), {
    x: MARGIN,
    y: ctx.y - 11,
    size: 11,
    font: ctx.bold,
    color: NAVY,
  });
  const labelW = ctx.bold.widthOfTextAtSize(label.toUpperCase(), 11);
  if (hint) {
    ctx.page.drawText(hint, { x: MARGIN + labelW + 8, y: ctx.y - 11, size: 9.5, font: ctx.body, color: MUTED });
  }
  ctx.y -= 24;
}

function drawBadge(ctx: Ctx, x: number, y: number, text: string, fg: ReturnType<typeof rgb>, bg: ReturnType<typeof rgb>): number {
  text = sanitize(text);
  const size = 8.5;
  const padX = 7;
  const w = ctx.bold.widthOfTextAtSize(text, size) + padX * 2;
  const h = 15;
  ctx.page.drawRectangle({ x, y: y - h + 4, width: w, height: h, color: bg, borderColor: fg, borderWidth: 0.5 });
  ctx.page.drawText(text, { x: x + padX, y: y - h + 8, size, font: ctx.bold, color: fg });
  return w;
}

function formatDuration(ms?: number): string {
  if (ms == null || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

// ---------------------------------------------------------------- sections

function drawCover(ctx: Ctx, workflowName: string, status: string, statusFg: ReturnType<typeof rgb>, statusBg: ReturnType<typeof rgb>) {
  const bandH = 178;
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - bandH, width: PAGE_W, height: bandH, color: NAVY });
  // Thin accent line under the band
  ctx.page.drawRectangle({ x: 0, y: PAGE_H - bandH - 3, width: PAGE_W, height: 3, color: ACCENT });

  ctx.page.drawText('AGENT SWARM ORCHESTRATOR', {
    x: MARGIN,
    y: PAGE_H - 58,
    size: 10,
    font: ctx.bold,
    color: COVER_SUB,
  });

  const titleLines = wrapParagraph(workflowName || 'Untitled Swarm', ctx.bold, 29, CONTENT_W);
  let ty = PAGE_H - 92;
  const shown = titleLines.slice(0, 3);
  for (const line of shown) {
    ctx.page.drawText(line, { x: MARGIN, y: ty - 29, size: 29, font: ctx.bold, color: rgb(1, 1, 1) });
    ty -= 35;
  }

  ctx.y = PAGE_H - bandH - 26;

  // Meta row: generated date + status badge
  const metaSize = 9.5;
  const meta = `Final report  ·  Generated ${formatDate(Date.now())}`;
  ctx.page.drawText(meta, { x: MARGIN, y: ctx.y - metaSize, size: metaSize, font: ctx.body, color: MUTED });
  const badgeW =
    ctx.bold.widthOfTextAtSize(status, 8.5) + 14;
  drawBadge(ctx, PAGE_W - MARGIN - badgeW, ctx.y - metaSize + 4, status, statusFg, statusBg);
  ctx.y -= 22;
}

function drawInputCard(ctx: Ctx, input: string) {
  ensureSpace(ctx, 90);
  const label = 'SWARM INPUT';
  const labelSize = 8.5;
  const textSize = 10.5;
  const lineHeight = textSize * 1.5;
  const pad = 14;

  const lines = wrapParagraph(input || '(no input provided)', ctx.body, textSize, CONTENT_W - pad * 2);
  const textH = Math.max(lines.length * lineHeight, lineHeight);
  const cardH = 22 + textH + pad * 1.4;

  ensureSpace(ctx, cardH + 8);
  const top = ctx.y;
  ctx.page.drawRectangle({
    x: MARGIN,
    y: top - cardH,
    width: CONTENT_W,
    height: cardH,
    color: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 0.75,
  });
  ctx.page.drawText(label, {
    x: MARGIN + pad,
    y: top - 18,
    size: labelSize,
    font: ctx.bold,
    color: FAINT,
  });
  let ly = top - 26;
  for (const line of lines) {
    if (line) ctx.page.drawText(line, { x: MARGIN + pad, y: ly - textSize, size: textSize, font: ctx.body, color: SLATE });
    ly -= lineHeight;
  }
  ctx.y = top - cardH - 12;
}

function drawStatCards(
  ctx: Ctx,
  stats: { value: string; label: string }[],
) {
  const gap = 8;
  const cardW = (CONTENT_W - gap * (stats.length - 1)) / stats.length;
  const cardH = 52;
  ensureSpace(ctx, cardH + 10);
  const top = ctx.y;
  stats.forEach((s, i) => {
    const x = MARGIN + i * (cardW + gap);
    ctx.page.drawRectangle({
      x,
      y: top - cardH,
      width: cardW,
      height: cardH,
      color: CARD_BG,
      borderColor: CARD_BORDER,
      borderWidth: 0.75,
    });
    const vSize = 15;
    const vW = ctx.bold.widthOfTextAtSize(s.value, vSize);
    ctx.page.drawText(s.value, {
      x: x + (cardW - vW) / 2,
      y: top - 24,
      size: vSize,
      font: ctx.bold,
      color: NAVY,
    });
    const lSize = 8;
    const lW = ctx.body.widthOfTextAtSize(s.label.toUpperCase(), lSize);
    ctx.page.drawText(s.label.toUpperCase(), {
      x: x + (cardW - lW) / 2,
      y: top - 40,
      size: lSize,
      font: ctx.body,
      color: MUTED,
    });
  });
  ctx.y = top - cardH - 10;
}

function drawResultsTable(
  ctx: Ctx,
  rows: { idx: string; agent: string; status: string; time: string; chars: string; failed: boolean }[],
) {
  // Columns: # | Agent | Status | Time | Output
  const cols = [30, 218, 90, 70, 75];
  const tableW = cols.reduce((a, b) => a + b, 0);
  const x0 = MARGIN + (CONTENT_W - tableW) / 2;
  const headerH = 20;
  const rowH = 18;

  ensureSpace(ctx, headerH + rowH * (rows.length + 1) + 12);
  const headers = ['#', 'AGENT', 'STATUS', 'TIME', 'OUTPUT'];
  let y = ctx.y;
  // Header
  ctx.page.drawRectangle({ x: x0, y: y - headerH, width: tableW, height: headerH, color: TABLE_HEADER_BG });
  let hx = x0;
  headers.forEach((h, i) => {
    ctx.page.drawText(h, { x: hx + 8, y: y - 14, size: 8, font: ctx.bold, color: rgb(1, 1, 1) });
    hx += cols[i];
  });
  y -= headerH;

  rows.forEach((r, ri) => {
    if (ri % 2 === 1) {
      ctx.page.drawRectangle({ x: x0, y: y - rowH, width: tableW, height: rowH, color: TABLE_ALT_BG });
    }
    // Row border
    ctx.page.drawLine({ start: { x: x0, y: y - rowH }, end: { x: x0 + tableW, y: y - rowH }, thickness: 0.5, color: LIGHT_LINE });
    const cells = [r.idx, r.agent, r.status, r.time, r.chars];
    let cx = x0;
    cells.forEach((c, ci) => {
      const isStatus = ci === 2;
      const safe = sanitize(c).slice(0, 28);
      ctx.page.drawText(safe, {
        x: cx + 8,
        y: y - 13,
        size: 8.5,
        font: isStatus ? ctx.bold : ctx.body,
        color: isStatus ? (r.failed ? ERROR : SUCCESS) : SLATE,
      });
      cx += cols[ci];
    });
    y -= rowH;
  });
  // Outer border (stroke only — no fill)
  ctx.page.drawRectangle({ x: x0, y, width: tableW, height: headerH + rowH * rows.length, borderColor: CARD_BORDER, borderWidth: 0.75 });
  ctx.y = y - 12;
}

function drawRichBody(ctx: Ctx, raw: string) {
  const blocks = parseBlocks(raw).slice(0, 400); // safety cap
  const baseSize = 10.5;
  for (const b of blocks) {
    if (b.kind === 'heading') {
      ensureSpace(ctx, 30);
      ctx.y -= 2;
      ctx.page.drawText(b.text.toUpperCase().slice(0, 120), {
        x: MARGIN,
        y: ctx.y - 10,
        size: 10,
        font: ctx.bold,
        color: NAVY_LIGHT,
      });
      ctx.y -= 20;
    } else if (b.kind === 'bullet') {
      const indent = MARGIN + 14;
      const maxW = CONTENT_W - 14;
      const marker = b.ordered ? `${b.ordered}.` : '•';
      const lines = wrapParagraph(b.text, ctx.body, baseSize, maxW - 12);
      lines.forEach((line, li) => {
        ensureSpace(ctx, baseSize * 1.5);
        if (li === 0) {
          ctx.page.drawText(marker, { x: MARGIN + 2, y: ctx.y - baseSize, size: baseSize, font: ctx.bold, color: ACCENT });
          if (line) ctx.page.drawText(line, { x: indent, y: ctx.y - baseSize, size: baseSize, font: ctx.body, color: BODY_TEXT });
        } else if (line) {
          ctx.page.drawText(line, { x: indent, y: ctx.y - baseSize, size: baseSize, font: ctx.body, color: BODY_TEXT });
        }
        ctx.y -= baseSize * 1.5;
      });
      ctx.y -= 1;
    } else {
      drawTextBlock(ctx, b.text, { size: baseSize, gap: 3 });
    }
  }
}

function drawAgentSection(
  ctx: Ctx,
  idx: number,
  name: string,
  agentType: AgentType,
  status: string,
  failed: boolean,
  duration: string,
  outputLen: number,
  body: string | null,
  error: string | null,
  toolsUsed: { server: string; tool: string }[] = [],
) {
  ensureSpace(ctx, 110);
  ctx.y -= 2;

  // Number circle
  const circleY = ctx.y - 10;
  ctx.page.drawCircle({ x: MARGIN + 9, y: circleY, size: 10, color: NAVY });
  const num = String(idx + 1);
  ctx.page.drawText(num, {
    x: MARGIN + 9 - ctx.bold.widthOfTextAtSize(num, 10) / 2,
    y: circleY - 3.5,
    size: 10,
    font: ctx.bold,
    color: rgb(1, 1, 1),
  });

  // Name + type
  const safeName = sanitize(name).slice(0, 60);
  ctx.page.drawText(safeName, { x: MARGIN + 26, y: ctx.y - 14, size: 13.5, font: ctx.bold, color: NAVY });
  const typeLabel = `·  ${AGENT_LABEL[agentType] ?? agentType}`;
  ctx.page.drawText(typeLabel, {
    x: MARGIN + 26 + ctx.bold.widthOfTextAtSize(safeName, 13.5) + 6,
    y: ctx.y - 14,
    size: 9.5,
    font: ctx.body,
    color: MUTED,
  });
  ctx.y -= 22;

  // Meta line: badge + duration + length
  const badgeText = status;
  const fg = failed ? ERROR : status === 'DONE' ? SUCCESS : MUTED;
  const bg = failed ? ERROR_BG : status === 'DONE' ? SUCCESS_BG : CARD_BG;
  const bw = drawBadge(ctx, MARGIN + 26, ctx.y - 2, badgeText, fg, bg);
  let metaText = `${duration}   ·   ${outputLen > 0 ? `${formatChars(outputLen)} chars` : 'no output'}`;
  if (toolsUsed.length > 0) {
    metaText += `   ·   via MCP: ${toolsUsed.map((t) => `${t.server}/${t.tool}`).join(', ').slice(0, 120)}`;
  }
  const meta = sanitize(metaText);
  ctx.page.drawText(meta, { x: MARGIN + 26 + bw + 8, y: ctx.y - 8, size: 9, font: ctx.body, color: MUTED });
  ctx.y -= 20;

  if (failed) {
    const msg = error || 'Unknown error';
    const lines = wrapParagraph(msg, ctx.body, 10.5, CONTENT_W - 26 - 28);
    const h = Math.max(lines.length * 15.75, 20) + 24;
    ensureSpace(ctx, h + 6);
    const top = ctx.y;
    ctx.page.drawRectangle({
      x: MARGIN + 26,
      y: top - h,
      width: CONTENT_W - 26,
      height: h,
      color: ERROR_BG,
      borderColor: ERROR,
      borderWidth: 0.75,
    });
    let ly = top - 12;
    for (const line of lines) {
      if (line) ctx.page.drawText(line, { x: MARGIN + 26 + 12, y: ly - 10.5, size: 10.5, font: ctx.body, color: ERROR });
      ly -= 15.75;
    }
    ctx.y = top - h - 8;
  } else if (body && body.trim()) {
    // Indent body slightly to align under the title
    const savedMargin = MARGIN;
    void savedMargin;
    drawRichBody(ctx, body);
  } else {
    drawTextBlock(ctx, '(no output produced for this agent)', { size: 10, color: MUTED, gap: 4 });
  }
  ctx.y -= 4;
}

function drawTimeline(
  ctx: Ctx,
  items: { name: string; ms: number }[],
  totalMs: number,
) {
  const maxMs = Math.max(totalMs, ...items.map((i) => i.ms), 1);
  const barMax = 260;
  items.forEach((item) => {
    ensureSpace(ctx, 22);
    const label = sanitize(item.name).slice(0, 26);
    ctx.page.drawText(label, { x: MARGIN, y: ctx.y - 10, size: 9.5, font: ctx.body, color: SLATE });
    const barW = Math.max(4, (item.ms / maxMs) * barMax);
    const bx = MARGIN + 170;
    ctx.page.drawRectangle({ x: bx, y: ctx.y - 12, width: barMax, height: 8, color: CARD_BG, borderColor: CARD_BORDER, borderWidth: 0.5 });
    ctx.page.drawRectangle({ x: bx, y: ctx.y - 12, width: barW, height: 8, color: ACCENT });
    ctx.page.drawText(formatDuration(item.ms), { x: bx + barMax + 8, y: ctx.y - 10, size: 9, font: ctx.body, color: MUTED });
    ctx.y -= 20;
  });
  ctx.y -= 4;
}

function drawChecklist(ctx: Ctx, checks: { ok: boolean; text: string }[]) {
  checks.forEach((c) => {
    ensureSpace(ctx, 20);
    const boxY = ctx.y - 12;
    ctx.page.drawRectangle({
      x: MARGIN,
      y: boxY - 2,
      width: 12,
      height: 12,
      color: c.ok ? SUCCESS_BG : WARN_BG,
      borderColor: c.ok ? SUCCESS : rgb(0.7, 0.55, 0.1),
      borderWidth: 0.75,
    });
    ctx.page.drawText(c.ok ? 'x' : '!', {
      x: MARGIN + 3.2,
      y: boxY + 1,
      size: 8,
      font: ctx.bold,
      color: c.ok ? SUCCESS : rgb(0.6, 0.45, 0.05),
    });
    const lines = wrapParagraph(c.text, ctx.body, 10, CONTENT_W - 24);
    let ly = ctx.y;
    lines.forEach((line) => {
      if (line) ctx.page.drawText(line, { x: MARGIN + 20, y: ly - 10, size: 10, font: ctx.body, color: BODY_TEXT });
      ly -= 15;
    });
    ctx.y = ly - 4;
  });
}

// ---------------------------------------------------------------- main

export async function generateReportPdf(
  execution: WorkflowExecution,
  workflow: Workflow,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const ctx: Ctx = { doc, body, bold, italic, page: doc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN };

  const results = Object.values(execution.results);
  const done = results.filter((r) => r.status === 'done').length;
  const errored = results.filter((r) => r.status === 'error').length;
  const running = results.filter((r) => r.status === 'running').length;
  const totalMs = (execution.finishedAt ?? Date.now()) - execution.startedAt;
  const statusUpper = execution.status.toUpperCase();
  const statusFg = execution.status === 'completed' ? SUCCESS : execution.status === 'failed' ? ERROR : ACCENT;
  const statusBg = execution.status === 'completed' ? SUCCESS_BG : execution.status === 'failed' ? ERROR_BG : ACCENT_BG;

  // ---- Cover ----
  drawCover(ctx, sanitize(workflow.name) || 'Untitled Swarm', statusUpper, statusFg, statusBg);

  // ---- Input ----
  drawInputCard(ctx, execution.input);

  // ---- Run summary ----
  drawSectionHeader(ctx, 'Run summary', `${workflow.nodes.length} agents  ·  ${workflow.edges.length} connections`);
  drawStatCards(ctx, [
    { value: String(workflow.nodes.length), label: 'Agents' },
    { value: String(done), label: 'Completed' },
    { value: String(errored), label: 'Errors' },
    { value: formatDuration(totalMs), label: 'Run time' },
  ]);

  const summaryLine =
    running > 0
      ? `${running} agent${running === 1 ? '' : 's'} still running at export time — this report is a snapshot.`
      : errored > 0
        ? `${done} of ${workflow.nodes.length} agents completed successfully; ${errored} reported errors (see details below).`
        : `All ${workflow.nodes.length} agents completed successfully with no errors.`;
  drawTextBlock(ctx, summaryLine, { size: 10, color: MUTED, gap: 4 });

  drawRule(ctx);

  // ---- Results at a glance (table) ----
  drawSectionHeader(ctx, 'Results at a glance', 'status · timing · output size per agent');
  drawResultsTable(
    ctx,
    workflow.nodes.map((node, i) => {
      const r = execution.results[node.id];
      const ms = r?.startedAt != null && r?.finishedAt != null ? r.finishedAt - r.startedAt : undefined;
      return {
        idx: String(i + 1),
        agent: node.name.slice(0, 30),
        status: r ? r.status.toUpperCase() : 'NOT RUN',
        time: formatDuration(ms),
        chars: r?.output ? formatChars(r.output.length) : '—',
        failed: r?.status === 'error',
      };
    }),
  );

  drawRule(ctx);

  // ---- Detailed agent outputs ----
  drawSectionHeader(ctx, 'Agent outputs', 'in pipeline order · full text');
  workflow.nodes.forEach((node, idx) => {
    const result = execution.results[node.id];
    const status = result ? result.status.toUpperCase() : 'NOT RUN';
    const failed = result?.status === 'error';
    const duration =
      result?.startedAt != null && result?.finishedAt != null
        ? formatDuration(result.finishedAt - result.startedAt)
        : '—';
    const outputLen = result?.output?.length ?? 0;
    drawAgentSection(
      ctx,
      idx,
      node.name,
      node.type,
      status,
      failed ?? false,
      duration,
      outputLen,
      result?.output ?? null,
      result?.error ?? null,
      result?.toolsUsed ?? [],
    );
    if (idx < workflow.nodes.length - 1) drawRule(ctx, 12);
  });

  // ---- Execution timeline ----
  drawSectionHeader(ctx, 'Execution timeline', 'relative duration per agent');
  drawTimeline(
    ctx,
    workflow.nodes.map((n) => {
      const r = execution.results[n.id];
      const ms = r?.startedAt != null && r?.finishedAt != null ? r.finishedAt - r.startedAt : 0;
      return { name: n.name, ms };
    }),
    totalMs,
  );

  drawRule(ctx);

  // ---- Quality checks ----
  drawSectionHeader(ctx, 'Quality checks', 'automated validation of this run');
  const emptyOutputs = workflow.nodes.filter((n) => {
    const r = execution.results[n.id];
    return r?.status === 'done' && (!r.output || !r.output.trim());
  });
  drawChecklist(ctx, [
    { ok: errored === 0, text: errored === 0 ? 'No agent errors — every node finished cleanly.' : `${errored} agent${errored === 1 ? '' : 's'} reported errors. See the agent sections above for messages.` },
    {
      ok: emptyOutputs.length === 0,
      text:
        emptyOutputs.length === 0
          ? 'All completed agents produced non-empty output.'
          : `${emptyOutputs.length} completed agent${emptyOutputs.length === 1 ? '' : 's'} returned empty output: ${emptyOutputs.map((n) => n.name).join(', ').slice(0, 120)}.`,
    },
    {
      ok: done === workflow.nodes.length,
      text:
        done === workflow.nodes.length
          ? `Full pipeline coverage — ${done}/${workflow.nodes.length} agents completed.`
          : `Partial coverage — ${done}/${workflow.nodes.length} agents completed. Re-run to fill the gaps.`,
    },
    { ok: true, text: 'Artifacts for this run are backed up to R2 (artifacts/*.json) and this PDF to reports/*.pdf.' },
  ]);

  // ---- Footers with background bar ----
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: 44, color: FOOTER_BG });
    page.drawLine({ start: { x: MARGIN, y: 44 }, end: { x: PAGE_W - MARGIN, y: 44 }, thickness: 0.5, color: LIGHT_LINE });
    page.drawText(`Agent Swarm Orchestrator  ·  ${sanitize(workflow.name) || 'Untitled'}  ·  ${formatDate(execution.startedAt)}`, {
      x: MARGIN,
      y: 24,
      size: 7.5,
      font: body,
      color: MUTED,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    page.drawText(label, {
      x: PAGE_W - MARGIN - body.widthOfTextAtSize(label, 7.5),
      y: 24,
      size: 7.5,
      font: body,
      color: MUTED,
    });
    page.drawText(`Execution ${execution.id.slice(0, 8)}`, {
      x: MARGIN,
      y: 13,
      size: 7,
      font: body,
      color: FAINT,
    });
  });

  doc.setTitle(`${workflow.name} — Agent Swarm Report`);
  doc.setSubject(`Finalized multi-agent report · ${done}/${workflow.nodes.length} agents · ${formatDuration(totalMs)}`);
  doc.setProducer('Agent Swarm Orchestrator');
  doc.setCreationDate(new Date());
  return doc.save();
}
