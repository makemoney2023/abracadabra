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

const SCHEDULING = "Once a piece is approved and your accounts are connected, it is scheduled into your next open slot.";

test("HQ page and homepage section promise no score, and use the agreed scheduling sentence", () => {
  const page = read("products/hq/index.html");
  const home = read("index.html");
  const section = home.match(/<section id="hq"[\s\S]*?<\/section>/)[0];
  for (const [name, html] of [["page", page], ["home section", section]]) {
    const text = strip(html).replace(/’/g, "'");
    assert.doesNotMatch(text, /\bscores?\b|\bscored\b|\bband\b|\btips\b/i, `${name}: no score, band or tips promise`);
    assert.doesNotMatch(text, /approving (a|the) piece takes|takes the next (open|free) slot/i, `${name}: old slot wording`);
    assert.doesNotMatch(text, /before it posts|move or remove/i, `${name}: no unverified move/remove claim`);
  }
  assert.ok(strip(page).includes(SCHEDULING), "page carries the scheduling sentence");
  assert.ok(strip(section).includes(SCHEDULING), "home section carries the scheduling sentence");
  const ld = JSON.stringify(graph(page));
  assert.doesNotMatch(ld, /\bscores?\b|next open slot on your calendar|approving a piece/i);
  assert.ok(ld.includes("It gives you next steps for your business"));
  assert.ok(strip(page).includes("It gives you next steps for your business."));
  assert.ok(!/free|brief|zernio/i.test(strip(page) + ld), "no free, brief or vendor name");
});

test("HQ page names its audience, links the course, and keeps the Cloudflare claims to verified features", () => {
  const page = read("products/hq/index.html");
  const text = strip(page);
  assert.ok(text.includes("CEOs and business owners leveraging AI across their businesses"));
  assert.ok(page.includes('href="/course/llm-leverage/"'));
  for (const claim of ["DDoS", "R2", "D1", "encrypt", "Access", "AI Gateway", "Workers AI", "Agents SDK"]) assert.ok(text.includes(claim), `security section names ${claim}`);
  assert.doesNotMatch(text, /Security is built into the platform/);
  assert.ok(!/SOC ?2|ISO ?27001|HIPAA|GDPR|zero data retention|never trains/i.test(text), "no compliance or retention claims");
  assert.ok(page.includes("thirty-minute working session"));
});

test("dateModified and sitemap lastmod are 2026-10-23 for the changed pages, and the hub does not imply HQ is try-it-now", () => {
  const sitemap = read("sitemap.xml");
  for (const loc of ["https://abra-ca-dabra.app/", "https://abra-ca-dabra.app/products/", "https://abra-ca-dabra.app/products/hq/", "https://abra-ca-dabra.app/blog/how-client-work-flows-through-hq"]) {
    assert.match(sitemap, new RegExp(`<loc>${loc.replace(/[./]/g, "\\$&")}</loc>\\s*(<lastmod>2026-10-23</lastmod>)`), `lastmod for ${loc}`);
  }
  for (const path of ["products/hq/index.html", "products/index.html", "index.html", "blog/how-client-work-flows-through-hq/index.html"]) {
    assert.ok(JSON.stringify(graph(read(path))).includes('"dateModified":"2026-10-23"'), `dateModified in ${path}`);
  }
  const hub = strip(read("products/index.html")).replace(/\s+/g, " ").replace(/ ([.,])/g, "$1");
  assert.doesNotMatch(hub, /ready-made tools you can try today, schema and super funnel, and hq/i);
  assert.ok(hub.includes("Schema and Super Funnel are ready-made tools you can try today. HQ is the workspace where we deliver client work. You start with the Readiness Check or Start a project."));
});
