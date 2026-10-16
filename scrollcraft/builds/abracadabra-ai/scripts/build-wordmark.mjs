/**
 * Outlined "Abra-ca-dabra" wordmark.
 * Tektur 700 (the site's display face, SIL OFL; static instance in
 * scripts/fonts) converted to outlines, with four-point stars replacing both
 * hyphens. Run from this folder: node scripts/build-wordmark.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/wordmark');
const fontPath = join(root, 'scripts/fonts/Tektur-Bold.ttf');
const fontSize = 240;
const ink = '#F5F1E8';
const accent = '#FF4B24';
const canvas = '#070706';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function commandsToPath(commands, rng, amp, bounds) {
  let d = '';
  for (const cmd of commands) {
    const jitter = (value) => {
      if (typeof value !== 'number') return value;
      const next = value + (rng() - 0.5) * 2 * amp;
      return next;
    };
    const note = (x, y) => {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    };
    if (cmd.type === 'M') {
      const x = jitter(cmd.x);
      const y = jitter(cmd.y);
      note(x, y);
      d += `M${x.toFixed(2)} ${y.toFixed(2)}`;
    } else if (cmd.type === 'L') {
      const x = jitter(cmd.x);
      const y = jitter(cmd.y);
      note(x, y);
      d += `L${x.toFixed(2)} ${y.toFixed(2)}`;
    } else if (cmd.type === 'C') {
      const x1 = jitter(cmd.x1);
      const y1 = jitter(cmd.y1);
      const x2 = jitter(cmd.x2);
      const y2 = jitter(cmd.y2);
      const x = jitter(cmd.x);
      const y = jitter(cmd.y);
      note(x1, y1);
      note(x2, y2);
      note(x, y);
      d += `C${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
    } else if (cmd.type === 'Q') {
      const x1 = jitter(cmd.x1);
      const y1 = jitter(cmd.y1);
      const x = jitter(cmd.x);
      const y = jitter(cmd.y);
      note(x1, y1);
      note(x, y);
      d += `Q${x1.toFixed(2)} ${y1.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)}`;
    } else if (cmd.type === 'Z') {
      d += 'Z';
    }
  }
  return d;
}

function starPath(cx, cy, radius, bounds) {
  const inner = radius * 0.42;
  let d = '';
  for (let i = 0; i < 8; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 4;
    const arm = i % 2 === 0 ? radius : inner;
    const x = cx + Math.cos(angle) * arm;
    const y = cy + Math.sin(angle) * arm;
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

function buildSvg({ letterFill, starFill, letters, stars, bounds }) {
  const pad = fontSize * 0.08;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const letterPaths = letters.map((d) => `<path fill="${letterFill}" d="${d}"/>`).join('');
  const starPaths = stars.map((d) => `<path data-accent="star" fill="${starFill}" d="${d}"/>`).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" role="img">
<title>Abra-ca-dabra</title>
${letterPaths}
${starPaths}
</svg>
`;
  return { svg, width, height };
}

const font = opentype.parse(readFileSync(fontPath).buffer);
const rng = mulberry32(0xab7aca);
const amp = 0;
const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
const baseline = fontSize * 0.82;
const scale = fontSize / font.unitsPerEm;
const xHeight = (font.tables.os2.sxHeight || font.unitsPerEm * 0.48) * scale;
const starRadius = fontSize * 0.125;
const slot = starRadius * 2.35;
let cursor = 0;
const letters = [];
const stars = [];

function addWord(text) {
  const wobble = (rng() - 0.5) * amp;
  const path = font.getPath(text, cursor, baseline + wobble, fontSize);
  letters.push(commandsToPath(path.commands, rng, amp, bounds));
  cursor += font.getAdvanceWidth(text, fontSize);
}

addWord('Abra');
cursor += slot * 0.15;
stars.push(starPath(cursor + starRadius, baseline - xHeight * 0.52, starRadius, bounds));
cursor += starRadius * 2 + slot * 0.15;
addWord('ca');
cursor += slot * 0.15;
stars.push(starPath(cursor + starRadius, baseline - xHeight * 0.52, starRadius, bounds));
cursor += starRadius * 2 + slot * 0.15;
addWord('dabra');

const variants = [
  ['abra-ca-dabra.svg', ink, ink],
  ['abra-ca-dabra-accent.svg', ink, accent],
  ['abra-ca-dabra-light.svg', canvas, canvas],
  ['abra-ca-dabra-light-accent.svg', canvas, accent],
];

await mkdir(outDir, { recursive: true });
const masters = {};
for (const [name, letterFill, starFill] of variants) {
  masters[name] = buildSvg({ letterFill, starFill, letters, stars, bounds });
  await writeFile(join(outDir, name), masters[name].svg);
}

const plates = [
  ['abra-ca-dabra.svg', canvas, 'dark-ink'],
  ['abra-ca-dabra-accent.svg', canvas, 'dark-accent'],
  ['abra-ca-dabra-light.svg', ink, 'light-ink'],
  ['abra-ca-dabra-light-accent.svg', ink, 'light-accent'],
];

for (const [name, background, label] of plates) {
  const { svg, width, height } = masters[name];
  for (const target of [512, 2048]) {
    const pngHeight = Math.max(1, Math.round(target * (height / width)));
    await sharp(Buffer.from(svg), { density: 432 })
      .resize(target, pngHeight, { fit: 'fill' })
      .flatten({ background })
      .png()
      .toFile(join(outDir, `abra-ca-dabra-${label}-${target}.png`));
  }
}

const orb = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img">
<title>Orb</title>
<g fill="none" stroke="#8DEBF2" stroke-width="1.35">
<circle cx="320" cy="286" r="168"/>
<ellipse cx="320" cy="286" rx="168" ry="22"/>
<ellipse cx="320" cy="286" rx="168" ry="58"/>
<ellipse cx="320" cy="286" rx="168" ry="104"/>
<ellipse cx="320" cy="286" rx="168" ry="146"/>
<ellipse cx="320" cy="286" rx="22" ry="168"/>
<ellipse cx="320" cy="286" rx="58" ry="168"/>
<ellipse cx="320" cy="286" rx="104" ry="168"/>
<ellipse cx="320" cy="286" rx="146" ry="168"/>
</g>
<ellipse cx="320" cy="498" rx="214" ry="18" fill="#8DEBF2" opacity="0.28"/>
<ellipse cx="320" cy="508" rx="120" ry="7" fill="#8DEBF2" opacity="0.16"/>
</svg>
`;
await writeFile(join(outDir, 'orb-still.svg'), orb);

const accentSvg = masters['abra-ca-dabra-accent.svg'].svg;
const rasterWidth = 960;
const { data, info } = await sharp(Buffer.from(accentSvg), { density: 288 })
  .resize({ width: rasterWidth })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const letterPixels = [];
const starPixels = [];
for (let y = 0; y < info.height; y += 1) {
  for (let x = 0; x < info.width; x += 1) {
    const index = (y * info.width + x) * info.channels;
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const alpha = data[index + 3];
    if (alpha < 90) continue;
    if (red > 180 && green < 130 && blue < 100) starPixels.push([x, y]);
    else if (red > 170 && green > 155 && blue > 140) letterPixels.push([x, y]);
  }
}

function take(list, max) {
  if (list.length <= max) return list;
  const chosen = [];
  for (let i = 0; i < max; i += 1) {
    chosen.push(list[Math.floor((i * list.length) / max)]);
  }
  return chosen;
}

const chosen = [
  ...take(letterPixels, 4600).map(([x, y]) => [x, y, 0]),
  ...take(starPixels, 640).map(([x, y]) => [x, y, 1]),
];
let minX = Infinity;
let minY = Infinity;
let maxX = -Infinity;
let maxY = -Infinity;
for (const [x, y] of chosen) {
  minX = Math.min(minX, x);
  minY = Math.min(minY, y);
  maxX = Math.max(maxX, x);
  maxY = Math.max(maxY, y);
}
const span = Math.max(1, maxX - minX);
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
const points = chosen.map(([x, y, accentFlag]) => [
  Number(((x - centerX) / span).toFixed(4)),
  Number((-(y - centerY) / span).toFixed(4)),
  accentFlag,
]);
await writeFile(join(outDir, 'abra-ca-dabra-samples.json'), JSON.stringify({ points }));
console.log('wordmark written', Object.keys(masters).join(', '), 'samples', points.length, 'stars', starPixels.length);
