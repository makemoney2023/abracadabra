/**
 * Shared pieces for the 1200x630 social cards.
 * Every word on a card is drawn as Inter Tight / IBM Plex Sans outlines from
 * scripts/fonts, so the cards never depend on a font installed on the build
 * machine. The wordmark matches the hero: lowercase "abracadabra", Inter Tight
 * 600, -0.05em tracking, ink #F5F0E8, then a round #FF4B24 dot.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";
import sharp from "sharp";

const fontDir = fileURLToPath(new URL("./fonts/", import.meta.url));
const load = (file) => opentype.parse(readFileSync(fontDir + file).buffer);
const FONTS = {
  "inter-500": load("InterTight-Medium.ttf"),
  "inter-600": load("InterTight-SemiBold.ttf"),
  "inter-700": load("InterTight-Bold.ttf"),
  "plex-400": load("IBMPlexSans-Regular.ttf"),
  "plex-500": load("IBMPlexSans-Medium.ttf"),
};

export const OG = { width: 1200, height: 630, canvas: "#070706", ink: "#F5F0E8", inkSoft: "#AAA49A", accent: "#FF4B24", cyan: "#8DEBF2" };

function kerning(font, left, right) {
  try {
    const tables = font.position.getKerningTables("latn");
    return font.position.getKerningValue(tables, left.index, right.index) || 0;
  } catch {
    return 0;
  }
}

// Lays text out glyph by glyph (cmap + GPOS pair kerning). opentype.js's own
// shaper rejects a GSUB lookup in Inter Tight, so it is not used.
function layout(text, { font = "inter-600", size, tracking = 0 }) {
  const face = FONTS[font];
  if (!face) throw new Error(`unknown OG font ${font}`);
  const scale = size / face.unitsPerEm;
  const glyphs = [...text].map((char) => face.charToGlyph(char));
  let cursor = 0;
  const placed = glyphs.map((glyph, index) => {
    const at = cursor;
    cursor += glyph.advanceWidth * scale + tracking * size;
    if (glyphs[index + 1]) cursor += kerning(face, glyph, glyphs[index + 1]) * scale;
    return { glyph, at };
  });
  return { face, placed, width: cursor, scale };
}

export function measure(text, options) {
  return layout(text, options).width;
}

/** One line of outlined text. Returns { svg, width }. `anchor: "end"` right-aligns at x. */
export function textPath(text, { x, y, size, font = "inter-600", tracking = 0, fill = OG.ink, anchor = "start", opacity }) {
  const { placed, width } = layout(text, { font, size, tracking });
  const left = anchor === "end" ? x - width : x;
  const d = placed.map(({ glyph, at }) => glyph.getPath(left + at, y, size).toPathData(2)).join("");
  const alpha = opacity === undefined ? "" : ` fill-opacity="${opacity}"`;
  return { svg: `<path fill="${fill}"${alpha} d="${d}"/>`, width };
}

/** Word-wraps by measured width, at most `maxLines` lines. */
export function wrapToWidth(text, maxWidth, options, maxLines = 4) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next, options) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/**
 * The "abracadabra." wordmark with its baseline at y. The dot is a true circle
 * sized and placed from Inter Tight's own period glyph. Returns { svg, width, height }.
 */
export function wordmark({ x, y, size, ink = OG.ink, dot = OG.accent }) {
  const tracking = -0.05;
  const word = textPath("abracadabra", { x, y, size, font: "inter-600", tracking, fill: ink });
  const face = FONTS["inter-600"];
  const scale = size / face.unitsPerEm;
  const period = face.charToGlyph(".").getBoundingBox();
  const r = (((period.x2 - period.x1) + (period.y2 - period.y1)) / 4) * scale;
  const cx = x + word.width + ((period.x1 + period.x2) / 2) * scale;
  const cy = y - ((period.y1 + period.y2) / 2) * scale;
  const width = word.width + (period.x2 * scale);
  const ascent = face.charToGlyph("b").getBoundingBox().y2 * scale;
  return { svg: `<g>${word.svg}<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="${dot}"/></g>`, width, height: ascent };
}

export const BAND = { height: 84, fill: "#0B0B0B" };

