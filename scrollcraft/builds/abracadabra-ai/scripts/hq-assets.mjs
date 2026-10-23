/** Writes the standalone HQ data-flow diagram (SVG, PNG, WebP) into assets/hq/. Text is outlined, so no fonts are needed. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { flowDiagramWide } from "./hq-visuals.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function writeHqAssets() {
  const dir = join(root, "assets/hq");
  await mkdir(dir, { recursive: true });
  const svg = flowDiagramWide({ mode: "outline", id: "hq-flow-export" });
  await writeFile(join(dir, "hq-data-flow.svg"), svg);
  await sharp(Buffer.from(svg)).resize(1600, 900).png({ compressionLevel: 9 }).toFile(join(dir, "hq-data-flow.png"));
  await sharp(Buffer.from(svg)).resize(1600, 900).webp({ quality: 88 }).toFile(join(dir, "hq-data-flow.webp"));
}
