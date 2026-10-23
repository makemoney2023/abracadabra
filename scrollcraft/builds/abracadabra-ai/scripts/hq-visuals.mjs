/**
 * Illustrated HQ visuals: one data-flow diagram and five interface mockups, drawn as SVG.
 * Everything here is original and uses sample content only ("Sample Co.", "Draft v1").
 * No screenshot of a real HQ space is used, and there are no people or logos.
 *
 * Two render modes share one drawing:
 *  - "live": real <text> in Inter Tight / IBM Plex Sans, for inline use on the pages.
 *  - "outline": every word is a glyph outline (scripts/og-brand.mjs), for the standalone
 *    SVG and PNG exports, so they look the same with or without the site fonts.
 * Colours follow the site tokens: canvas #0B0B0A, panels #161615, ink #F5F0E8,
 * accent #FF4B24, cyan #8DEBF2, green #C6FFB3, amber #F5C46B.
 */
import { measure, textPath, wrapToWidth } from "./og-brand.mjs";

export const CAPTION = "Illustrative interface. Sample content.";
export const NETWORKS = ["Instagram", "Facebook", "LinkedIn", "TikTok", "X", "YouTube", "Threads", "Google Business", "Bluesky"];

export const C = {
  canvas: "#0B0B0A",
  panel: "#161615",
  panel2: "#1D1D1A",
  ink: "#F5F0E8",
  soft: "#AAA49A",
  line: "rgba(245,240,232,0.14)",
  accent: "#FF4B24",
  accentText: "#FF8A6B",
  cyan: "#8DEBF2",
  green: "#C6FFB3",
  amber: "#F5C46B",
};

export const TONES = {
  cyan: { text: C.cyan, fill: "rgba(141,235,242,0.09)", stroke: "rgba(141,235,242,0.40)" },
  accent: { text: C.accentText, fill: "rgba(255,75,36,0.11)", stroke: "rgba(255,75,36,0.50)" },
  green: { text: C.green, fill: "rgba(198,255,179,0.09)", stroke: "rgba(198,255,179,0.40)" },
  amber: { text: C.amber, fill: "rgba(245,196,107,0.09)", stroke: "rgba(245,196,107,0.42)" },
  muted: { text: C.soft, fill: "rgba(245,240,232,0.05)", stroke: "rgba(245,240,232,0.20)" },
};

const FACE = {
  "inter-500": { family: "'Inter Tight', sans-serif", weight: 500 },
  "inter-600": { family: "'Inter Tight', sans-serif", weight: 600 },
  "plex-400": { family: "'IBM Plex Sans', sans-serif", weight: 400 },
  "plex-500": { family: "'IBM Plex Sans', sans-serif", weight: 500 },
};