/** The bottom strip for photo cards: solid #0B0B0B, wordmark left, address right. */
export function brandBandSvg() {
  const top = OG.height - BAND.height;
  const size = 40;
  const probe = wordmark({ x: 0, y: 0, size });
  const baseline = top + (BAND.height + probe.height) / 2;
  const mark = wordmark({ x: 56, y: baseline, size });
  const url = textPath("abra-ca-dabra.app", { x: OG.width - 56, y: baseline - 2, size: 22, font: "plex-400", fill: OG.inkSoft, anchor: "end" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${BAND.height}" viewBox="0 ${top} ${OG.width} ${BAND.height}">
  <rect x="0" y="${top}" width="${OG.width}" height="${BAND.height}" fill="${BAND.fill}"/>
  <rect x="0" y="${top}" width="${OG.width}" height="1" fill="${OG.ink}" fill-opacity="0.1"/>
  ${mark.svg}
  ${url.svg}
</svg>`;
}

/**
 * A photo card: the photo is cropped into the area above the band (never under
 * it), then the solid band with the wordmark is added along the bottom edge.
 */
export async function brandedPhotoCard(source, { position = "centre" } = {}) {
  const photo = await sharp(source)
    .resize(OG.width, OG.height - BAND.height, { fit: "cover", position })
    .toBuffer();
  const band = await sharp(Buffer.from(brandBandSvg())).png().toBuffer();
  return sharp({ create: { width: OG.width, height: OG.height, channels: 3, background: BAND.fill } })
    .composite([{ input: photo, left: 0, top: 0 }, { input: band, left: 0, top: OG.height - BAND.height }]);
}

/** A plain dark card: orange label, title lines, wordmark bottom-left. */
export function plateSvg({ label, title, titleSize = 56, maxLines = 4 }) {
  const titleOptions = { font: "inter-600", size: titleSize, tracking: -0.02 };
  const lines = wrapToWidth(title, OG.width - 144, titleOptions, maxLines);
  const lineHeight = titleSize * 1.14;
  const titleSvg = lines.map((line, index) => textPath(line, { x: 72, y: 228 + index * lineHeight, ...titleOptions }).svg).join("");
  const labelSvg = label ? textPath(String(label).toUpperCase(), { x: 72, y: 150, size: 24, font: "plex-500", tracking: 0.08, fill: OG.accent }).svg : "";
  const mark = wordmark({ x: 72, y: 558, size: 48 });
  const url = textPath("abra-ca-dabra.app", { x: OG.width - 72, y: 556, size: 24, font: "plex-400", fill: OG.inkSoft, anchor: "end" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}">
  <rect width="${OG.width}" height="${OG.height}" fill="${OG.canvas}"/>
  ${labelSvg}
  ${titleSvg}
  ${mark.svg}
  ${url.svg}
</svg>`;
}

/** The homepage card: the wordmark large, then the hero headline. */
export function homeCardSvg() {
  const mark = wordmark({ x: 72, y: 214, size: 132 });
  const head = { font: "inter-600", size: 66, tracking: -0.02 };
  const line1 = textPath("Let us bring your", { x: 72, y: 352, ...head });
  const line2 = textPath("ideas to life.", { x: 72, y: 428, ...head });
  const kicker = textPath("CUSTOM SOFTWARE AND AI TOOLS", { x: 72, y: 552, size: 26, font: "plex-500", tracking: 0.08, fill: OG.accent });
  const url = textPath("abra-ca-dabra.app", { x: OG.width - 72, y: 552, size: 26, font: "plex-400", fill: OG.inkSoft, anchor: "end" });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG.width}" height="${OG.height}" viewBox="0 0 ${OG.width} ${OG.height}">
  <defs>
    <radialGradient id="glow" cx="0.82" cy="0.18" r="0.7">
      <stop offset="0" stop-color="${OG.accent}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${OG.accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${OG.width}" height="${OG.height}" fill="${OG.canvas}"/>
  <rect width="${OG.width}" height="${OG.height}" fill="url(#glow)"/>
  ${mark.svg}
  ${line1.svg}
  ${line2.svg}
  ${kicker.svg}
  ${url.svg}
</svg>`;
}
