import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const industryNoun = /\b(clinics?|dentals?|dentists?|distributors?|restaurants?|warehouses?|hospitals?|hotels?|salons?|grocer(?:y|ies)|cafes?|coffees?|plumbers?|veterinar(?:y|ies)|realtors?|patients?|appliances?|kitchener|front desks?)\b/i;

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
  const servicesBlock = index.slice(index.indexOf('id="services"'), index.indexOf('id="benefits"'));
  assert.equal((servicesBlock.match(/href="\/services\//g) || []).length, 10);
  assert.match(index, /href="\/services\/">Services/);
  assert.equal(index.includes(">Offerings<"), false);
  assert.equal(modelsBlock.includes("marquee__word"), false);
  const marks = [
    "baseten.svg", "cartesia.svg", "cerebras.svg", "cohere.svg", "fal.svg", "groq.svg",
    "ideogram.svg", "parallel.svg", "xai.svg", "gemma.svg", "gpt-oss.svg", "zhipu.svg",
    "flux.svg", "stability.svg", "leonardo.png", "whisper.svg", "baai.svg",
  ];
  for (const file of marks) {
    assert.equal(existsSync(join(root, "assets/logos", file)), true, file);
    assert.match(modelsBlock, new RegExp(`assets/logos/${file.replace(".", "\\.")}`));
  }
  assert.doesNotMatch(servicesBlock, industryNoun);
});

test("generated pages keep placeholders visible and out of JSON-LD", () => {
  const pages = [
    ["services/index.html", ["CollectionPage", "ItemList"]],
    ["services/ai-assistants-and-agents/index.html", ["Service", "FAQPage", "BreadcrumbList"]],
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
  const offering = read("services/ai-assistants-and-agents/index.html");
  assert.match(offering, /PLACEHOLDER — needs Christopher/);
  assert.match(offering, /What it is/);
  assert.match(offering, /What it looks like in your business/);
  assert.match(offering, /Answering common customer questions after hours/);
  assert.match(offering, /How it works/);
  assert.match(offering, /What you get/);
  assert.match(offering, /Who it's for/);
  assert.match(offering, /Signs you need it/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/01\.webp/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/02\.webp/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/03\.webp/);
  assert.doesNotMatch(offering, industryNoun);
  assert.match(offering, /href="\/services\/">Services/);
  const product = read("products/schema/index.html");
  assert.match(product, /PLACEHOLDER — needs Christopher/);
  const course = read("course/llm-leverage/index.html");
  assert.match(course, /PLACEHOLDER — needs Christopher/);
  assert.equal(course.includes("module 1"), false);
  const sitemap = read("sitemap.xml");
  for (const slug of offerings) {
    assert.match(sitemap, new RegExp(`https://abra-ca-dabra.app/services/${slug}/`));
    const page = read(`services/${slug}/index.html`);
    assert.match(page, /What it looks like in your business/);
    assert.doesNotMatch(page, industryNoun);
    assert.equal((page.match(/<h3>/g) || []).length >= 4, true, slug);
  }
  assert.doesNotMatch(read("services/index.html"), industryNoun);
  assert.equal(existsSync(join(root, "offerings")), false);
  assert.match(read("llms.txt"), /https:\/\/abra-ca-dabra\.app\/services\//);
  assert.match(read("_redirects"), /\/services\/ai-assistants-and-agents \/services\/ai-assistants-and-agents\/index\.html 200/);
  assert.match(read("_redirects"), /\/offerings\/ai-assistants-and-agents \/services\/ai-assistants-and-agents\/ 301/);
  assert.match(read("portfolio/canadian-discount-appliances/index.html"), /Canadian Discount Appliances/);
});