export function esc(value) {
  return String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** A tiny drawing kit bound to one render mode. */
export function kit(mode) {
  const outline = mode === "outline";
  const width = (value, { size, font = "plex-400", tracking = 0 }) => measure(value, { font, size, tracking });
  const text = (value, { x, y, size, font = "plex-400", fill = C.ink, tracking = 0, anchor = "start" }) => {
    if (outline) {
      const w = anchor === "middle" ? measure(value, { font, size, tracking }) : 0;
      return textPath(value, { x: anchor === "middle" ? x - w / 2 : x, y, size, font, tracking, fill, anchor: anchor === "end" ? "end" : "start" }).svg;
    }
    const face = FACE[font];
    const ls = tracking ? ` letter-spacing="${(tracking * size).toFixed(2)}"` : "";
    const a = anchor === "start" ? "" : ` text-anchor="${anchor}"`;
    return `<text x="${x}" y="${y}" font-family="${face.family}" font-weight="${face.weight}" font-size="${size}" fill="${fill}"${ls}${a}>${esc(value)}</text>`;
  };
  const lines = (value, maxWidth, o, maxLines = 4) => wrapToWidth(value, maxWidth, o, maxLines);
  const pill = (x, y, label, tone = "cyan", { size = 13, dot = true } = {}) => {
    const t = TONES[tone];
    const w = Math.ceil(width(label, { size, font: "plex-500" })) + (dot ? 30 : 20);
    const h = size + 14;
    const parts = [`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${t.fill}" stroke="${t.stroke}"/>`];
    if (dot) parts.push(`<circle cx="${x + 12}" cy="${y + h / 2}" r="3" fill="${t.text}"/>`);
    parts.push(text(label, { x: x + (dot ? 21 : 10), y: y + h / 2 + size * 0.35, size, font: "plex-500", fill: t.text }));
    return { w, h, svg: parts.join("") };
  };
  const panel = (x, y, w, h, { stroke = C.line, fill = C.panel, r = 8, cls = "" } = {}) =>
    `<rect${cls ? ` class="${cls}"` : ""} x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
  const dots = (x, y) => ["#FF5F57", "#FEBC2E", "#28C840"].map((fill, i) => `<circle cx="${x + i * 14}" cy="${y}" r="4" fill="${fill}" fill-opacity="0.8"/>`).join("");
  const windowFrame = (w, h, title) =>
    `<rect width="${w}" height="${h}" rx="10" fill="${C.canvas}" stroke="rgba(245,240,232,0.18)"/>`
    + `<path d="M0 40H${w}" stroke="rgba(245,240,232,0.12)"/>`
    + dots(20, 20)
    + text(title, { x: w / 2, y: 25, size: 13, font: "plex-500", fill: C.soft, anchor: "middle" });
  const button = (x, y, w, label, kind = "ghost") => {
    const primary = kind === "primary";
    return `<rect x="${x}" y="${y}" width="${w}" height="34" rx="6" fill="${primary ? C.accent : "none"}" stroke="${primary ? C.accent : "rgba(245,240,232,0.28)"}"/>`
      + text(label, { x: x + w / 2, y: y + 22, size: 14, font: "plex-500", fill: primary ? "#170804" : C.ink, anchor: "middle" });
  };
  return { text, width, lines, pill, panel, dots, windowFrame, button, outline };
}

export function svgOpen(w, h, { title, desc, id, mode }) {
  const xml = mode === "outline" ? `<?xml version="1.0" encoding="UTF-8"?>\n` : "";
  const attrs = mode === "outline" ? ` width="${w}" height="${h}"` : "";
  return `${xml}<svg xmlns="http://www.w3.org/2000/svg"${attrs} viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false">`
    + `<title id="${id}-t">${esc(title)}</title><desc id="${id}-d">${esc(desc)}</desc>`;
}

/* ------------------------------------------------------------------ */
/* Data-flow diagram                                                   */
/* ------------------------------------------------------------------ */

export const FLOW_STEPS = [
  { n: "01", title: "Request", owner: "You", tone: "muted", detail: "Email us, use the start-a-project form, or leave a note on a piece in your space.", status: null },
  { n: "02", title: "Plan", owner: "HQ", tone: "cyan", detail: "A card on your board, with a note on what each piece of work must make.", status: "To do" },
  { n: "03", title: "Agents build", owner: "Digital workers", tone: "cyan", detail: "Each agent works its own piece, using skills picked for the task. It files the work.", status: "Filed, held" },
  { n: "04", title: "Review", owner: "Client Services", tone: "amber", detail: "Checked against your request. Sent back with a note, or released to your space.", status: "Held until released" },
  { n: "05", title: "You approve", owner: "You", tone: "green", detail: "Approve each piece, ask for a change, or remove it.", status: "Your call" },
  { n: "06", title: "Delivery", owner: "HQ", tone: "green", detail: "Finished work sits in named folders, each file showing its type.", status: "In your space" },
  { n: "07", title: "Social calendar", owner: "HQ", tone: "accent", detail: "Once a piece is approved and your accounts are connected, it is scheduled into your next open slot.", status: "Approved only" },
];

export const FLOW_ALT = "Data-flow diagram in seven steps. You send a request. HQ turns it into a card with a plan. Digital workers build and file the work, which is held. Client Services reviews it and sends it back with a note or releases it to your space. You approve each piece, ask for a change or remove it. Finished work is delivered to named folders. Once a piece is approved and your accounts are connected, it is scheduled into your next open slot. Only approved pieces can be scheduled. A change request opens a new card. Held work stays out of your folders, previews and search.";

/** Wide 1600x900 diagram. */
export function flowDiagramWide({ mode = "live", id = "hq-flow-wide" } = {}) {
  const k = kit(mode);
  const W = 1600;
  const H = 900;
  const nodeW = 188;
  const gap = 24;
  const x0 = 70;
  const top = 300;
  const nodeH = 304;
  const xs = FLOW_STEPS.map((_, i) => x0 + i * (nodeW + gap));
  const out = [svgOpen(W, H, { title: "How work moves through HQ", desc: FLOW_ALT, id, mode })];
  out.push(`<defs><pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#F5F0E8" stroke-opacity="0.035"/></pattern>`
    + `<marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${C.cyan}"/></marker>`
    + `<marker id="${id}-arrow-a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${C.accentText}"/></marker></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${C.canvas}"/><rect width="${W}" height="${H}" fill="url(#${id}-grid)"/>`);
  out.push(k.text("DATA FLOW", { x: 70, y: 74, size: 15, font: "plex-500", fill: C.cyan, tracking: 0.12 }));
  out.push(k.text("How work moves through HQ", { x: 70, y: 118, size: 38, font: "inter-600", fill: C.ink, tracking: -0.01 }));
  out.push(k.text("Seven steps from request to social calendar. Only approved work reaches your calendar.", { x: 70, y: 152, size: 18, font: "plex-400", fill: C.soft }));

  // Loops above the row.
  const cx = (i) => xs[i] + nodeW / 2;
  const loop = (from, to, y, label, tone, markerId) => {
    const color = tone;
    const d = `M${cx(from)} ${top} V${y} H${cx(to)} V${top - 4}`;
    const mid = (cx(from) + cx(to)) / 2;
    return `<path class="hq-flow-loop" d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-dasharray="6 7" marker-end="url(#${markerId})"/>`
      + `<rect x="${mid - k.width(label, { size: 15, font: "plex-500" }) / 2 - 10}" y="${y - 14}" width="${k.width(label, { size: 15, font: "plex-500" }) + 20}" height="28" rx="14" fill="${C.canvas}" stroke="${color}" stroke-opacity="0.6"/>`
      + k.text(label, { x: mid, y: y + 5, size: 15, font: "plex-500", fill: color, anchor: "middle" });
  };
  out.push(loop(3, 2, 268, "Sent back with a note", C.amber, `${id}-arrow`));
  out.push(loop(4, 1, 218, "Ask for a change: a new card opens", C.accentText, `${id}-arrow-a`));

  // Main track.
  const midY = top + nodeH / 2;
  FLOW_STEPS.slice(0, -1).forEach((_, i) => {
    const x1 = xs[i] + nodeW;
    const x2 = xs[i + 1];
    out.push(`<path class="hq-flow-link" d="M${x1} ${midY} H${x2 - 3}" fill="none" stroke="${C.cyan}" stroke-width="1.8" marker-end="url(#${id}-arrow)"/>`);
  });

  FLOW_STEPS.forEach((s, i) => {
    const x = xs[i];
    const t = TONES[s.tone];
    const hi = i === 3 || i === 6;
    out.push(k.panel(x, top, nodeW, nodeH, { stroke: hi ? "rgba(255,75,36,0.55)" : C.line }));
    out.push(`<rect x="${x + 16}" y="${top + 16}" width="34" height="22" rx="6" fill="rgba(255,75,36,0.12)" stroke="rgba(255,75,36,0.5)"/>`);
    out.push(k.text(s.n, { x: x + 33, y: top + 32, size: 12.5, font: "plex-500", fill: C.accentText, anchor: "middle" }));
    out.push(k.text(s.owner.toUpperCase(), { x: x + nodeW - 16, y: top + 32, size: 11, font: "plex-500", fill: t.text, tracking: 0.08, anchor: "end" }));
    const titleLines = k.lines(s.title, nodeW - 32, { font: "inter-600", size: 23 }, 2);
    titleLines.forEach((line, li) => out.push(k.text(line, { x: x + 16, y: top + 76 + li * 27, size: 23, font: "inter-600", fill: C.ink })));
    const dy = top + 76 + (titleLines.length - 1) * 27 + 30;
    k.lines(s.detail, nodeW - 32, { font: "plex-400", size: 16 }, 8).forEach((line, li) => out.push(k.text(line, { x: x + 16, y: dy + li * 22, size: 16, font: "plex-400", fill: C.soft })));
    if (s.status) {
      const p = k.pill(x + 16, top + nodeH - 44, s.status, s.tone === "muted" ? "muted" : s.tone, { size: 12 });
      out.push(p.svg);
    }
  });

  // Held bracket under steps 3 and 4.
  const hx1 = xs[2];
  const hx2 = xs[3] + nodeW;
  const by = top + nodeH + 28;
  out.push(`<path d="M${hx1} ${by - 10} V${by} H${hx2} V${by - 10}" fill="none" stroke="${C.amber}" stroke-opacity="0.7" stroke-width="1.5"/>`);
  out.push(k.text("Held: out of your folders, previews and search", { x: (hx1 + hx2) / 2, y: by + 26, size: 16, font: "plex-500", fill: C.amber, anchor: "middle" }));
  // Approved bracket under steps 6 and 7.
  const ax1 = xs[5];
  const ax2 = xs[6] + nodeW;
  out.push(`<path d="M${ax1} ${by - 10} V${by} H${ax2} V${by - 10}" fill="none" stroke="${C.green}" stroke-opacity="0.7" stroke-width="1.5"/>`);
  out.push(k.text("Only what you approve can be scheduled", { x: (ax1 + ax2) / 2, y: by + 26, size: 16, font: "plex-500", fill: C.green, anchor: "middle" }));

  // Networks strip.
  const sy = 748;
  out.push(k.panel(x0, sy, W - 2 * x0, 84, { fill: C.panel2 }));
  out.push(k.text("SOCIAL NETWORKS", { x: x0 + 20, y: sy + 30, size: 12, font: "plex-500", fill: C.cyan, tracking: 0.12 }));
  out.push(k.text(NETWORKS.join("   ·   "), { x: x0 + 20, y: sy + 62, size: 20, font: "inter-500", fill: C.ink }));
  out.push(k.text("Accounts connect through each network's own sign-in.", { x: W - x0 - 20, y: sy + 30, size: 14, font: "plex-400", fill: C.soft, anchor: "end" }));
  out.push(k.text("Illustrative diagram. Simplified.", { x: W - x0 - 20, y: sy + 62, size: 14, font: "plex-400", fill: C.soft, anchor: "end" }));
  out.push(`</svg>`);
  return out.join("");
}

/** Tall diagram for narrow screens. */
export function flowDiagramTall({ mode = "live", id = "hq-flow-tall" } = {}) {
  const k = kit(mode);
  const W = 520;
  const nodeW = 472;
  const x = 24;
  const gapY = 50;
  const dSize = 20;
  const noteSize = 16;
  const notes = { 3: "Sent back with a note: the agent fixes it on the same card.", 4: "Ask for a change: a new card opens on your board." };
  const noteLines = (i) => (notes[i] ? k.lines(notes[i], 250, { font: "plex-500", size: noteSize }, 3) : []);
  let y = 28;
  const nodes = FLOW_STEPS.map((s, i) => {
    const dl = k.lines(s.detail, nodeW - 40, { font: "plex-400", size: dSize }, 6).length;
    const h = 92 + dl * 28 + (s.status ? 58 : 12);
    const extra = noteLines(i).length ? noteLines(i).length * 20 + 14 : 0;
    const node = { s, y, h, extra };
    y += h + gapY + extra;
    return node;
  });
  const sy = y - gapY + 28;
  const H = sy + 150 + 24;
  const out = [svgOpen(W, H, { title: "How work moves through HQ", desc: FLOW_ALT, id, mode })];
  out.push(`<defs><pattern id="${id}-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#F5F0E8" stroke-opacity="0.035"/></pattern>`
    + `<marker id="${id}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${C.cyan}"/></marker></defs>`);
  out.push(`<rect width="${W}" height="${H}" fill="${C.canvas}"/><rect width="${W}" height="${H}" fill="url(#${id}-grid)"/>`);
  nodes.forEach(({ s, y: ny, h, extra }, i) => {
    const t = TONES[s.tone];
    out.push(k.panel(x, ny, nodeW, h, { stroke: i === 3 || i === 6 ? "rgba(255,75,36,0.55)" : C.line }));
    out.push(`<rect x="${x + 20}" y="${ny + 20}" width="42" height="26" rx="6" fill="rgba(255,75,36,0.12)" stroke="rgba(255,75,36,0.5)"/>`);
    out.push(k.text(s.n, { x: x + 41, y: ny + 38, size: 15, font: "plex-500", fill: C.accentText, anchor: "middle" }));
    out.push(k.text(s.title, { x: x + 78, y: ny + 42, size: 28, font: "inter-600", fill: C.ink }));
    out.push(k.text(s.owner.toUpperCase(), { x: x + nodeW - 20, y: ny + 36, size: 13, font: "plex-500", fill: t.text, tracking: 0.08, anchor: "end" }));
    k.lines(s.detail, nodeW - 40, { font: "plex-400", size: dSize }, 6).forEach((line, li) => out.push(k.text(line, { x: x + 20, y: ny + 88 + li * 28, size: dSize, font: "plex-400", fill: C.soft })));
    if (s.status) out.push(k.pill(x + 20, ny + h - 52, s.status, s.tone, { size: 15 }).svg);
    if (i < nodes.length - 1) {
      const ay = ny + h;
      out.push(`<path class="hq-flow-link" d="M${W / 2} ${ay} V${ay + gapY + extra - 3}" fill="none" stroke="${C.cyan}" stroke-width="2" marker-end="url(#${id}-arrow)"/>`);
      const color = i === 3 ? C.amber : C.accentText;
      noteLines(i).forEach((line, li) => out.push(k.text(line, { x: W / 2 + 18, y: ay + 36 + li * 20, size: noteSize, font: "plex-500", fill: color })));
    }
  });
  out.push(k.panel(x, sy, nodeW, 150, { fill: C.panel2 }));
  out.push(k.text("SOCIAL NETWORKS", { x: x + 20, y: sy + 32, size: 13, font: "plex-500", fill: C.cyan, tracking: 0.12 }));
  [NETWORKS.slice(0, 4), NETWORKS.slice(4, 7), NETWORKS.slice(7)].forEach((row, ri) => out.push(k.text(row.join(" · "), { x: x + 20, y: sy + 66 + ri * 30, size: 20, font: "inter-500", fill: C.ink })));
  out.push(`</svg>`);
  return out.join("");
}

/* Interface mockups (sample content only)                             */
/* ------------------------------------------------------------------ */

const W = 720;
const H = 440;

/** Board with the four HQ columns. */
export function boardMockup({ mode = "live", id = "hq-board" } = {}) {
  const k = kit(mode);
  const o = [svgOpen(W, H, { title: "Illustrative HQ board with sample cards", desc: "A board for Sample Co. with four columns: To do, Doing, Waiting on Client Services and Done. Each column holds one sample card.", id, mode })];
  o.push(k.windowFrame(W, H, "Sample Co. · Board"));
  const cols = [
    { name: "To do", tone: "muted", card: "Sample request", sub: "From an email", pill: ["New", "muted"] },
    { name: "Doing", tone: "cyan", card: "Sample page, Draft v1", sub: "Agent working", pill: ["In progress", "cyan"] },
    { name: "Waiting on Client Services", tone: "amber", card: "Sample post, Draft v1", sub: "Filed and held", pill: ["Held", "amber"] },
    { name: "Done", tone: "green", card: "Sample article", sub: "Approved", pill: ["Approved", "green"] },
  ];
  const cw = 156;
  const gap = 12;
  const x0 = 20;
  cols.forEach((c, i) => {
    const x = x0 + i * (cw + gap);
    o.push(k.panel(x, 58, cw, 360, { fill: C.panel }));
    const nameLines = k.lines(c.name, cw - 24, { font: "plex-500", size: 13 }, 2);
    nameLines.forEach((line, li) => o.push(k.text(line, { x: x + 12, y: 82 + li * 16, size: 13, font: "plex-500", fill: TONES[c.tone].text })));
    const cy = 82 + nameLines.length * 16 + 10;
    o.push(`<g class="${i === 1 ? "hq-mock-pulse" : ""}">${k.panel(x + 10, cy, cw - 20, 104, { fill: C.panel2, stroke: "rgba(245,240,232,0.18)", r: 6 })}`);
    k.lines(c.card, cw - 44, { font: "inter-600", size: 15 }, 2).forEach((line, li) => o.push(k.text(line, { x: x + 20, y: cy + 26 + li * 19, size: 15, font: "inter-600", fill: C.ink })));
    o.push(k.text(c.sub, { x: x + 20, y: cy + 68, size: 12.5, font: "plex-400", fill: C.soft }));
    o.push(k.pill(x + 20, cy + 76, c.pill[0], c.pill[1], { size: 11, dot: false }).svg);
    o.push(`</g>`);
    // A faint empty slot so the column reads as a list.
    o.push(`<rect x="${x + 10}" y="${cy + 116}" width="${cw - 20}" height="52" rx="6" fill="none" stroke="rgba(245,240,232,0.10)" stroke-dasharray="4 5"/>`);
  });
  o.push(`</svg>`);
  return o.join("");
}

/** A held piece with the three client choices. */
export function reviewMockup({ mode = "live", id = "hq-review" } = {}) {
  const k = kit(mode);
  const o = [svgOpen(W, H, { title: "Illustrative review screen with sample content", desc: "A sample piece called Draft v1 for Sample Co. with a Held for review status, and three choices: Approve, Ask for a change and Remove.", id, mode })];
  o.push(k.windowFrame(W, H, "Sample Co. · Library"));
  // Picture placeholder.
  o.push(k.panel(24, 64, 340, 340, { fill: C.panel }));
  o.push(`<rect x="44" y="84" width="300" height="190" rx="6" fill="rgba(245,240,232,0.05)" stroke="rgba(245,240,232,0.12)"/>`);
  o.push(`<path d="M60 250 L130 180 L180 225 L240 150 L328 250Z" fill="rgba(141,235,242,0.14)" stroke="rgba(141,235,242,0.4)"/><circle cx="96" cy="124" r="14" fill="rgba(255,75,36,0.4)"/>`);
  o.push(k.text("Sample picture", { x: 44, y: 304, size: 13, font: "plex-500", fill: C.soft }));
  o.push(k.text("Sample caption text goes here, ready", { x: 44, y: 336, size: 14, font: "plex-400", fill: C.ink }));
  o.push(k.text("for you to read before you decide.", { x: 44, y: 356, size: 14, font: "plex-400", fill: C.ink }));
  // Right: details.
  o.push(k.text("Draft v1", { x: 392, y: 98, size: 26, font: "inter-600", fill: C.ink }));
  o.push(k.text("Sample Co.", { x: 392, y: 122, size: 14, font: "plex-400", fill: C.soft }));
  o.push(k.pill(392, 138, "Released for your review", "green", { size: 13 }).svg);
  o.push(k.text("From Client Services", { x: 392, y: 196, size: 13, font: "plex-500", fill: C.cyan }));
  k.lines("A short note in plain words: what is ready, and what to look at.", 296, { font: "plex-400", size: 15 }, 3).forEach((line, li) => o.push(k.text(line, { x: 392, y: 220 + li * 22, size: 15, font: "plex-400", fill: C.soft })));
  o.push(`<g class="hq-mock-pulse">${k.button(392, 306, 296, "Approve", "primary")}</g>`);
  o.push(k.button(392, 350, 296, "Ask for a change"));
  o.push(k.button(392, 394 - 4, 140, "Remove").replace("</g>", "</g>"));
  o.push(`</svg>`);
  return o.join("");
}

/** Folder tree with typed files. */
export function foldersMockup({ mode = "live", id = "hq-folders" } = {}) {
  const k = kit(mode);
  const o = [svgOpen(W, H, { title: "Illustrative folder view with sample files", desc: "A folder tree for Sample Co. with Blog, Social and Brand folders. Files show a type badge such as Image PNG, Doc MD and PDF, and pictures show a small thumbnail.", id, mode })];
  o.push(k.windowFrame(W, H, "Sample Co. · Files"));
  const row = (y, indent, label, count, kind) => {
    const x = 28 + indent * 26;
    const folder = `<path d="M${x} ${y - 11}h9l3 3h12v15h-24z" fill="rgba(245,196,107,0.18)" stroke="rgba(245,196,107,0.55)"/>`;
    return folder + k.text(label, { x: x + 38, y: y + 4, size: 16, font: "inter-600", fill: C.ink }) + (count ? k.text(count, { x: 380, y, size: 13, font: "plex-400", fill: C.soft, anchor: "end" }) : "");
  };
  o.push(row(84, 0, "Blog", "2 files", "folder"));
  o.push(row(118, 0, "Social", "3 files", "folder"));
  o.push(row(152, 1, "LinkedIn", "2 files", "folder"));
  o.push(row(186, 0, "Brand", "1 file", "folder"));
  o.push(`<path d="M404 56V424" stroke="rgba(245,240,232,0.1)"/>`);
  o.push(k.text("Social / LinkedIn", { x: 430, y: 82, size: 15, font: "inter-600", fill: C.ink }));
  const files = [
    { name: "sample-post-1.png", badge: "Image · PNG", tone: "cyan", thumb: true },
    { name: "sample-post-1.md", badge: "Doc · MD", tone: "muted" },
    { name: "sample-guide.pdf", badge: "PDF", tone: "accent" },
    { name: "sample-data.csv", badge: "Spreadsheet · CSV", tone: "green" },
  ];
  files.forEach((f, i) => {
    const y = 104 + i * 74;
    o.push(k.panel(430, y, 262, 60, { fill: C.panel }));
    o.push(`<rect x="442" y="${y + 10}" width="40" height="40" rx="5" fill="${f.thumb ? "rgba(141,235,242,0.14)" : "rgba(245,240,232,0.05)"}" stroke="${f.thumb ? "rgba(141,235,242,0.4)" : "rgba(245,240,232,0.14)"}"/>`);
    if (f.thumb) o.push(`<path d="M446 ${y + 44} L458 ${y + 32} L466 ${y + 40} L474 ${y + 30} L478 ${y + 44}Z" fill="rgba(141,235,242,0.45)"/>`);
    o.push(k.text(f.name, { x: 494, y: y + 26, size: 14, font: "plex-500", fill: C.ink }));
    o.push(k.pill(494, y + 32, f.badge, f.tone, { size: 11, dot: false }).svg);
  });
  // Held note on the left.
  o.push(k.panel(24, 250, 360, 150, { fill: C.panel }));
  o.push(k.pill(40, 266, "Held for review", "amber", { size: 12 }).svg);
  k.lines("Held work stays out of your folders, previews, shared links and search until it is released.", 320, { font: "plex-400", size: 15 }, 4).forEach((line, li) => o.push(k.text(line, { x: 40, y: 322 + li * 22, size: 15, font: "plex-400", fill: C.soft })));
  o.push(`</svg>`);
  return o.join("");
}

/** Social calendar with the next open slot. */
export function socialMockup({ mode = "live", id = "hq-social" } = {}) {
  const k = kit(mode);
  const o = [svgOpen(W, H, { title: "Illustrative social calendar with sample posts", desc: "A week calendar for Sample Co. Monday to Friday. Two sample posts are scheduled, one slot is marked as the next open slot, and a list on the right shows the social networks that can be connected.", id, mode })];
  o.push(k.windowFrame(W, H, "Sample Co. · Social"));
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const gx = 24;
  const gw = 96;
  const gy = 64;
  days.forEach((d, i) => {
    const x = gx + i * (gw + 6);
    o.push(k.panel(x, gy, gw, 250, { fill: C.panel }));
    o.push(k.text(d, { x: x + 12, y: gy + 24, size: 14, font: "plex-500", fill: C.soft }));
    o.push(k.text("9:00 AM", { x: x + 12, y: gy + 46, size: 12, font: "plex-400", fill: C.soft }));
  });
  const post = (i, label, status, tone) => {
    const x = gx + i * (gw + 6) + 8;
    return k.panel(x, gy + 60, gw - 16, 92, { fill: C.panel2, stroke: TONES[tone].stroke, r: 6 })
      + k.text(label, { x: x + 10, y: gy + 86, size: 13, font: "inter-600", fill: C.ink })
      + k.text("Draft v1", { x: x + 10, y: gy + 104, size: 12, font: "plex-400", fill: C.soft })
      + k.pill(x + 8, gy + 114, status, tone, { size: 10, dot: false }).svg;
  };
  o.push(post(0, "Sample post", "Scheduled", "green"));
  o.push(post(1, "Sample post", "Scheduled", "green"));
  const nx = gx + 2 * (gw + 6) + 8;
  o.push(`<rect class="hq-mock-slot" x="${nx}" y="${gy + 60}" width="${gw - 16}" height="92" rx="6" fill="rgba(255,75,36,0.07)" stroke="${C.accent}" stroke-dasharray="5 5"/>`);
  o.push(k.text("Next open", { x: nx + 10, y: gy + 100, size: 13, font: "inter-600", fill: C.accentText }));
  o.push(k.text("slot", { x: nx + 10, y: gy + 118, size: 13, font: "inter-600", fill: C.accentText }));
  // Approval line.
  o.push(k.panel(24, 332, 396, 86, { fill: C.panel }));
  o.push(k.pill(40, 346, "Approved by you", "green", { size: 12 }).svg);
  k.lines("Once a piece is approved and your accounts are connected, it is scheduled into your next open slot.", 360, { font: "plex-400", size: 14 }, 3).forEach((line, li) => o.push(k.text(line, { x: 40, y: 394 + li * 0 + li * 20 - 0, size: 14, font: "plex-400", fill: C.soft })));
  // Networks.
    o.push(k.panel(548, gy, 148, 354, { fill: C.panel }));
  o.push(k.text("Networks", { x: 562, y: gy + 24, size: 13, font: "plex-500", fill: C.cyan }));
  NETWORKS.forEach((n, i) => o.push(k.text(n === "Google Business" ? "Google Business" : n, { x: 562, y: gy + 52 + i * 31, size: 13.5, font: "plex-400", fill: C.ink })));
  o.push(`</svg>`);
  return o.join("");
}

/** A card with attached skill packs and the skills the agent cites. */
export function workersMockup({ mode = "live", id = "hq-workers" } = {}) {
  const k = kit(mode);
  const o = [svgOpen(W, H, { title: "Illustrative card with skill packs and skills used", desc: "A sample card with three skill packs attached, and a Skills used list where each skill is marked Helped or Did not help, with a short note.", id, mode })];
  o.push(k.windowFrame(W, H, "Sample Co. · Card"));
  o.push(k.text("Sample page, Draft v1", { x: 28, y: 90, size: 24, font: "inter-600", fill: C.ink }));
  o.push(k.pill(28, 104, "Agent working", "cyan", { size: 12 }).svg);
  o.push(k.text("SKILL PACKS ATTACHED", { x: 28, y: 166, size: 11.5, font: "plex-500", fill: C.cyan, tracking: 0.12 }));
  let cx = 28;
  ["Copywriting", "Page layout", "Structured data"].forEach((label) => {
    const p = k.pill(cx, 180, label, "muted", { size: 13, dot: false });
    o.push(p.svg);
    cx += p.w + 10;
  });
  o.push(k.text("SKILLS USED, WHEN THE WORK IS FILED", { x: 28, y: 248, size: 11.5, font: "plex-500", fill: C.cyan, tracking: 0.12 }));
  const rows = [
    ["Copywriting", "Helped", "green", "Gave a clear first draft."],
    ["Page layout", "Helped", "green", "Kept sections in a clear order."],
    ["Sample checkout skill", "Did not help", "amber", "Built for a shop, not a service page."],
  ];
  rows.forEach(([name, verdict, tone, note], i) => {
    const y = 262 + i * 52;
    o.push(k.panel(28, y, 664, 42, { fill: C.panel }));
    o.push(k.text(name, { x: 44, y: y + 26, size: 15, font: "inter-600", fill: C.ink }));
    o.push(k.pill(232, y + 8, verdict, tone, { size: 12 }).svg);
    o.push(k.text(note, { x: 372, y: y + 26, size: 14, font: "plex-400", fill: C.soft }));
  });
  o.push(k.text("The agent searches the skill library for each card, loads what fits and reports what helped.", { x: 28, y: 430, size: 13, font: "plex-400", fill: C.soft }));
  o.push(`</svg>`);
  return o.join("");
}

export const MOCKUPS = {
  board: { fn: boardMockup, alt: "Illustrative HQ board with sample cards in four columns" },
  review: { fn: reviewMockup, alt: "Illustrative review screen with Approve, Ask for a change and Remove" },
  folders: { fn: foldersMockup, alt: "Illustrative folder view with typed sample files" },
  social: { fn: socialMockup, alt: "Illustrative social calendar with a next open slot" },
  workers: { fn: workersMockup, alt: "Illustrative card with skill packs and skills used" },
};

export function figure(name, { mode = "live", id, caption = CAPTION, className = "" } = {}) {
  const m = MOCKUPS[name];
  return `<figure class="hq-shot${className ? ` ${className}` : ""}">${m.fn({ mode, id: id || `hq-${name}` })}<figcaption>${esc(caption)}</figcaption></figure>`;
}
