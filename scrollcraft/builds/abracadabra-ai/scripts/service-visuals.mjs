import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("..", import.meta.url));
const WIDTHS = [640, 960, 1280];
const HEIGHT_RATIO = 720 / 1280;

/** Source folder in content/service-images, keyed by the public service slug. */
export const SERVICE_FOLDERS = {
  "ai-assistants-and-agents": "ai-assistants",
  "answers-from-your-documents": "knowledge-search",
  "any-model-one-bill": "ai-gateway",
  "voice-and-realtime-agents": "voice-agents",
  "web-automation": "web-automation",
  "safe-code-execution": "code-sandboxes",
  "custom-apps": "custom-apps",
  "ai-media": "ai-media",
  "ai-visibility": "ai-visibility",
  "search-grounded-research": "research-tools",
};

export const SERVICE_ALTS = {
  "ai-assistants-and-agents": {
    hero: "Dark chat console with a customer thread, a reply field, and a checklist of next steps.",
    body1: "Three task cards for a follow-up, an order lookup, and a booking, each with a checked step.",
    body2: "Workflow timeline from a customer message through a checked step to a completed action.",
  },
  "answers-from-your-documents": {
    hero: "Search panel with a question, an answer, and a cited page from a document stack.",
    body1: "Document list beside a highlighted passage and the page number it came from.",
    body2: "Answer card with a quoted line and a link back to the source file.",
  },
  "any-model-one-bill": {
    hero: "Model picker with several model names and one usage meter for the bill.",
    body1: "Spend panel with a cap, a model list, and a single total.",
    body2: "Gateway log of model calls rolling into one invoice line.",
  },
  "voice-and-realtime-agents": {
    hero: "Voice console with a live waveform, a transcript, and a hold-to-talk control.",
    body1: "Call card with a transcript snippet and a suggested next reply.",
    body2: "Realtime session timeline from a spoken question to a spoken answer.",
  },
  "web-automation": {
    hero: "Browser window with a recorded step list and a highlighted control on the page.",
    body1: "Automation run with a step checklist beside a captured page.",
    body2: "Finished run card showing the steps that completed and the page they touched.",
  },
  "safe-code-execution": {
    hero: "Sandbox window with a code pane, a run button, and an isolated output panel.",
    body1: "Code cell with a result and a note that the run stayed in the sandbox.",
    body2: "Execution log with a passed check and the sandbox boundary around the output.",
  },
  "custom-apps": {
    hero: "App canvas with a sidebar, a main workspace, and a status strip.",
    body1: "Custom screen with a form, a record list, and the action you use.",
    body2: "Shipped app view with the workflow the screen is built around.",
  },
  "ai-media": {
    hero: "Media board with a generated still, a timeline, and a prompt field.",
    body1: "Frame strip of stills beside a short prompt and an export control.",
    body2: "Finished media card with the still, the cut, and the file ready to use.",
  },
  "ai-visibility": {
    hero: "Visibility dashboard with a query, an answer preview, and a measure of where the page shows.",
    body1: "Query list beside the answer snippet and the page it cites.",
    body2: "Measure panel with search impressions and a separate AI-feature count.",
  },
  "search-grounded-research": {
    hero: "Research desk with a question, source cards, and a grounded answer.",
    body1: "Source stack with titles and the line each one contributes.",
    body2: "Research answer with the sources named under it.",
  },
};

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export function serviceAlt(slug, role) {
  const alt = SERVICE_ALTS[slug]?.[role];
  if (!alt) throw new Error(`Missing alt for ${slug} ${role}`);
  return alt;
}

export function serviceOgPath(slug) {
  return `/blog/media/services/${slug}/og.jpg`;
}

export function servicePicture(slug, role, { lazy = false, sizes = "100vw" } = {}) {
  const alt = serviceAlt(slug, role);
  const base = `/blog/media/services/${slug}/${role}`;
  const srcset = (ext) => WIDTHS.map((width) => `${base}-${width}.${ext} ${width}w`).join(", ");
  const priority = lazy ? ' loading="lazy"' : ' fetchpriority="high"';
  return `<picture>
<source type="image/avif" srcset="${srcset("avif")}" sizes="${esc(sizes)}">
<source type="image/webp" srcset="${srcset("webp")}" sizes="${esc(sizes)}">
<img src="${base}.jpg" alt="${esc(alt)}" width="1280" height="720"${priority} decoding="async">
</picture>`;
}

async function writeRole(source, destDir, role) {
  const input = sharp(source);
  for (const width of WIDTHS) {
    const height = Math.round(width * HEIGHT_RATIO);
    const resized = input.clone().resize(width, height, { fit: "cover", position: "centre" });
    await resized.clone().avif({ quality: 48, effort: 2 }).toFile(join(destDir, `${role}-${width}.avif`));
    await resized.clone().webp({ quality: 76, effort: 4 }).toFile(join(destDir, `${role}-${width}.webp`));
  }
  await input.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(destDir, `${role}.jpg`));
}

export async function writeServiceImages() {
  for (const [slug, folder] of Object.entries(SERVICE_FOLDERS)) {
    const destDir = join(root, "blog/media/services", slug);
    await mkdir(destDir, { recursive: true });
    for (const role of ["hero", "body1", "body2"]) {
      const source = join(root, "content/service-images", folder, `${role}.jpg`);
      await writeRole(source, destDir, role);
    }
    await sharp(join(root, "content/service-images", folder, "hero.jpg"))
      .resize(1200, 630, { fit: "cover", position: "centre" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(destDir, "og.jpg"));
  }
}
