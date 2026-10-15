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
    assert.match(html, /class="site-nav__menu"/);
    assert.match(html, /class="site-nav__toggle"/);
    assert.match(html, /Start a brief/);
  }
  const offering = read("services/ai-assistants-and-agents/index.html");
  assert.match(offering, /PLACEHOLDER — needs Christopher/);
  assert.match(offering, /class="sales-primary" href="\/#brief">Show us how it works/);
  assert.match(offering, /AI Readiness Check/);
  assert.match(offering, /https:\/\/check\.abra-ca-dabra\.app\/check/);
  assert.match(offering, /What changes/);
  assert.match(offering, /Three places it shows up/);
  assert.match(offering, /How it gets built/);
  assert.match(offering, /<h3>Brief<\/h3>/);
  assert.match(offering, /<h3>People approve<\/h3>/);
  assert.match(offering, /Off the shelf, a hire, or us/);
  assert.match(offering, /When off the shelf wins/);
  assert.match(offering, /Contact for pricing/);
  assert.match(offering, /href="\/services\/safe-code-execution\/"/);
  assert.match(offering, /class="page-hero page-hero--photo"/);
  assert.match(offering, /class="sales-split"/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/hero-640\.avif 640w/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/hero-1280\.webp 1280w/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/body1-960\.avif 960w/);
  assert.match(offering, /\/blog\/media\/services\/ai-assistants-and-agents\/body2-1280\.webp 1280w/);
  assert.match(offering, /src="\/blog\/media\/services\/ai-assistants-and-agents\/hero\.jpg"/);
  assert.match(offering, /width="1280" height="720"/);
  assert.match(offering, /fetchpriority="high"/);
  assert.match(offering, /loading="lazy"/);
  assert.match(offering, /Dark chat console with a customer thread/);
  assert.match(offering, /property="og:image" content="https:\/\/abra-ca-dabra\.app\/blog\/media\/services\/ai-assistants-and-agents\/og\.jpg"/);
  assert.match(offering, /property="og:image:width" content="1200"/);
  assert.match(offering, /property="og:image:height" content="630"/);
  assert.doesNotMatch(offering, industryNoun);
  assert.equal(offering.includes("$"), false);
  assert.match(offering, /href="\/services\/">Services/);
  const product = read("products/schema/index.html");
  assert.match(product, /PLACEHOLDER — needs Christopher/);
  const course = read("course/llm-leverage/index.html");
  assert.match(course, /PLACEHOLDER — needs Christopher/);
  assert.equal(course.includes("module 1"), false);
  const sitemap = read("sitemap.xml");
  const hub = read("services/index.html");
  const hubJson = hub.slice(hub.indexOf('<script type="application/ld+json">'), hub.indexOf("</script>"));
  assert.match(hubJson, /"@type": "ItemList"/);
  assert.match(hub, /Part of AI assistants/);
  assert.match(hub, /\/blog\/media\/services\/ai-visibility\/hero-640\.avif 640w/);
  assert.match(hub, /loading="lazy"/);
  assert.match(read("index.html"), /\/blog\/media\/services\/ai-assistants-and-agents\/hero-960\.webp 960w/);
  assert.match(read("about/christopher-buzny/index.html"), /class="page-hero"/);
  assert.match(read("about/christopher-buzny/index.html"), /TODO\(christopher\): confirm credentials/);
  assert.match(hub, /<!-- PLACEHOLDER — needs Christopher: Google Search Console verification meta -->/);
  for (const slug of offerings) {
    assert.match(sitemap, new RegExp(`https://abra-ca-dabra.app/services/${slug}/`));
    const page = read(`services/${slug}/index.html`);
    const main = page.slice(page.indexOf("<main"), page.indexOf("</main>"));
    const words = main.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").split(/\s+/).filter(Boolean);
    assert.equal(words.length >= 900 && words.length <= 1300, true, `${slug} ${words.length} words`);
    assert.match(page, /Show us how it works/);
    assert.match(page, /When off the shelf wins/);
    assert.match(page, /Contact for pricing/);
    assert.match(page, /<!-- PLACEHOLDER — needs Christopher: Google Search Console verification meta -->/);
    assert.doesNotMatch(page, industryNoun);
    assert.equal(/\$\d/.test(page), false, slug);
    assert.equal((page.match(/<h3>/g) || []).length >= 4, true, slug);
  }
  const safe = read("services/safe-code-execution/index.html");
  assert.match(safe, /href="\/services\/ai-assistants-and-agents\/"/);
  const visibility = read("services/ai-visibility/index.html");
  const pirx = read("portfolio/pirx/index.html");
  const research = read("services/search-grounded-research/index.html");
  const customApps = read("services/custom-apps/index.html");
  const cleared = /From near-zero to 375K search impressions and 43\.5K AI-feature impressions in 90 days/;
  const windowLabel = /Jul 14 to Oct 13, 2026/;
  const source = /Source: Google Search Console, Jul 14 to Oct 13, 2026/;
  assert.match(visibility, cleared);
  assert.match(visibility, windowLabel);
  assert.match(visibility, /1\.85K/);
  assert.match(visibility, /average position of 7\.6/);
  assert.match(visibility, source);
  assert.match(visibility, /class="pirx-chart"/);
  assert.doesNotMatch(visibility, /\bCTR\b/i);
  assert.doesNotMatch(visibility, /201K|21\.8K|2026-09-23|418/);
  assert.doesNotMatch(research, /375K|43\.5K|201K|1\.85K/);
  assert.doesNotMatch(customApps, /375K|43\.5K|201K|1\.85K/);
  assert.match(customApps, /StrongFoam CRM\/ERP/);
  assert.match(read("portfolio/superpatch-products/index.html"), /SuperPatch products/);
  assert.match(read("portfolio/strongfoam-website/index.html"), /StrongFoam/);
  assert.match(read("portfolio/strongfoam-crm/index.html"), /CRM\/ERP/);
  assert.match(read("portfolio/renew-implants/index.html"), /Renew Implants/);
  assert.match(pirx, cleared);
  assert.match(pirx, windowLabel);
  assert.match(pirx, source);
  assert.match(pirx, /good-10k-time-by-age/);
  assert.match(pirx, /10,451/);
  assert.match(pirx, /good-half-marathon-time-by-age/);
  assert.match(pirx, /7,758/);
  assert.match(pirx, /good-5k-time-by-age/);
  assert.match(pirx, /6,104/);
  assert.match(pirx, /1\.85K/);
  assert.match(pirx, /7\.6/);
  assert.match(pirx, /class="pirx-chart"/);
  assert.doesNotMatch(pirx, /\bCTR\b/i);
  assert.doesNotMatch(pirx, /201K|21\.8K|2026-09-23|traffic|revenue|418/);
  const siteClaims = /370K|4\.9\/5|97\.4|Olympian/i;
  const portfolioHub = read("portfolio/index.html");
  assert.doesNotMatch(visibility, siteClaims);
  assert.doesNotMatch(customApps, siteClaims);
  assert.doesNotMatch(pirx, siteClaims);
  assert.doesNotMatch(portfolioHub, siteClaims);
  assert.match(portfolioHub, /assets\/pirx\/pirx-home-hero-desktop\.jpg/);
  assert.match(portfolioHub, /alt="pirx\.ca home page, with a race time predictor/);
  assert.match(pirx, /assets\/pirx\/pirx-home-hero-desktop\.jpg/);
  assert.match(pirx, /assets\/pirx\/pirx-home-hero-mobile\.jpg/);
  assert.match(pirx, /assets\/pirx\/pirx-home-full-desktop\.jpg/);
  assert.match(pirx, /assets\/pirx\/pirx-home-full-mobile\.jpg/);
  assert.match(pirx, /assets\/pirx\/pirx-blog-post-full-desktop\.jpg/);
  assert.match(pirx, /assets\/pirx\/pirx-blog-post-full-mobile\.jpg/);
  assert.match(customApps, /assets\/pirx\/pirx-race-predictor-full-desktop\.jpg/);
  assert.match(customApps, /assets\/pirx\/pirx-race-predictor-full-mobile\.jpg/);
  assert.doesNotMatch(customApps, /pirx-accuracy-full|pirx-blog-full|pirx-home-full|pirx-blog-post/);
  assert.match(visibility, /pirx-accuracy-full-desktop\.jpg/);
  assert.match(visibility, /pirx-accuracy-full-mobile\.jpg/);
  assert.match(visibility, /pirx-race-predictor-marathon-full-desktop\.jpg/);
  assert.match(visibility, /pirx-race-predictor-marathon-full-mobile\.jpg/);
  assert.match(visibility, /pirx-blog-full-desktop\.jpg/);
  assert.match(visibility, /pirx-blog-full-mobile\.jpg/);
  assert.doesNotMatch(visibility, /pirx-race-predictor-full-|pirx-home-full|pirx-blog-post/);
  assert.doesNotMatch(research, /assets\/pirx\//);
  for (const file of [
    "pirx-home-hero-desktop.jpg",
    "pirx-home-hero-mobile.jpg",
    "pirx-home-full-desktop.jpg",
    "pirx-home-full-mobile.jpg",
    "pirx-race-predictor-full-desktop.jpg",
    "pirx-race-predictor-full-mobile.jpg",
    "pirx-race-predictor-marathon-full-desktop.jpg",
    "pirx-race-predictor-marathon-full-mobile.jpg",
    "pirx-accuracy-full-desktop.jpg",
    "pirx-accuracy-full-mobile.jpg",
    "pirx-blog-full-desktop.jpg",
    "pirx-blog-full-mobile.jpg",
    "pirx-blog-post-full-desktop.jpg",
    "pirx-blog-post-full-mobile.jpg",
  ]) {
    assert.equal(existsSync(join(root, "assets/pirx", file)), true, file);
  }
  assert.match(read("llms.txt"), windowLabel);
  assert.match(read("llms.txt"), /375K/);
  assert.doesNotMatch(read("llms.txt"), /201K|21\.8K|2026-09-23/);
  assert.doesNotMatch(hub, industryNoun);
  assert.equal(existsSync(join(root, "offerings")), false);
  assert.match(read("llms.txt"), /https:\/\/abra-ca-dabra\.app\/services\//);
  assert.match(read("_redirects"), /\/services\/ai-assistants-and-agents \/services\/ai-assistants-and-agents\/index\.html 200/);
  assert.match(read("_redirects"), /\/offerings\/ai-assistants-and-agents \/services\/ai-assistants-and-agents\/ 301/);
  assert.match(read("portfolio/canadian-discount-appliances/index.html"), /Canadian Discount Appliances/);
  assert.match(read("index.html"), /<!-- PLACEHOLDER — needs Christopher: Google Search Console verification meta -->/);
});
