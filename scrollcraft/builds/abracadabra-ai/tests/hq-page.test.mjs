import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
const graph = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/)[1])["@graph"];
const NETWORKS = ["Instagram", "Facebook", "LinkedIn", "TikTok", "X", "YouTube", "Threads", "Google Business", "Bluesky"];

test("HQ page is generated with product-page structure and the right links", () => {
  const html = read("products/hq/index.html");
  assert.match(html, /<link rel="canonical" href="https:\/\/abra-ca-dabra\.app\/products\/hq\/">/);
  assert.match(html, /class="site-page product-page hq-page"/);
  assert.match(html, /<h1>One place to request, review and approve the work\.<\/h1>/);
  for (const href of ["/blog/how-client-work-flows-through-hq", "/blog/what-is-an-ai-agent", "/blog/why-we-build-on-cloudflare", "https://check.abra-ca-dabra.app/check", "/start/"]) {
    assert.ok(html.includes(`href="${href}"`), `missing link ${href}`);
  }
  for (const network of NETWORKS) assert.ok(html.includes(`<li>${network}</li>`), `missing network ${network}`);
  assert.ok((html.match(/Illustrative interface\. Sample content\./g) ?? []).length >= 5, "every mockup is captioned");
  assert.match(html, /Illustrative diagram\. Simplified\./);
  assert.match(html, /prefers-reduced-motion/.test(read("assets/hq.css")) ? /hq-flow/ : /never/);
});

test("HQ page copy follows the content rules", () => {
  const html = read("products/hq/index.html");
  const text = strip(html);
  assert.equal(/\bfree\b/i.test(text), false, "no 'free'");
  assert.equal(/\bbrief\b/i.test(text), false, "no 'brief'");
  assert.equal(/zernio|grok|openai|anthropic|gemini|claude|gpt|veo|seedance/i.test(html), false, "no vendor or model names");
  assert.equal(/site scan|scans? your site/i.test(text), false);
  assert.equal(/christopher|buzny/i.test(html), false);
  assert.equal(/\$\d|\d+%|\d+x\b/.test(text), false, "no invented prices or stats");
  assert.match(text, /five-to-seven-minute questionnaire/);
  assert.equal(/<img/i.test(html.slice(html.indexOf("<main"), html.indexOf("</main>"))), false, "mockups are inline SVG, never screenshots");
});

test("HQ structured data covers the requested types and omits ratings and offers", () => {
  const html = read("products/hq/index.html");
  const nodes = graph(html);
  const types = nodes.flatMap((node) => [node["@type"]].flat());
  for (const type of ["Organization", "WebSite", "WebPage", "BreadcrumbList", "SoftwareApplication", "Product", "FAQPage", "BlogPosting"]) {
    assert.ok(types.includes(type), `missing ${type}`);
  }
  const raw = JSON.stringify(nodes);
  assert.equal(/"offers"|aggregateRating|"review"/i.test(raw), false);
  const page = nodes.find((node) => node["@id"] === "https://abra-ca-dabra.app/products/hq/#webpage");
  assert.ok(page.relatedLink.includes("https://abra-ca-dabra.app/blog/how-client-work-flows-through-hq"));
  assert.ok(page.mentions.some((m) => m["@id"].endsWith("/blog/how-client-work-flows-through-hq#post")));
  const faq = nodes.find((node) => node["@type"] === "FAQPage");
  assert.equal(faq.mainEntity.length, (html.match(/<details>/g) ?? []).length, "FAQPage matches the visible questions");
  const ids = new Set(nodes.map((node) => node["@id"]).filter(Boolean));
  for (const ref of [page.breadcrumb, page.mainEntity, page.hasPart]) assert.ok(ids.has(ref["@id"]), `dangling ${ref["@id"]}`);
});

test("the how-client-work-flows article and the HQ page link to each other", () => {
  const article = read("blog/how-client-work-flows-through-hq/index.html");
  assert.ok(article.includes('href="/products/hq/"'));
  assert.ok(article.includes('href="/blog/what-is-an-ai-agent"'));
  const mentions = graph(article).find((node) => node["@type"] === "BlogPosting").mentions;
  assert.equal(mentions[0].url, "https://abra-ca-dabra.app/products/hq/");
});

test("homepage has the #hq section between #clients and #models-band, and valid JSON-LD", () => {
  const html = read("index.html");
  const at = (id) => html.indexOf(`<section id="${id}"`);
  assert.ok(at("clients") < at("hq") && at("hq") < at("models-band"));
  assert.ok(at("cloudflare") < at("faq") && at("faq") < at("start"), "FAQ stays before the final CTA");
  assert.ok(html.includes('id="time"'), "the It feels like magic section is untouched");
  const section = html.slice(at("hq"), html.indexOf("</section>", at("hq")));
  assert.ok(section.includes('href="/products/hq/"') && section.includes('href="/blog/how-client-work-flows-through-hq"'));
  assert.ok((section.match(/Illustrative interface\. Sample content\./g) ?? []).length === 3);
  assert.doesNotThrow(() => graph(html));
});

test("products hub, sitemap, redirects and discovery files list HQ", () => {
  assert.ok(read("products/index.html").includes('href="/products/hq/"'));
  assert.ok(read("sitemap.xml").includes("<loc>https://abra-ca-dabra.app/products/hq/</loc>"));
  assert.ok(read("_redirects").includes("/products/hq/ /products/hq/index.html 200"));
  assert.ok(read("_redirects").includes("/hq /products/hq/ 301"));
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const text = read(file);
    assert.ok(text.includes("https://abra-ca-dabra.app/products/hq/"), `${file} lists the HQ page`);
    assert.ok(text.includes("https://abra-ca-dabra.app/blog/how-client-work-flows-through-hq"));
    assert.ok(text.includes("https://abra-ca-dabra.app/blog/what-is-an-ai-agent"));
  }
  assert.equal(/zernio/i.test(read("llms-full.txt").split("## ")[0] + read("llms.txt")), false);
});

test("data-flow diagram exports exist", () => {
  for (const file of ["assets/hq/hq-data-flow.svg", "assets/hq/hq-data-flow.png", "assets/hq/hq-data-flow.webp"]) assert.ok(existsSync(join(root, file)), file);
  const svg = read("assets/hq/hq-data-flow.svg");
  assert.match(svg, /width="1600" height="900"/);
  assert.equal(/<text/.test(svg), false, "export outlines its text");
});
