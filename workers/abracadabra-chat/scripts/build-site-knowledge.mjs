// Builds src/site-knowledge.js from the marketing site's own data, so the chat only knows what the site says.
// Run: npm run knowledge   (from workers/abracadabra-chat). A test checks the file is current.
// Sources: site-data.mjs (cases, product cards, HQ, course), service-sales.mjs, super-funnel-case.mjs, and the built
// pages themselves: every URL in sitemap.xml is listed, named by its own <title> and <meta name="description">.
// --check exits 1 when src/site-knowledge.js is stale (npm run deploy runs it first).
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const site = new URL("../../../scrollcraft/builds/abracadabra-ai/scripts/", import.meta.url);
const out = fileURLToPath(new URL("../src/site-knowledge.js", import.meta.url));

const one = (text) => String(text || "").replace(/\s+/g, " ").trim();
const first = (text) => one(text).split(/(?<=[.!?])\s+/)[0];
// Up to two sentences, but short: enough for the model to describe the service in its own words.
const brief = (text, cap = 170) => {
  const parts = one(text).split(/(?<=[.!?])\s+/);
  let outText = parts[0];
  if (parts[1] && (outText + " " + parts[1]).length <= cap) outText += ` ${parts[1]}`;
  return outText;
};

// Only public work. Order: the strongest examples first.
const WORK_ORDER = ["strongfoam-crm", "pirx", "strongfoam-website", "milrcorr", "renew-implants", "superpatch-products", "super-funnel", "schema", "llm-leverage"];

// Plain business reasons. Lines quoted from the site come first; the rest are general, accurate facts about Cloudflare.
export const CLOUDFLARE = [
  "Fast everywhere: the app runs on Cloudflare's global network, close to each visitor, so pages and answers load quickly.",
  "Reliable: it is built to keep running if one location has a problem.",
  "Security built in: DDoS protection, bot protection and a firewall come with the network.",
  "No servers to manage or patch, and it scales up and down with traffic on its own.",
  "Low running costs: you pay for what is used, so a small business does not carry idle servers.",
  "AI on the same network: models run on Cloudflare (Workers AI) behind one gateway, so spend is logged, capped and can be stopped.",
  "Data controls: we choose what is logged and kept. This chat stores the words, not the audio.",
  "From our site: built on Cloudflare and connected to the tools you already use, so nothing has to move. Your data goes only to the model doing the work.",
];

// Plain facts for the two newest services. Locked PIRX terms come from the PIRX owner's own glossary.
export const DETAILS = [
  "PIRX DETAIL (pirx.ca, /portfolio/pirx/): we designed and built the PIRX app and its machine learning. A runner connects the watch they already wear. PIRX gives a Projected Time for a race, a Supported Range around it, and five Structural Drivers: Aerobic Base, Threshold Density, Speed Exposure, Running Economy and Load Consistency. Personal models, including gradient boosting, learn each runner's patterns and are only used when they beat the app's safe rules. Athletic estimates, not medical advice. PIRX is the only named machine learning project; never say another project used machine learning. Use these exact names: say Projected Time (never prediction score), Supported Range (never confidence interval), Personal Best (never PR). Never give an accuracy figure or a user count.",
  "MCP DETAIL (/services/mcp-connectors/): MCP, the Model Context Protocol, is an open standard that lets AI assistants like Claude, ChatGPT, Copilot and Cursor plug into a business's tools through one connector. We build MCP connectors on Cloudflare, with sign-in, permissions and approval before any change. Three ways to use it: ask your business (plain, read-only questions), let your AI do the busywork (each change asks for a yes first), and one safe front door (one sign-in, rules for who can use what, a record of every action). No MCP client project is named yet, so never claim one.",
];

// Pages the sitemap does not list but that exist and may be linked.
const EXTRA_PAGES = ["/privacy/"];
// Sitemap pages the chat should never point a visitor to.
const SKIP_PAGES = new Set(["/start/thanks/"]);
// Short names for index pages whose <title> is a headline. Every other page uses its own title.
const PAGE_NAMES = { "/": "Home", "/services/": "Services page", "/portfolio/": "Case studies page", "/products/": "Products page", "/blog/": "Notes (the blog)", "/films.html": "Films page", "/walkthrough.html": "Walkthrough" };

const root = new URL("../", site);
// One glossary entry's definition, at most. The marketing schema caps it at 320 too.
export const GLOSSARY_SHORT_MAX = 320;

/** "/blog/x" and "/blog/x/" are the same page; the chat always uses the trailing slash. */
export function pagePath(raw) {
  let path = new URL(raw, "https://abra-ca-dabra.app").pathname.replace(/\/index\.html$/, "/");
  if (!path.endsWith("/") && !/\.[a-z0-9]+$/i.test(path)) path = `${path}/`;
  return path;
}

