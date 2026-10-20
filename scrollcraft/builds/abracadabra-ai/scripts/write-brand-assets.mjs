import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { homeCardSvg } from "./og-brand.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<style>
  .bg { fill: #070706; }
  .ink { fill: #F5F0E8; }
  .dot { fill: #FF4B24; }
  @media (prefers-color-scheme: light) {
    .bg { fill: #F5F0E8; }
    .ink { fill: #170804; }
  }
</style>
<rect class="bg" width="64" height="64"/>
<text class="ink" x="10" y="44" font-family="Inter Tight, sans-serif" font-size="36" font-weight="700">a</text>
<circle class="dot" cx="48" cy="40" r="5"/>
</svg>`;

async function png(svg, size, file, { flatten = false } = {}) {
  let image = sharp(Buffer.from(svg)).resize(size, size);
  if (flatten) image = image.flatten({ background: "#070706" });
  await image.png().toFile(file);
}

async function icons() {
  const dir = join(root, "assets/icons");
  await mkdir(dir, { recursive: true });
  await sharp(Buffer.from(mark)).toFile(join(dir, "favicon.svg"));
  const flat = mark.replace("<style>", "<style>").replace("prefers-color-scheme: light", "prefers-color-scheme: _unused");
  await png(flat, 32, join(dir, "favicon-32.png"), { flatten: true });
  await png(flat, 180, join(dir, "apple-touch-icon.png"), { flatten: true });
  await png(flat, 192, join(dir, "icon-192.png"), { flatten: true });
  await png(flat, 512, join(dir, "icon-512.png"), { flatten: true });
  const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#070706"/><text x="96" y="310" fill="#F5F0E8" font-family="sans-serif" font-size="220" font-weight="700">a</text><circle cx="390" cy="286" r="28" fill="#FF4B24"/></svg>`;
  await sharp(Buffer.from(maskable)).png().toFile(join(dir, "icon-maskable-512.png"));
}

async function grain() {
  const size = 128;
  const raw = Buffer.alloc(size * size);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 47 + (i % 13) * 17) & 255;
  await sharp(raw, { raw: { width: size, height: size, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(join(root, "assets/grain.png"));
}

async function homeCard() {
  const dest = join(root, "assets/og/home.jpg");
  await mkdir(dirname(dest), { recursive: true });
  await sharp(Buffer.from(homeCardSvg())).jpeg({ quality: 82, mozjpeg: true }).toFile(dest);
}

async function courseHero() {
  const source = join(root, "assets/llmcourse-home.webp");
  const dest = join(root, "assets/course-hero-bg.webp");
  await sharp(source).resize(1280, 720, { fit: "cover" }).blur(18).webp({ quality: 70 }).toFile(dest);
}

async function mobileCrops() {
  const shots = [
    ["assets/pirx/pirx-home-hero-desktop.jpg", "assets/pirx/pirx-home-hero-mobile.webp"],
    ["assets/pirx/pirx-accuracy-full-desktop.jpg", "assets/pirx/pirx-accuracy-full-mobile.webp"],
  ];
  for (const [from, to] of shots) {
    await sharp(join(root, from))
      .resize(720, 1280, { fit: "cover", position: "centre" })
      .webp({ quality: 76 })
      .toFile(join(root, to));
  }
}

await icons();
await grain();
await homeCard();
await courseHero();
await mobileCrops();
console.log("brand assets written");
