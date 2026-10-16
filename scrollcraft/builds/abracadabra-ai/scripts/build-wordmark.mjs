/**
 * Outlined "Abra-ca-dabra" wordmark.
 * The letterforms come from an AI-generated wordmark (Cloudflare Workers AI,
 * @cf/black-forest-labs/flux-2-dev, seed 11; source in scripts/wordmark-source),
 * traced to vector paths with vtracer. The two sparkle-star hyphens are kept as
 * separate accent paths. Run from this folder: node scripts/build-wordmark.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'assets/wordmark');
const ink = '#F5F1E8';
const accent = '#FF4B24';
const canvas = '#070706';

function buildSvg({ letterFill, starFill, letters, stars, bounds }) {
  const pad = 0;
  const minX = bounds.minX - pad;
  const minY = bounds.minY - pad;
  const width = bounds.maxX - bounds.minX + pad * 2;
  const height = bounds.maxY - bounds.minY + pad * 2;
  const letterPaths = letters.map((p) => `<path fill="${letterFill}" transform="${p.transform}" d="${p.d}"/>`).join('');
  const starPaths = stars.map((p) => `<path data-accent="star" fill="${starFill}" transform="${p.transform}" d="${p.d}"/>`).join('');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(2)} ${minY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}" role="img">
<title>Abra-ca-dabra</title>
${letterPaths}
${starPaths}
</svg>
`;
  return { svg, width, height };
}

const traced = JSON.parse(readFileSync(join(root, 'scripts/wordmark-source/abra-ca-dabra-ai-traced.json'), 'utf8'));
const toPath = ([d, tx, ty]) => ({ d, transform: `translate(${tx} ${ty})` });
const letters = traced.letters.map(toPath);
const stars = traced.stars.map(toPath);
const bounds = { minX: 0, minY: 0, maxX: traced.width, maxY: traced.height };

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
