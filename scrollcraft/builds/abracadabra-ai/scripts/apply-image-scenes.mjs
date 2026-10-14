import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const scenes = JSON.parse(await readFile(join(root, "content/image-scenes.json"), "utf8"));
const prompts = {};

function quote(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

for (const [slug, images] of Object.entries(scenes)) {
  if (images.length !== 3) throw new Error(`${slug} needs 3 scenes`);
  const path = join(root, "content/blog", `${slug}.md`);
  const raw = await readFile(path, "utf8");
  const block = [
    "images:",
    ...images.flatMap((image, index) => [
      `  - src: /blog/media/${slug}/0${index + 1}.png`,
      `    file: ${slug}-0${index + 1}.jpg`,
      `    alt: ${quote(image.alt)}`,
      `    caption: ${quote(image.caption)}`,
      `    prompt: ${quote(image.prompt)}`,
    ]),
  ].join("\n");
  if (!/^images:\n(?:  .*\n)+/m.test(raw)) {
    throw new Error(`${slug} images block was not found`);
  }
  const next = raw.replace(/^images:\n(?:  .*\n)+/m, `${block}\n`);
  await writeFile(path, next);
  prompts[slug] = images.map((image) => image.prompt);
}

const order = Object.keys(JSON.parse(await readFile(join(root, "content/calendar-image-prompts.json"), "utf8")));
const missing = order.filter((slug) => !prompts[slug]);
const extra = Object.keys(prompts).filter((slug) => !order.includes(slug));
if (missing.length || extra.length) {
  throw new Error(`scene keys differ from prompts: missing ${missing.join(",")} extra ${extra.join(",")}`);
}
const sorted = Object.fromEntries(order.map((slug) => [slug, prompts[slug]]));
await writeFile(join(root, "content/calendar-image-prompts.json"), `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`updated ${order.length} posts`);