/** The built page file for a site path, e.g. "/products/hq/" -> products/hq/index.html. */
export function pageFile(path) {
  return new URL(path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1), root);
}

/** Every page in the published sitemap, as chat paths. */
export async function sitemapPaths() {
  const xml = await readFile(new URL("sitemap.xml", root), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => pagePath(m[1]));
}

const decode = (text) => String(text || "")
  .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** A built page's own title (without the site name) and meta description. */
/** Published glossary terms from content/glossary.json (no dependencies, so CI can run this without npm install). */
export async function glossaryEntries(sitemap) {
  const data = JSON.parse(await readFile(new URL("content/glossary.json", root), "utf8"));
  const entries = data.terms
    .filter((term) => term.status === "published")
    .sort((a, b) => a.term.localeCompare(b.term, "en", { sensitivity: "base" }))
    .map((term) => {
      const acronym = (term.term.match(/\(([^)]+)\)/) || [])[1];
      const base = term.term.replace(/\s*\([^)]*\)\s*/g, " ").trim();
      const names = [term.term, term.name, base, acronym, ...(term.alternateName || []), ...(term.match || [])]
        .filter((name) => name && !name.startsWith("/"))
        .map(one);
      return { term: term.term, path: `/glossary/${term.slug}/`, short: one(term.short), names: [...new Set(names)], notMatch: term.notMatch || [] };
    });
  for (const entry of entries) {
    if (sitemap && !sitemap.includes(entry.path)) throw new Error(`glossary term ${entry.term} is published but ${entry.path} is not in the sitemap`);
    if (entry.short.length > GLOSSARY_SHORT_MAX) throw new Error(`glossary term ${entry.term}: short definition over ${GLOSSARY_SHORT_MAX} chars`);
  }
  return entries;
}

async function pageMeta(path) {
  const html = await readFile(pageFile(path), "utf8");
  const title = decode(html.match(/<title>([^<]*)<\/title>/i)?.[1]).replace(/\s*\|\s*Abracadabra AI\s*$/i, "").trim();
  const description = decode(html.match(/<meta name="description" content="([^"]*)"/i)?.[1]).trim();
  return { title, description };
}

