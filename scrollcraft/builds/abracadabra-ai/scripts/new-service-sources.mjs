/**
 * One-off source images for /services/machine-learning/ and /services/mcp-connectors/.
 * Machine learning uses real pirx.ca screenshots (no made-up UI).
 * MCP uses plain diagrams drawn here, with every word as font outlines.
 * Run: node scripts/new-service-sources.mjs  (then npm run build writes the sizes and og.jpg)
 */
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import sharp from "sharp";
import { OG, textPath, measure } from "./og-brand.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const W = 1280;
const H = 720;
const pirx = (file) => join(root, "assets/pirx", file);
const out = (slug, role) => join(root, "content/service-images", slug, `${role}.jpg`);
const jpeg = (img) => img.jpeg({ quality: 88, mozjpeg: true });

async function machineLearning() {
  const heroSrc = pirx("pirx-home-hero-desktop.jpg");
  const raw = await sharp(heroSrc).extract({ left: 760, top: 262, width: 400, height: 520 }).resize({ height: 640 }).toBuffer();
  const meta = await sharp(raw).metadata();
  // Feather the crop edge so the screenshot's own background fades into the backdrop.
  const mask = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${meta.width}" height="${meta.height}"><rect x="24" y="24" width="${meta.width - 48}" height="${meta.height - 48}" rx="40" fill="#fff"/></svg>`)).blur(18).png().toBuffer();
  const phones = await sharp(raw).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const glow = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="0.72" cy="0.55" r="0.6"><stop offset="0" stop-color="#0B3A40"/><stop offset="0.55" stop-color="#03181B"/><stop offset="1" stop-color="#000"/></radialGradient></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`;
  const backdrop = await sharp(Buffer.from(glow)).png().toBuffer();
  await jpeg(sharp(backdrop).composite([{ input: phones, left: W - meta.width - 110, top: 40 }])).toFile(out("machine-learning", "hero"));
  await jpeg(sharp(pirx("pirx-race-predictor-full-desktop.jpg")).extract({ left: 0, top: 0, width: 1440, height: 810 }).resize(W, H)).toFile(out("machine-learning", "body1"));
  // Marathon predictor top: no driver labels on screen (the home page sample card uses older driver names).
  await jpeg(sharp(pirx("pirx-race-predictor-marathon-full-desktop.jpg")).extract({ left: 0, top: 0, width: 1440, height: 810 }).resize(W, H)).toFile(out("machine-learning", "body2"));
}

const ICONS = {
  plug: '<path d="M12 22v-5"/><path d="M15 8V2"/><path d="M17 8a1 1 0 0 1 1 1v4a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1z"/><path d="M9 8V2"/>',
  bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const icon = (name, x, y, size, color = OG.ink) =>
  `<g transform="translate(${x} ${y}) scale(${size / 24})" fill="none" stroke="${color}" stroke-width="${(1.8 * 24) / size * (size / 24)}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;

function label(text, x, y, size, opts = {}) {
  const centred = opts.centre ? x - measure(text, { font: opts.font || "inter-600", size }) / 2 : x;
  // opentype.js can print NaN for a curve at some x offsets; nudge until the path is clean.
  for (let nudge = 0; nudge < 2; nudge += 0.25) {
    const { svg } = textPath(text, { x: Math.round(centred) + nudge, y, size, font: opts.font || "inter-600", fill: opts.fill || OG.ink });
    if (!svg.includes("NaN")) return svg;
  }
  throw new Error(`could not draw ${text}`);
}

function node(text, cx, cy, w = 220, h = 64, { stroke = "#3A3631", fill = "#13110F", ink = OG.ink } = {}) {
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>${label(text, cx, cy + 9, 26, { centre: true, fill: ink })}`;
}

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${OG.canvas}"/>
<g stroke="#1A1815" stroke-width="1">${Array.from({ length: 21 }, (_, i) => `<path d="M${i * 64} 0V${H}"/>`).join("")}${Array.from({ length: 12 }, (_, i) => `<path d="M0 ${i * 64}H${W}"/>`).join("")}</g>
${inner}</svg>`;

const curve = (x1, y1, x2, y2, color = OG.cyan) => {
  const mx = (x1 + x2) / 2;
  return `<path d="M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}" fill="none" stroke="${color}" stroke-opacity="0.55" stroke-width="2.5"/>`;
};

function connectorBox(cx, cy, title, sub) {
  const w = 340;
  const h = 250;
  return `<rect x="${cx - w / 2}" y="${cy - h / 2}" width="${w}" height="${h}" rx="28" fill="#17130F" stroke="${OG.accent}" stroke-width="3"/>
${icon("plug", cx - 32, cy - 100, 64, OG.accent)}
${label(title, cx, cy + 22, 34, { centre: true })}
${sub.map((line, i) => label(line, cx, cy + 62 + i * 30, 22, { centre: true, font: "plex-400", fill: OG.inkSoft })).join("")}`;
}

function mcpHero() {
  const left = ["Claude", "ChatGPT", "Copilot"].map((t, i) => [t, 210, 220 + i * 140]);
  const right = ["CRM", "Calendar", "Jobs", "Invoices"].map((t, i) => [t, 1070, 185 + i * 125]);
  const lines = [...left.map(([, x, y]) => curve(x + 110, y, 470, 360)), ...right.map(([, x, y]) => curve(810, 360, x - 110, y))].join("");
  return frame(`${lines}
${label("Your AI", 210, 150, 22, { centre: true, font: "plex-500", fill: OG.inkSoft })}
${label("Your tools", 1070, 128, 22, { centre: true, font: "plex-500", fill: OG.inkSoft })}
${left.map(([t, x, y]) => node(t, x, y)).join("")}
${right.map(([t, x, y]) => node(t, x, y)).join("")}
${connectorBox(640, 360, "Your connector", ["Sign-in · Permissions", "A yes before any change"])}`);
}

function bubble(lines, x, y, w, { accent = false } = {}) {
  const h = 44 + lines.length * 36;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${accent ? "#1B1712" : "#13110F"}" stroke="${accent ? OG.accent : "#3A3631"}" stroke-width="2"/>${lines.map((line, i) => label(line, x + 28, y + 52 + i * 36, 26)).join("")}`;
}

function mcpAsk() {
  return frame(`${label("Ask your business", 96, 110, 40)}
${label("Read-only. It can look, it can't change anything.", 96, 156, 24, { font: "plex-400", fill: OG.inkSoft })}
${bubble(["\u201cWhat\u2019s booked", "for Friday?\u201d"], 96, 270, 300)}
${curve(396, 330, 520, 330)}
${connectorBox(660, 330, "Connector", ["Reads only"])}
${curve(830, 330, 940, 330)}
${node("Calendar", 1060, 330, 220, 64)}
${curve(1060, 362, 640, 560, OG.accent)}
${bubble(["Here\u2019s Friday\u2019s schedule."], 330, 540, 470, { accent: true })}`);
}

function step(n, title, sub, cx, cy, active) {
  const color = active ? OG.accent : "#3A3631";
  return `<rect x="${cx - 160}" y="${cy - 110}" width="320" height="220" rx="26" fill="#13110F" stroke="${color}" stroke-width="${active ? 3 : 2}"/>
${label(n, cx, cy - 46, 26, { centre: true, font: "plex-500", fill: active ? OG.accent : OG.inkSoft })}
${label(title, cx, cy + 6, 30, { centre: true })}
${label(sub, cx, cy + 50, 22, { centre: true, font: "plex-400", fill: OG.inkSoft })}`;
}

function mcpApprove() {
  return frame(`${label("A yes before any change", 96, 110, 40)}
${label("Every step is logged: who asked, what changed, and when.", 96, 156, 24, { font: "plex-400", fill: OG.inkSoft })}
${step("01", "The AI suggests", "Log the call", 260, 370, false)}
${curve(420, 370, 480, 370)}
${step("02", "You say yes", "Or say no", 640, 370, true)}
${icon("check", 616, 450, 48, OG.accent)}
${curve(800, 370, 860, 370)}
${step("03", "The tool saves it", "Follow-up on Thursday", 1020, 370, false)}
<path d="M100 600H1180" stroke="#3A3631" stroke-width="2" stroke-dasharray="6 10"/>
${icon("lock", 100, 622, 32, OG.cyan)}
${label("Activity record", 146, 648, 24, { font: "plex-500", fill: OG.inkSoft })}`);
}

async function mcp() {
  for (const [role, svg] of [["hero", mcpHero()], ["body1", mcpAsk()], ["body2", mcpApprove()]]) {
    await jpeg(sharp(Buffer.from(svg))).toFile(out("mcp-connectors", role));
  }
}

await machineLearning();
await mcp();
console.log("wrote machine-learning and mcp-connectors sources");
