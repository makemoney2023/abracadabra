/** Writes the Schema scanner card (SVG, PNG, WebP) into assets/schema/. Text is outlined, so no fonts are needed. */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { schemaScannerCard } from "./schema-visuals.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

export async function writeSchemaAssets() {
  const dir = join(root, "assets/schema");
  await mkdir(dir, { recursive: true });
  const svg = schemaScannerCard({ mode: "outline", id: "schema-ui-export" });
  await writeFile(join(dir, "schema-scanner-ui.svg"), svg);
  await sharp(Buffer.from(svg)).resize(1600, 1000).png({ compressionLevel: 9 }).toFile(join(dir, "schema-scanner-ui.png"));
  await sharp(Buffer.from(svg)).resize(1600, 1000).webp({ quality: 88 }).toFile(join(dir, "schema-scanner-ui.webp"));
}
