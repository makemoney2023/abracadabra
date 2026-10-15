import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const offerings = [
  "ai-assistants-and-agents",
  "answers-from-your-documents",
  "any-model-one-bill",
  "voice-and-realtime-agents",
  "web-automation",
  "safe-code-execution",
  "custom-apps",
  "ai-media",
  "ai-visibility",
  "search-grounded-research",
];

test("the model strip sits between the menu and the answer chapter", () => {
  const index = read("index.html");
  const ids = [...index.matchAll(/<section id="([^"]+)"/g)].map((match) => match[1]);
  const range = ids.indexOf("range");
  const models = ids.indexOf("models");
  const aeo = ids.indexOf("aeo");
  assert.equal(models, range + 1);
  assert.equal(aeo, models + 1);
  assert.match(index, /The models are next/);
  assert.match(index, /href="#models"/);
  assert.equal((index.match(/aria-hidden="true"/g) || []).length > 0, true);
  const modelsBlock = index.slice(index.indexOf('id="models"'), index.indexOf('id="aeo"'));
  assert.equal((modelsBlock.match(/<ul class="marquee__list" aria-hidden="true">/g) || []).length, 2);
  assert.match(index, /prefers-reduced-motion: reduce/);
  assert.match(index, /\.marquee__list\[aria-hidden="true"\] \{ display: none; \}/);
  assert.equal(index.includes("0.62rem"), false);
  assert.equal(index.includes("0.58rem"), false);
  assert.equal(index.includes("The next room is the receipt"), false);
  assert.match(index, /Every major model, one gateway/);
  assert.match(index, /What we build and run for you\./);
  const offeringsBlock = index.slice(index.indexOf('id="offerings"'), index.indexOf('id="benefits"'));
  assert.equal((offeringsBlock.match(/href="\/offerings\//g) || []).length, 10);
});

test("generated pages keep placeholders visible and out of JSON-LD", () => {
  const pages = [
    ["offerings/index.html", ["CollectionPage", "ItemList"]],
    ["offerings/ai-assistants-and-agents/index.html", ["Service", "FAQPage", "BreadcrumbList"]],
    ["portfolio/index.html", ["CollectionPage"]],
    ["portfolio/canadian-discount-appliances/index.html", ["BreadcrumbList"]],
    ["products/index.html", ["CollectionPage"]],
    ["products/showdesk/index.html", ["SoftwareApplication", "Product"]],
    ["course/llm-leverage/index.html", ["Course"]],
  ];
  for (const [path, types] of pages) {
    const html = read(path);
    const json = html.slice(html.indexOf('<script type="application/ld+json">'), html.indexOf("</script>"));
    assert.equal(json.includes("PLACEHOLDER"), false, path);
    assert.equal(json.includes("AggregateRating"), false, path);
    assert.equal(/"offers"\s*:/.test(json), false, path);
    for (const type of types) assert.match(json, new RegExp(`"@type": "${type}"|"@type": \\[[^\\]]*${type}`), `${path} ${type}`);
    assert.match(html, /class="site-nav"/);
    assert.match(html, /Start a brief/);
  }
  const offering = read("offerings/ai-assistants-and-agents/index.html");
  assert.match(offering, /PLACEHOLDER — needs Christopher/);
  assert.match(offering, /What do you build\?/);
  const product = read("products/schema/index.html");
  assert.match(product, /PLACEHOLDER — needs Christopher/);
  const course = read("course/llm-leverage/index.html");
  assert.match(course, /PLACEHOLDER — needs Christopher/);
  assert.equal(course.includes("module 1"), false);
  const sitemap = read("sitemap.xml");
  for (const slug of offerings) {
    assert.match(sitemap, new RegExp(`https://abra-ca-dabra.app/offerings/${slug}/`));
  }
  assert.match(read("llms.txt"), /https:\/\/abra-ca-dabra\.app\/offerings\//);
  assert.match(read("_redirects"), /\/offerings\/ai-assistants-and-agents \/offerings\/ai-assistants-and-agents\/index\.html 200/);
});
