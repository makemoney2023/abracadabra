/**
 * Representative diagrams for blog notes, drawn as SVG.
 * Every word is an Inter Tight / IBM Plex Sans outline (scripts/og-brand.mjs), so the
 * diagrams look the same with or without the site fonts. Colours follow the site tokens:
 * canvas #0B0B0A, panels #161615, ink #F5F0E8, accent #FF4B24, cyan #8DEBF2, green #C6FFB3.
 * A note lists its diagrams in front matter (`diagrams:`) and places each one with
 * <!--diagram:N--> in the body. The build writes /blog/media/<slug>/<name>.svg.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { measure, textPath } from "./og-brand.mjs";

export const DIAGRAM = { width: 1280, height: 720 };

const C = {
  canvas: "#0B0B0A",
  panel: "#161615",
  ink: "#F5F0E8",
  soft: "#AAA49A",
  faint: "#6F6A62",
  accent: "#FF4B24",
  cyan: "#8DEBF2",
  green: "#C6FFB3",
  amber: "#F5C46B",
};

const TONES = {
  cyan: { text: C.cyan, fill: "rgba(141,235,242,0.08)", stroke: "rgba(141,235,242,0.38)" },
  accent: { text: "#FF8A6B", fill: "rgba(255,75,36,0.10)", stroke: "rgba(255,75,36,0.45)" },
  green: { text: C.green, fill: "rgba(198,255,179,0.08)", stroke: "rgba(198,255,179,0.38)" },
  amber: { text: C.amber, fill: "rgba(245,196,107,0.08)", stroke: "rgba(245,196,107,0.40)" },
  muted: { text: C.soft, fill: "rgba(245,240,232,0.04)", stroke: "rgba(245,240,232,0.16)" },
};

function text(value, opts) {
  return textPath(value, opts).svg;
}

function pill(x, y, label, tone = "cyan", { backed = false } = {}) {
  const t = TONES[tone];
  const size = 14;
  const w = Math.ceil(measure(label, { font: "plex-500", size })) + 28;
  const h = 28;
  return {
    w,
    svg: (backed ? `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${C.canvas}"/>` : "")
      + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${t.fill}" stroke="${t.stroke}" stroke-width="1"/>`
      + `<circle cx="${x + 12}" cy="${y + 14}" r="3" fill="${t.text}"/>`
      + text(label, { x: x + 20, y: y + 19, size, font: "plex-500", fill: t.text }),
  };
}

function panel(x, y, w, h, highlight = false) {
  const stroke = highlight ? "rgba(255,75,36,0.55)" : "rgba(245,240,232,0.14)";
  return `<g filter="url(#shadow)"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${C.panel}" stroke="${stroke}" stroke-width="1"/></g>`;
}

function windowDots(x, y) {
  return ["#FF5F57", "#FEBC2E", "#28C840"].map((fill, i) => `<circle cx="${x + i * 14}" cy="${y}" r="4" fill="${fill}" fill-opacity="0.85"/>`).join("");
}

/** A step card: number chip, title, up to two lines of detail, and a status pill. */
function stepNode({ x, y, w = 360, h = 206, step, title, lines = [], status, tone = "cyan", highlight = false }) {
  const parts = [panel(x, y, w, h, highlight)];
  parts.push(`<rect x="${x + 20}" y="${y + 20}" width="34" height="22" rx="6" fill="rgba(255,75,36,0.12)" stroke="rgba(255,75,36,0.5)" stroke-width="1"/>`);
  const stepW = measure(step, { font: "plex-500", size: 12 });
  parts.push(text(step, { x: x + 37 - stepW / 2, y: y + 35.5, size: 12, font: "plex-500", fill: "#FF8A6B" }));
  parts.push(text(title, { x: x + 20, y: y + 76, size: 25, font: "inter-600", fill: C.ink }));
  lines.forEach((line, i) => parts.push(text(line, { x: x + 20, y: y + 108 + i * 24, size: 17, font: "plex-400", fill: C.soft })));
  if (status) parts.push(pill(x + 20, y + h - 46, status, tone).svg);
  return parts.join("");
}

function dot(x, y, fill = C.cyan) {
  return `<circle cx="${x}" cy="${y}" r="4" fill="${fill}"/>`;
}

/** Thin connector through the given points with a dot at each end. */
function connector(points, { color = C.cyan, dashed = false, opacity = 0.9 } = {}) {
  const d = points.map(([px, py], i) => `${i ? "L" : "M"}${px} ${py}`).join(" ");
  const dash = dashed ? ` stroke-dasharray="5 6"` : "";
  const [sx, sy] = points[0];
  const [ex, ey] = points[points.length - 1];
  return `<path d="${d}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="1.5" stroke-linejoin="round"${dash}/>${dot(sx, sy, color)}${dot(ex, ey, color)}`;
}

