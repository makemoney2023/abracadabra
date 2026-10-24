import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ORG_ID, SITE, WEBSITE_ID } from "../scripts/blog.mjs";
import { GLOSSARY_PATH, loadGlossary, parseGlossary, publishedTerms, termPath } from "../scripts/glossary-data.mjs";
import { findMention, linkFirstMention, tokenize } from "../scripts/glossary-links.mjs";
import { sourceFile, termSetId } from "../scripts/glossary.mjs";
import { readingStats } from "../scripts/reading-level.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const data = loadGlossary();
const terms = publishedTerms(data);
const pageFile = (term) => `glossary/${term.slug}/index.html`;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const textOf = (html) => decode(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
const meta = (html, re) => decode(html.match(re)?.[1] ?? "");
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const graphOf = (html) => ldBlocks(html).flatMap((b) => b["@graph"] ?? [b]);
const typed = (graph, type) => graph.filter((n) => [n["@type"]].flat().includes(type));
const PRIORITY = { High: 0, Med: 1, Low: 2 };

test("glossary data parses and keeps batch rules", () => {
  assert.ok(terms.length >= 10, "at least the first batch is published");
  const slugs = data.terms.map((t) => t.slug);
  assert.equal(new Set(slugs).size, slugs.length, "slugs are unique");
  for (const t of data.terms) {
    assert.match(t.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    if (t.clientFlag) assert.equal(t.status, "needs-client-approval", `${t.term} is client-flagged and held back`);
  }
  const held = data.terms.filter((t) => t.status === "needs-client-approval");
  assert.ok(held.some((t) => /PIRX/.test(t.clientFlag ?? "")), "PIRX terms are held for client approval");
  const unpublished = data.terms.filter((t) => t.status !== "published");
  for (let i = 1; i < unpublished.length; i += 1) {
    assert.ok(PRIORITY[unpublished[i - 1].priority] <= PRIORITY[unpublished[i].priority], `backlog stays High, Med, Low at ${unpublished[i].term}`);
  }
  assert.throws(() => parseGlossary({ ...data, terms: [...data.terms, { ...data.terms[0] }] }), /slug/i);
});

test("published terms have sources, references and FAQs", () => {
  const published = new Set(terms.map((t) => t.slug));
  for (const t of terms) {
    assert.ok(t.sources.length >= 1, `${t.term} lists where we use it`);
    assert.ok(t.refs.length >= 1 && t.refs.every((r) => r.url.startsWith("https://")), `${t.term} has https references`);
    assert.ok(t.faqs.length >= 2, `${t.term} has FAQs`);
    assert.ok(t.sections.length >= 1 && t.sections.every((s) => s.q.endsWith("?")), `${t.term} has question sections`);
    assert.ok(t.related.every((slug) => data.terms.some((x) => x.slug === slug)), `${t.term} related slugs exist`);
    assert.ok(t.related.some((slug) => published.has(slug)), `${t.term} links at least one published related term`);
  }
});

test("glossary copy reads at grade 8 or lower with no em dashes, no 'free' and no unsourced numbers", () => {
  for (const t of terms) {
    const copy = [t.short, ...t.explainer, ...t.sections.flatMap((s) => [s.q, ...s.a]), ...t.faqs.flatMap((f) => [f.question, f.answer]), t.description, t.question];
    const prose = [t.short, ...t.explainer, ...t.sections.flatMap((s) => s.a), ...t.faqs.map((f) => f.answer)].join("\n\n");
    assert.ok(readingStats(prose).grade <= 8, `${t.term} page copy grade ${readingStats(prose).grade}`);
    assert.ok(readingStats(t.short).grade <= 8, `${t.term} short definition grade ${readingStats(t.short).grade}`);
    for (const line of copy) {
      assert.ok(!line.includes("\u2014"), `${t.term} has an em dash: ${line}`);
      assert.ok(!/\bfree\b/i.test(line), `${t.term} says free: ${line}`);
      for (const n of line.match(/(?<![A-Za-z])\d[\d,.]*%?/g) ?? []) {
        assert.ok(t.figures.some((f) => f.includes(n.replace(/[.,]$/, ""))), `${t.term} number ${n} must be listed in figures with a source`);
      }
    }
  }
});

test("index and term pages exist with canonical, unique title and description, and a branded share image", async () => {
  const pages = [["glossary/index.html", `${SITE}${GLOSSARY_PATH}`], ...terms.map((t) => [pageFile(t), `${SITE}${termPath(t)}`])];
  const titles = new Set();
  const descriptions = new Set();
  for (const [file, url] of pages) {
    assert.ok(existsSync(join(root, file)), file);
    const html = read(file);
    assert.equal(meta(html, /<link rel="canonical" href="([^"]+)"/), url);
    assert.equal(meta(html, /<meta property="og:url" content="([^"]+)"/), url);
    const title = meta(html, /<title>([^<]+)<\/title>/);
    const description = meta(html, /<meta name="description" content="([^"]+)"/);
    assert.ok(title.length <= 60, `${file} title is ${title.length} chars`);
    assert.ok(description.length >= 110 && description.length <= 160, `${file} description is ${description.length} chars`);
    assert.ok(!titles.has(title) && !descriptions.has(description), `${file} title and description are unique`);
    titles.add(title);
    descriptions.add(description);
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
    const og = meta(html, /<meta property="og:image" content="([^"]+)"/);
    assert.match(og, /\/assets\/og\/glossary\/[a-z0-9-]+\.jpg$/, `${file} uses a glossary plate, not a screenshot`);
    assert.equal(meta(html, /<meta name="twitter:image" content="([^"]+)"/), og);
    const image = await sharp(join(root, og.replace(SITE, ""))).metadata();
    assert.equal(`${image.width}x${image.height}`, "1200x630");
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${file} has one h1`);
  }
});

test("index JSON-LD has a DefinedTermSet with every published term and reuses site @ids", () => {
  const html = read("glossary/index.html");
  const graph = graphOf(html);
  assert.equal(typed(graph, "Organization")[0]["@id"], ORG_ID);
  assert.equal(typed(graph, "WebSite")[0]["@id"], WEBSITE_ID);
  const set = typed(graph, "DefinedTermSet")[0];
  assert.equal(set["@id"], termSetId(SITE));
  assert.deepEqual(set.hasDefinedTerm.map((t) => t.url).sort(), terms.map((t) => `${SITE}${termPath(t)}`).sort());
  for (const t of set.hasDefinedTerm) assert.equal(t.inDefinedTermSet["@id"], set["@id"]);
  const page = typed(graph, "CollectionPage")[0];
  assert.equal(page.mainEntity["@id"], set["@id"]);
  const crumbs = typed(graph, "BreadcrumbList")[0].itemListElement;
  assert.deepEqual(crumbs.map((c) => c.position), [1, 2]);
  for (const t of terms) assert.match(html, new RegExp(`href="${termPath(t)}"`));
  const letters = [...html.matchAll(/<a href="#letter-([a-z])">/g)].map((m) => m[1]);
  for (const l of letters) assert.match(html, new RegExp(`id="letter-${l}"`));
});

test("term JSON-LD: DefinedTerm in the set, WebPage, BreadcrumbList and an FAQPage that matches the visible FAQ", () => {
  for (const t of terms) {
    const html = read(pageFile(t));
    const url = `${SITE}${termPath(t)}`;
    const graph = graphOf(html);
    assert.equal(typed(graph, "Organization")[0]["@id"], ORG_ID);
    assert.equal(typed(graph, "WebSite")[0]["@id"], WEBSITE_ID);
    const term = typed(graph, "DefinedTerm")[0];
    assert.equal(term["@id"], `${url}#term`);
    assert.equal(term.url, url);
    assert.equal(term.inDefinedTermSet["@id"], termSetId(SITE));
    assert.ok(typed(graph, "DefinedTermSet").some((s) => s["@id"] === termSetId(SITE)));
    const visibleShort = textOf(html.match(/<p class="glossary-answer[^"]*">([\s\S]*?)<\/p>/)[1]);
    assert.equal(term.description, visibleShort, `${t.term} DefinedTerm description matches the visible answer`);
    const page = typed(graph, "WebPage")[0];
    assert.equal(page["@id"], `${url}#webpage`);
    assert.equal(page.mainEntity["@id"], term["@id"]);
    assert.equal(page.isPartOf["@id"], WEBSITE_ID);
    assert.ok(page.citation.length === t.refs.length);
    const crumbs = typed(graph, "BreadcrumbList")[0];
    assert.equal(page.breadcrumb["@id"], crumbs["@id"]);
    assert.deepEqual(crumbs.itemListElement.map((c) => c.item), [`${SITE}/`, `${SITE}${GLOSSARY_PATH}`, url]);
    const faq = typed(graph, "FAQPage");
    assert.equal(faq.length, 1, `${t.term} has one FAQPage`);
    const visible = [...html.match(/<section id="faq"[\s\S]*?<\/section>/)[0].matchAll(/<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/g)]
      .map((m) => ({ q: textOf(m[1]), a: textOf(m[2]) }));
    const marked = faq[0].mainEntity.map((q) => ({ q: q.name, a: q.acceptedAnswer.text }));
    assert.ok(visible.length >= 2);
    assert.deepEqual(marked, visible, `${t.term} FAQPage matches the visible FAQ exactly`);
    for (const q of faq[0].mainEntity) {
      assert.equal(q["@type"], "Question");
      assert.equal(q.acceptedAnswer["@type"], "Answer");
    }
  }
});

test("term pages answer first, use question H2s, and link related terms only when published", () => {
  const published = new Set(terms.map((t) => termPath(t)));
  for (const t of terms) {
    const html = read(pageFile(t));
    const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
    assert.ok(main.indexOf('class="glossary-answer') < main.indexOf("<h2"), `${t.term} definition comes before the first H2`);
    for (const s of t.sections) assert.ok(main.includes(`>${textOf(s.q).replace(/'/g, "\u2019")}</h2>`) || main.includes(`>${s.q}</h2>`), `${t.term} H2 ${s.q}`);
    for (const m of main.matchAll(/href="(\/glossary\/[^"#]+)"/g)) {
      assert.ok(m[1] === GLOSSARY_PATH || published.has(m[1]), `${t.term} links only to published terms: ${m[1]}`);
    }
    const used = main.match(/<section[^>]*glossary-used[\s\S]*?<\/section>/)[0];
    for (const path of t.sources) assert.ok(used.includes(`href="${path}"`), `${t.term} lists ${path}`);
    for (const ref of t.refs) assert.ok(main.includes(`href="${ref.url.replace(/&/g, "&amp;")}"`), `${t.term} cites ${ref.url}`);
    assert.ok(!/\bfree\b/i.test(textOf(main)), `${t.term} page never says free`);
  }
});

function linkContexts(html, href) {
  const tokens = tokenize(html);
  const stack = [];
  const found = [];
  for (const token of tokens) {
    if (token.type !== "tag") continue;
    const m = token.value.match(/^<(\/?)([a-zA-Z0-9]+)/);
    if (!m) continue;
    const name = m[2].toLowerCase();
    if (m[1]) {
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    if (/\/>$/.test(token.value) || ["br", "img", "meta", "link", "input", "source", "hr", "wbr"].includes(name)) continue;
    if (name === "a" && token.value.includes(`href="${href}"`) && token.value.includes("glossary-link")) found.push([...stack]);
    stack.push(name);
  }
  return found;
}

test("each source page links its first prose mention to the term once, never in a heading or another link", () => {
  for (const t of terms) {
    const href = termPath(t);
    for (const path of t.sources) {
      const html = readFileSync(sourceFile(root, path), "utf8");
      const contexts = linkContexts(html, href);
      assert.equal(contexts.length, 1, `${path} links ${t.term} exactly once (found ${contexts.length})`);
      const stack = contexts[0];
      assert.ok(!stack.some((n) => /^h[1-6]$/.test(n) || n === "a"), `${path} link to ${t.term} sits in ${stack.join(">")}`);
      assert.ok(stack.some((n) => ["p", "li", "dd"].includes(n)), `${path} link to ${t.term} sits in prose`);
    }
  }
});

test("linker skips headings, existing links, hidden text and acronym case, and is idempotent", () => {
  const term = { match: ["AI agent", "AI agents", "LLMs"], notMatch: ["^AI agent builder"] };
  const page = (body) => `<main><h2>An AI agent</h2>${body}</main>`;
  const once = linkFirstMention(page('<p class="hq-video__sr">AI agents here</p><p><a href="/x">AI agent</a> and an AI agent builder, then AI agents.</p>'), term, "/glossary/ai-agent/");
  assert.equal((once.match(/glossary-link/g) ?? []).length, 1);
  assert.match(once, /then <a class="glossary-link" href="\/glossary\/ai-agent\/">AI agents<\/a>\./);
  assert.match(once, /<h2>An AI agent<\/h2>/);
  assert.equal(linkFirstMention(once, term, "/glossary/ai-agent/"), once);
  assert.equal(findMention(page("<p>Most llms can read this.</p>"), { match: ["LLMs"], notMatch: [] }), null);
  assert.equal(findMention(page("<p>See llms.txt and the ai-agent tag.</p>"), { match: ["AI agent"], notMatch: [] }), null);
});

test("sitemap, redirects, llms files and the footer include the glossary", () => {
  const sitemap = read("sitemap.xml");
  const redirects = read("_redirects");
  const llms = read("llms.txt");
  const full = read("llms-full.txt");
  for (const path of [GLOSSARY_PATH, ...terms.map(termPath)]) {
    assert.ok(sitemap.includes(`<loc>${SITE}${path}</loc>`), `sitemap has ${path}`);
    assert.ok(redirects.includes(`${path} ${path}index.html 200`), `redirects serve ${path}`);
    assert.ok(redirects.includes(`${path.replace(/\/$/, "")} ${path}index.html 200`), `redirects serve ${path} without a slash`);
    assert.ok(llms.includes(`(${SITE}${path})`), `llms.txt lists ${path}`);
  }
  assert.match(llms, /^## Glossary$/m);
  assert.match(full, /^## Glossary$/m);
  for (const t of terms) assert.ok(full.includes(`${SITE}${termPath(t)}`));
  for (const file of ["index.html", "blog/index.html", "services/index.html", pageFile(terms[0])]) {
    assert.match(read(file), /<nav class="site-foot__links"[\s\S]*?<a href="\/glossary\/">Glossary<\/a>[\s\S]*?<\/nav>/, `${file} footer links the glossary`);
    assert.doesNotMatch(read(file).match(/<nav class="site-nav__links"[\s\S]*?<\/nav>/)?.[0] ?? "", /\/glossary\//, `${file} top nav has no glossary link`);
  }
  for (const t of data.terms.filter((x) => x.status !== "published")) {
    assert.ok(!existsSync(join(root, "glossary", t.slug)), `${t.term} is not published`);
    assert.ok(!sitemap.includes(`/glossary/${t.slug}/`));
  }
});