export async function buildKnowledge() {
  const data = await import(new URL("site-data.mjs", site));
  const sales = await import(new URL("service-sales.mjs", site));
  const sf = await import(new URL("super-funnel-case.mjs", site));
  const byCase = new Map(data.cases.map((item) => [item.slug, item]));
  // Every case on the site, strongest first; a case added later is never left out.
  const order = [...WORK_ORDER.filter((slug) => byCase.has(slug)), ...data.cases.map((item) => item.slug).filter((slug) => !WORK_ORDER.includes(slug))];
  const work = order.map((slug) => byCase.get(slug)).map((item) => {
    const path = item.kind === "product" ? `/products/${item.slug}/` : `/portfolio/${item.slug}/`;
    return { name: item.name, path, line: brief(item.summary, 240) };
  });
  const services = Object.entries(sales.salesPages).map(([slug, page]) => ({
    name: page.short,
    path: `/services/${slug}/`,
    line: brief(page.description),
  }));
  // The Products page cards, in order. The course card opens learn.abra-ca-dabra.app; its page here is /course/.
  const products = data.productCards.map((card) => ({
    name: card.name,
    path: card.external ? `/course/${card.slug}/` : card.href,
    line: one(card.description),
  }));
  const process = sales.processSteps.map((step) => `${step.title}: ${first(step.text)}`);

  const sitemap = (await sitemapPaths()).filter((path) => !SKIP_PAGES.has(path));
  const blogPaths = sitemap.filter((path) => /^\/blog\/[a-z0-9-]+\/$/.test(path));
  const blog = [];
  for (const path of blogPaths) blog.push({ name: (await pageMeta(path)).title, path });
  // Glossary terms do not sit in SITE_KNOWLEDGE. Each published term becomes a SITE_GLOSSARY entry (its checked
  // short definition and exact page), and src/glossary.js adds only the entries a question names to that turn's
  // prompt. The standing prompt stays the same size however many terms the glossary publishes.
  const glossary = await glossaryEntries(sitemap);
  const covered = new Set([...work, ...services, ...products, ...blog, ...glossary].map((item) => item.path));
  const pages = [];
  for (const path of [...sitemap, ...EXTRA_PAGES]) {
    if (covered.has(path) || pages.some((page) => page.path === path)) continue;
    const meta = await pageMeta(path);
    pages.push({ name: PAGE_NAMES[path] || meta.title, path, line: meta.description });
  }

  const hq = data.hqProduct.llmsBody.split("\n\n");
  const productsPage = await pageMeta("/products/");
  const schema = data.products.find((item) => item.slug === "schema");
  const schemaCase = byCase.get("schema");
  const details = [
    // "leveraging" would read as jargon in a reply; the site's own phrase is "put AI to work".
    `HQ DETAIL (/products/hq/): ${hq.slice(0, 3).join(" ").replace(/leveraging AI/g, "putting AI to work")} ${productsPage.description.split(/(?<=\.)\s+/).find((s) => s.startsWith("HQ")) || ""} Never give a price, a client name or a number for HQ.`,
    `SCHEMA DETAIL (/products/schema/, live at schema.abra-ca-dabra.app): ${one(schema.description)} ${schemaCase ? one(schemaCase.body.join(" ")) : ""} Open the live scanner to run a scan. ${data.placeholders.product}`,
    `SUPER FUNNEL DETAIL (/portfolio/super-funnel/): ${sf.SF_LLMS_BODY.map(one).join(" ")}`,
    `LLM LEVERAGE DETAIL (/course/llm-leverage/, open at learn.abra-ca-dabra.app): ${one(data.course.description)}`,
  ];

  const lines = [
    "ABOUT: Abracadabra is a studio in Toronto. Let us bring your ideas to life. Custom software and AI tools, built for how you work. We design, build and run them, so they fit your business, not the other way around.",
    "WORK (real, public examples). Format: name | page | what it is. Each page belongs only to its own project.",
    ...work.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    ...DETAILS,
    "PRODUCTS (our own products and course). Format: name | page | what it is.",
    ...products.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    ...details,
    "SERVICES. Format: name | page | what it does.",
    ...services.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    "OTHER PAGES:",
    ...pages.map((item) => `- ${item.name} | ${item.path} | ${item.line}`),
    "NOTES (blog articles; link one only when the visitor asks about its topic). Format: title | page.",
    ...blog.map((item) => `- ${item.name} | ${item.path}`),
    "GLOSSARY: checked, plain definitions of AI and search terms live at /glossary/, one page per term. A GLOSSARY ENTRY block below this list, when present, holds the definition and page for a term the visitor named.",
    `PROCESS: ${process.join(" ")}`,
    "COST: Priced to the project. Tell us what you need and we'll quote it. Never give a number.",
    "NEXT STEPS (options, not a closing line: offer one only when the visitor asks about cost, timing, getting started, or talking to a person): a thirty-minute working session, booked right in this chat. Not sure where to start? The Readiness Check takes five to seven minutes, can be taken right here in this chat (or at check.abra-ca-dabra.app), and shows where the work slows down: the data, the workflow, the owner, the decision, and how visible the site is to answer engines.",
    "WHY CLOUDFLARE:",
    ...CLOUDFLARE.map((line) => `- ${line}`),
  ];
  const paths = [...new Set([...work, ...products, ...services, ...pages, ...blog, ...glossary].map((item) => item.path))];
  const text = lines.join("\n");
  // Short fingerprint of what the chat knows. GET /api/chat/config returns it, so a deploy can be checked against the repo.
  const version = createHash("sha256").update(JSON.stringify({ text, paths, glossary })).digest("hex").slice(0, 12);
  return { text, version, work, products, services, pages, blog, glossary, paths };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { text, version, work, products, services, paths, glossary } = await buildKnowledge();
  if (process.argv.includes("--check")) {
    const current = await import(new URL("../src/site-knowledge.js", import.meta.url));
    if (current.SITE_KNOWLEDGE_VERSION !== version || current.SITE_KNOWLEDGE !== text || JSON.stringify(current.SITE_PATHS) !== JSON.stringify(paths) || JSON.stringify(current.SITE_GLOSSARY) !== JSON.stringify(glossary)) {
      console.error("src/site-knowledge.js is out of date with the marketing site. Run: npm run knowledge");
      process.exit(1);
    }
    console.log(`site-knowledge.js is current: version ${version}, ${text.length} chars, ${paths.length} pages, ${glossary.length} glossary terms`);
    process.exit(0);
  }
  const body = `// Generated by scripts/build-site-knowledge.mjs from the marketing site source. Do not edit by hand.\n`
    + `export const SITE_KNOWLEDGE_VERSION = ${JSON.stringify(version)};\n\n`
    + `export const SITE_KNOWLEDGE = ${JSON.stringify(text)};\n\n`
    + `export const SITE_WORK = ${JSON.stringify(work, null, 2)};\n\n`
    + `export const SITE_PRODUCTS = ${JSON.stringify(products, null, 2)};\n\n`
    + `export const SITE_SERVICES = ${JSON.stringify(services, null, 2)};\n\n`
    + `export const SITE_PATHS = ${JSON.stringify(paths, null, 2)};\n\n`
    + `export const SITE_GLOSSARY = ${JSON.stringify(glossary, null, 2)};\n`;
  await writeFile(out, body);
  console.log(`site-knowledge.js: version ${version}, ${text.length} chars, ~${Math.round(text.length / 4)} tokens, ${glossary.length} glossary terms`);
}