function frame({ eyebrow, title, footnote, body }) {
  const { width, height } = DIAGRAM;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">
<defs>
<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#F5F0E8" stroke-opacity="0.035" stroke-width="1"/></pattern>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="0.55"/></filter>
</defs>
<rect width="${width}" height="${height}" fill="${C.canvas}"/>
<rect width="${width}" height="${height}" fill="url(#grid)"/>
${text(eyebrow, { x: 64, y: 70, size: 14, font: "plex-500", fill: C.cyan, tracking: 0.12 })}
${text(title, { x: 64, y: 108, size: 30, font: "inter-600", fill: C.ink, tracking: -0.01 })}
${body}
${text(footnote, { x: 64, y: height - 36, size: 15, font: "plex-400", fill: C.faint })}
</svg>
`;
}

function flowDiagram() {
  const w = 360;
  const h = 206;
  const xs = [64, 460, 856];
  const top = 140;
  const bottom = 440;
  const parts = [];
  // Row one, left to right.
  parts.push(stepNode({ x: xs[0], y: top, step: "01", title: "A request comes in", lines: ["An email to magic@abra-ca-dabra.app,", "or an ask for changes in your space."], status: "Logged in HQ", tone: "muted" }));
  parts.push(stepNode({ x: xs[1], y: top, step: "02", title: "It becomes a card", lines: ["A card on your project board,", "tied to the request it came from."], status: "To do", tone: "muted" }));
  parts.push(stepNode({ x: xs[2], y: top, step: "03", title: "Specialist agents build", lines: ["Grok Bot agents write, design and", "code the work, then file it."], status: "Doing", tone: "cyan", highlight: true }));
  // Row two, right to left.
  parts.push(stepNode({ x: xs[2], y: bottom, step: "04", title: "Client Services reviews", lines: ["Checked against the request.", "Send back, or pass it on."], status: "Waiting on Client Services", tone: "amber" }));
  parts.push(stepNode({ x: xs[1], y: bottom, step: "05", title: "Our team approves", lines: ["A person on our team signs off", "before anything is released."], status: "Approved", tone: "green" }));
  parts.push(stepNode({ x: xs[0], y: bottom, step: "06", title: "Delivered to your space", lines: ["Files appear in folders in your", "own HQ space, ready to open."], status: "Released", tone: "green" }));
  const midTop = top + h / 2;
  const midBottom = bottom + h / 2;
  parts.unshift(connector([[xs[0] + w, midTop], [xs[1], midTop]]));
  parts.unshift(connector([[xs[1] + w, midTop], [xs[2], midTop]]));
  parts.unshift(connector([[xs[2] + w - 60, top + h], [xs[2] + w - 60, bottom]]));
  parts.unshift(connector([[xs[2], midBottom], [xs[1] + w, midBottom]]));
  parts.unshift(connector([[xs[1], midBottom], [xs[0] + w, midBottom]]));
  // Send-back loop from review to the agents.
  parts.unshift(connector([[xs[2] + 60, bottom], [xs[2] + 60, top + h]], { color: C.accent, dashed: true }));
  parts.push(pill(xs[2] + 72, top + h + (bottom - top - h) / 2 - 13, "Send back with a note", "accent", { backed: true }).svg);
  return frame({
    eyebrow: "REPRESENTATIVE DIAGRAM",
    title: "How a request moves from an inbox to your HQ space",
    footnote: "Simplified for illustration. Step names follow the HQ board; no client data is shown.",
    body: parts.join("\n"),
  });
}

function rowList(x, y, rows, { icon = "lock", tone = "muted" } = {}) {
  const t = TONES[tone];
  return rows.map((row, i) => {
    const ry = y + i * 54;
    const glyph = icon === "lock"
      ? `<rect x="${x + 6}" y="${ry + 15}" width="14" height="11" rx="2" fill="none" stroke="${t.text}" stroke-width="1.5"/><path d="M${x + 9} ${ry + 15}v-3a4 4 0 0 1 8 0v3" fill="none" stroke="${t.text}" stroke-width="1.5"/>`
      : `<path d="M${x + 6} ${ry + 20}l5 5 9-11" fill="none" stroke="${t.text}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<rect x="${x}" y="${ry}" width="440" height="42" rx="6" fill="rgba(245,240,232,0.025)" stroke="rgba(245,240,232,0.08)"/>${glyph}`
      + text(row, { x: x + 34, y: ry + 27.5, size: 18, font: "plex-400", fill: C.ink });
  }).join("");
}

