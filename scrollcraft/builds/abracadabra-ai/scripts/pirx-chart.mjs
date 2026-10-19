/** Premium PiRX Search Console proof shots (blurred chart crops inside dark product frames). */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const WIDTHS = [640, 960, 1280, 1600];
const SOURCE = "Google Search Console, Jul 18 to Oct 17, 2026. AI-feature impressions are a separate report and are not added to the search total.";
const ASPECT = { w: 1600, h: 636 };
const PILL = "Google Search Console · 3 months";

const CHARTS = [
  {
    id: "performance",
    source: "gsc-performance-source.webp",
    stem: "gsc-performance",
    alt: "Google Search Console performance chart for pirx.ca: 1.94K clicks and 398K search impressions from Jul 18 to Oct 17, 2026. Account details and query tables are blurred.",
    label: "Search impressions",
    figure: "398K",
    sub: "1.94K clicks · avg position 7.6",
  },
  {
    id: "ai-features",
    source: "gsc-ai-features-source.webp",
    stem: "gsc-ai-features",
    alt: "Google Search Console Generative AI features chart for pirx.ca: 46.5K AI-feature impressions from Jul 18 to Oct 17, 2026. Account details and page tables are blurred.",
    label: "AI-feature impressions",
    figure: "46.5K",
    sub: "Separate report · not added to search",
  },
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function picture(chart, { sizes = "(min-width: 860px) 46vw, 100vw" } = {}) {
  const base = `/assets/pirx/${chart.stem}`;
  const srcset = WIDTHS.map((width) => `${base}-${width}.webp ${width}w`).join(", ");
  return `<picture>
<source type="image/webp" srcset="${srcset}" sizes="${esc(sizes)}">
<img src="${base}-1600.webp" alt="${esc(chart.alt)}" width="${ASPECT.w}" height="${ASPECT.h}" loading="lazy" decoding="async">
</picture>`;
}

function shot(chart, { sizes, compact = false } = {}) {
  const compactClass = compact ? " pirx-shot--compact" : "";
  return `<article class="pirx-shot${compactClass}">
<header class="pirx-shot__head">
<span class="pirx-shot__pill">${esc(PILL)}</span>
<p class="pirx-shot__label">${esc(chart.label)}</p>
<p class="pirx-shot__figure">${esc(chart.figure)}</p>
<p class="pirx-shot__sub">${esc(chart.sub)}</p>
</header>
<div class="pirx-shot__stage" aria-hidden="false">
<div class="pirx-shot__screen">${picture(chart, { sizes })}</div>
</div>
</article>`;
}

/** Full proof: both product shots + quiet source line. */
export function pirxChartHtml({ sizes } = {}) {
  const pair = CHARTS.map((chart) => shot(chart, { sizes: sizes || "(min-width: 860px) 46vw, 100vw" })).join("\n");
  return `<figure class="pirx-chart">
<div class="pirx-chart__pair">
${pair}
</div>
<p class="pirx-chart__source">${esc(SOURCE)}</p>
</figure>`;
}

/** One compact shot for the homepage Search & AI visibility card. */
export function pirxChartSingleHtml(which = "performance", { sizes = "(min-width: 860px) 22vw, 100vw" } = {}) {
  const chart = CHARTS.find((item) => item.id === which) || CHARTS[0];
  return `<figure class="pirx-chart pirx-chart--single">${shot(chart, { sizes, compact: true })}
<p class="pirx-chart__source">${esc(SOURCE)}</p>
</figure>`;
}

export async function writePirxChartImages() {
  const dest = join(root, "assets/pirx");
  await mkdir(dest, { recursive: true });
  for (const chart of CHARTS) {
    const input = sharp(join(dest, chart.source));
    const meta = await input.metadata();
    for (const width of WIDTHS) {
      const height = Math.round(width * ((meta.height || ASPECT.h) / (meta.width || ASPECT.w)));
      await input
        .clone()
        .resize(width, height, { fit: "inside" })
        .webp({ quality: 82, effort: 4 })
        .toFile(join(dest, `${chart.stem}-${width}.webp`));
    }
  }
}