function visibilityDiagram() {
  const parts = [];
  const lx = 64;
  const rx = 736;
  const y = 200;
  const w = 480;
  const h = 390;
  parts.push(connector([[lx + w, y + h / 2], [rx, y + h / 2]]));
  parts.push(panel(lx, y, w, h));
  parts.push(windowDots(lx + 22, y + 22));
  parts.push(text("While the work is held", { x: lx + 20, y: y + 72, size: 22, font: "inter-600", fill: C.ink }));
  parts.push(pill(lx + 20, y + 90, "Held for Client Services review", "amber").svg);
  parts.push(rowList(lx + 20, y + 140, [
    "Files stay out of your folders",
    "No previews, downloads or links",
    "Not in search inside your space",
    "No email goes to you",
  ], { icon: "lock", tone: "amber" }));
  parts.push(panel(rx, y, w, h));
  parts.push(windowDots(rx + 22, y + 22));
  parts.push(text("After our team approves", { x: rx + 20, y: y + 72, size: 22, font: "inter-600", fill: C.ink }));
  parts.push(pill(rx + 20, y + 90, "Released to your space", "green").svg);
  parts.push(rowList(rx + 20, y + 140, [
    "Files appear in a named folder",
    "Each file shows its type",
    "Images get a thumbnail",
    "We send you a short update",
  ], { icon: "check", tone: "green" }));
  const gate = pill(0, 0, "Approve", "accent");
  parts.push(pill(640 - gate.w / 2, y + h / 2 - 13, "Approve", "accent", { backed: true }).svg);
  return frame({
    eyebrow: "REPRESENTATIVE DIAGRAM",
    title: "What you can see in your space, and when",
    footnote: "Simplified for illustration. Held work is visible to our team only.",
    body: parts.join("\n"),
  });
}

function boardDiagram() {
  const parts = [];
  const cols = [
    { title: "To do", note: ["The request, waiting", "to be picked up."], tone: "muted", status: "New card" },
    { title: "Doing", note: ["Agents build the work", "and file it to HQ."], tone: "cyan", status: "In progress" },
    { title: "Waiting on", title2: "Client Services", note: ["Review, then sign-off", "from our team."], tone: "amber", status: "In review" },
    { title: "Done", note: ["Released to the", "client's space."], tone: "green", status: "Approved" },
  ];
  const w = 260;
  const gap = 42;
  const x0 = 64;
  const y = 200;
  const h = 300;
  cols.forEach((col, i) => {
    const x = x0 + i * (w + gap);
    if (i < cols.length - 1) parts.push(connector([[x + w, y + 150], [x + w + gap, y + 150]]));
    parts.push(panel(x, y, w, h, i === 1));
    parts.push(text(col.title, { x: x + 20, y: y + 44, size: 22, font: "inter-600", fill: C.ink }));
    if (col.title2) parts.push(text(col.title2, { x: x + 20, y: y + 72, size: 22, font: "inter-600", fill: C.ink }));
    const cy = y + 100;
    parts.push(`<rect x="${x + 20}" y="${cy}" width="${w - 40}" height="120" rx="6" fill="rgba(245,240,232,0.03)" stroke="rgba(245,240,232,0.10)"/>`);
    parts.push(`<rect x="${x + 36}" y="${cy + 18}" width="${w - 110}" height="8" rx="4" fill="rgba(245,240,232,0.16)"/>`);
    col.note.forEach((line, j) => parts.push(text(line, { x: x + 36, y: cy + 56 + j * 24, size: 17, font: "plex-400", fill: C.soft })));
    parts.push(pill(x + 20, y + h - 52, col.status, col.tone).svg);
  });
  // Loops back into Doing.
  const doingX = x0 + (w + gap) + w / 2;
  const reviewX = x0 + 2 * (w + gap) + w / 2;
  const doneX = x0 + 3 * (w + gap) + w / 2;
  parts.push(connector([[reviewX, y + h], [reviewX, y + h + 50], [doingX + 30, y + h + 50], [doingX + 30, y + h]], { color: C.accent, dashed: true }));
  parts.push(pill(doingX + 70, y + h + 64, "Send back with a note", "accent", { backed: true }).svg);
  const todoX = x0 + w / 2;
  parts.push(connector([[doneX, y], [doneX, y - 40], [todoX, y - 40], [todoX, y]], { color: C.cyan, dashed: true }));
  const ask = pill(0, 0, "You ask for changes: a new card in To do", "cyan");
  parts.push(pill((todoX + doneX) / 2 - ask.w / 2, y - 53, "You ask for changes: a new card in To do", "cyan", { backed: true }).svg);
  return frame({
    eyebrow: "REPRESENTATIVE DIAGRAM",
    title: "The path a card takes on the HQ board",
    footnote: "Simplified for illustration. Column names match the HQ board.",
    body: parts.join("\n"),
  });
}

export const DIAGRAMS = {
  "how-client-work-flows-through-hq": {
    "flow.svg": flowDiagram,
    "visibility.svg": visibilityDiagram,
    "board.svg": boardDiagram,
  },
};

/** Writes every diagram a post lists. Returns the written paths (site-relative). */
export async function writeDiagrams(root, posts) {
  const written = [];
  for (const post of posts) {
    for (const diagram of post.diagrams ?? []) {
      const name = diagram.src.split("/").pop();
      const draw = DIAGRAMS[post.slug]?.[name];
      if (!draw) throw new Error(`${post.slug} lists diagram ${name}, but scripts/blog-diagrams.mjs has no drawing for it`);
      const dest = join(root, diagram.src.slice(1));
      await mkdir(dirname(dest), { recursive: true });
      await writeFile(dest, draw());
      written.push(diagram.src);
    }
  }
  return written;
}
