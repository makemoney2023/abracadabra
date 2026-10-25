/**
 * Glossary pages: /glossary/ (A to Z plus categories) and /glossary/<slug>/ for each published term.
 * Everything reads content/glossary.json through glossary-data.mjs, so a new batch is a data edit.
 * After the pages are written, linkGlossaryMentions() links the first prose mention of each published
 * term on each of its source pages back to the glossary entry.
 */
import { readFile, writeFile, mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { plateSvg } from "./og-brand.mjs";
import { smartQuotes } from "./typography.mjs";
import { GLOSSARY_PATH, loadGlossary, publishedTerms, termPath } from "./glossary-data.mjs";
import { linkFirstMention, findMention, MAX_GLOSSARY_LINKS_PER_PAGE } from "./glossary-links.mjs";

export const GLOSSARY_CSS = "/assets/glossary.css?v=20261024a";
export const GLOSSARY_INDEX_TITLE = "AI and Search Glossary";
export const GLOSSARY_INDEX_DESCRIPTION = "Plain-English definitions of the AI, search and software terms we use, each checked against primary sources such as Google Search Central and schema.org.";
const READINESS_URL = "https://check.abra-ca-dabra.app/check";

/** Straight quotes become curly once, in the data, so the visible FAQ and the FAQPage JSON-LD stay identical. */
const sq = (text) => smartQuotes(String(text));

export function sourceUrl(SITE, path) {
  return `${SITE}${path}`;
}

/** File on disk for a site path such as /blog/x, /services/y/ or /. */
export function sourceFile(root, path) {
  if (path === "/") return join(root, "index.html");
  if (path.endsWith(".html")) return join(root, path.slice(1));
  return join(root, path.replace(/^\//, "").replace(/\/$/, ""), "index.html");
}

function letterOf(term) {
  const ch = term.term.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : "#";
}

function readinessHref(campaign, placement) {
  const url = new URL(READINESS_URL);
  url.searchParams.set("utm_source", "glossary");
  url.searchParams.set("utm_medium", "cta");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", placement);
  return url.toString();
}

async function writePlate(root, relative, label, title) {
  const file = join(root, relative);
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(plateSvg({ label, title }))).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
}

async function pageTitleOf(root, path) {
  const file = sourceFile(root, path);
  if (!existsSync(file)) throw new Error(`Glossary source page ${path} has no built file`);
  const html = await readFile(file, "utf8");
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
  const title = html.match(/<title>([\s\S]*?)<\/title>/)[1].replace(/\s*\|\s*Abracadabra AI\s*$/, "");
  if (path === "/") return "Abracadabra AI home page";
  // Blog posts read best by their headline; other pages by their <title>, since their h1 is a slogan.
  const text = (path.startsWith("/blog/") && h1 ? h1[1] : title).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || title;
}

/** Other names worth showing: no plurals of a name already listed, no file paths, no repeats. */
export function alternateNames(term) {
  const lower = (x) => x.toLowerCase();
  const names = [term.term !== term.name ? term.term : null, ...term.alternateName].filter(Boolean).filter((a) => !a.startsWith("/"));
  const base = [term.name, ...names].map(lower);
  const out = [];
  for (const a of names) {
    const l = lower(a);
    if (l === lower(term.name) || out.some((o) => lower(o) === l)) continue;
    if (l.endsWith("s") && base.includes(l.slice(0, -1))) continue;
    out.push(a);
  }
  return out;
}

function termNodeId(SITE, term) {
  return `${SITE}${termPath(term)}#term`;
}

export function termSetId(SITE) {
  return `${SITE}${GLOSSARY_PATH}#termset`;
}

function definedTerm(SITE, term, { full = false } = {}) {
  const node = {
    "@type": "DefinedTerm",
    "@id": termNodeId(SITE, term),
    name: sq(term.name),
    description: sq(term.short),
    url: `${SITE}${termPath(term)}`,
    inDefinedTermSet: { "@id": termSetId(SITE) },
  };
  if (full) {
    const alt = alternateNames(term);
    if (alt.length) node.alternateName = alt.map(sq);
  }
  return node;
}

function crumbNode(id, items) {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  };
}

export function faqNode(SITE, term) {
  return {
    "@type": "FAQPage",
    "@id": `${SITE}${termPath(term)}#faq`,
    mainEntity: term.faqs.map((faq) => ({
      "@type": "Question",
      name: sq(faq.question),
      acceptedAnswer: { "@type": "Answer", text: sq(faq.answer) },
    })),
  };
}

function relatedOf(term, bySlug) {
  return term.related.map((slug) => bySlug.get(slug)).filter((t) => t && t.status === "published");
}

function termBody(h, term, bySlug, sourceTitles) {
  const { esc, visibleCrumbs, SITE } = h;
  const related = relatedOf(term, bySlug);
  const alt = alternateNames(term).filter((a) => !term.term.toLowerCase().includes(a.toLowerCase()));
  const crumbs = visibleCrumbs([
    { name: "Home", href: "/" },
    { name: "Glossary", href: GLOSSARY_PATH },
    { name: term.term, href: termPath(term) },
  ]);
  const sections = term.sections.map((section, index) => `<section class="glossary-section" aria-labelledby="q-${index + 1}">
<h2 id="q-${index + 1}">${esc(sq(section.q))}</h2>
${section.a.map((p) => `<p>${esc(sq(p))}</p>`).join("\n")}
</section>`).join("\n");
  const faqs = term.faqs.map((faq) => `<details><summary>${esc(sq(faq.question))}</summary><p>${esc(sq(faq.answer))}</p></details>`).join("");
  const relatedHtml = related.length
    ? `<section class="glossary-section glossary-related" aria-labelledby="related-title">
<h2 id="related-title">Related terms</h2>
<ul class="glossary-cards">${related.map((r) => `<li><a href="${termPath(r)}"><strong>${esc(r.term)}</strong><span>${esc(sq(r.description))}</span></a></li>`).join("")}</ul>
</section>`
    : "";
  const used = `<section class="glossary-section glossary-used" aria-labelledby="used-title">
<h2 id="used-title">Where we use this term</h2>
<ul class="glossary-links">${term.sources.map((path) => `<li><a href="${esc(path)}">${esc(sourceTitles.get(path))}</a></li>`).join("")}</ul>
</section>`;
  const refs = `<section class="glossary-section glossary-refs" aria-labelledby="refs-title">
<h2 id="refs-title">Sources</h2>
<ol>${term.refs.map((ref) => `<li><a href="${esc(ref.url)}" rel="noopener">${esc(ref.title)}</a>. ${esc(ref.publisher)}.${ref.date ? ` <time datetime="${ref.date}">${ref.date}</time>.` : ""}</li>`).join("")}</ol>
<p class="glossary-verified">Definition checked against these sources and our own pages on <time datetime="${term.verified}">${term.verified}</time>.</p>
</section>`;
  return `<main id="top" class="site-page glossary-page glossary-term">
<header class="page-hero page-header glossary-hero">
<div class="page-hero__copy">
${crumbs}
<p class="eyebrow">Glossary · ${esc(term.category)}</p>
<h1>${esc(term.term)}</h1>
<p class="glossary-answer lede">${esc(sq(term.short))}</p>
${alt.length ? `<p class="glossary-alt">Also called: ${alt.map((a) => esc(a)).join(", ")}</p>` : ""}
</div>
</header>
<article class="glossary-article">
<section class="glossary-section glossary-explainer" aria-labelledby="explained-title">
<h2 id="explained-title">${esc(term.term)}, explained</h2>
${term.explainer.map((p) => `<p>${esc(sq(p))}</p>`).join("\n")}
</section>
${sections}
<section id="faq" class="glossary-section faq" aria-labelledby="faq-title">
<h2 id="faq-title">Questions</h2>
<div class="faq-list">${faqs}</div>
</section>
${relatedHtml}
${used}
${refs}
<aside class="cta glossary-cta"><p>Want to know if your business is ready to put AI to work?</p><a class="btn btn--secondary" data-track="readiness_cta_clicked" data-track-slug="glossary-${esc(term.slug)}" data-track-placement="close" href="${esc(readinessHref(`glossary-${term.slug}`, "close"))}">Take the Readiness Check</a><a class="btn btn--tertiary" href="${GLOSSARY_PATH}">All glossary terms <span class="btn__arrow" aria-hidden="true">→</span></a></aside>
</article>
</main>`;
}

function indexBody(h, terms) {
  const { esc, visibleCrumbs } = h;
  const byLetter = new Map();
  for (const term of terms) {
    const letter = letterOf(term);
    if (!byLetter.has(letter)) byLetter.set(letter, []);
    byLetter.get(letter).push(term);
  }
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const jump = `<nav class="glossary-az" aria-label="Glossary A to Z"><ul>${letters.map((l) => (
    byLetter.has(l) ? `<li><a href="#letter-${l.toLowerCase()}">${l}</a></li>` : `<li><span aria-hidden="true">${l}</span></li>`
  )).join("")}</ul></nav>`;
  const groups = [...byLetter.keys()].sort().map((l) => `<section class="glossary-letter" id="letter-${l.toLowerCase()}" aria-labelledby="letter-${l.toLowerCase()}-title">
<h2 id="letter-${l.toLowerCase()}-title">${l}</h2>
<dl class="glossary-list">${byLetter.get(l).map((t) => `<div><dt><a href="${termPath(t)}">${esc(t.term)}</a></dt><dd>${esc(sq(t.short))}</dd></div>`).join("")}</dl>
</section>`).join("\n");
  const categories = [...new Set(terms.map((t) => t.category))].sort();
  const byCategory = `<section class="glossary-categories" aria-labelledby="categories-title">
<h2 id="categories-title">Terms by topic</h2>
<div class="glossary-category-grid">${categories.map((c) => `<div class="glossary-category"><h3>${esc(c)}</h3><ul>${terms.filter((t) => t.category === c).map((t) => `<li><a href="${termPath(t)}">${esc(t.term)}</a></li>`).join("")}</ul></div>`).join("")}</div>
</section>`;
  return `<main id="top" class="site-page glossary-page glossary-index">
<header class="page-hero page-header glossary-hero">
<div class="page-hero__copy">
${visibleCrumbs([{ name: "Home", href: "/" }, { name: "Glossary", href: GLOSSARY_PATH }])}
<p class="eyebrow">Glossary</p>
<h1>${esc(GLOSSARY_INDEX_TITLE)}.</h1>
<p class="lede">${esc(GLOSSARY_INDEX_DESCRIPTION)} Each entry starts with a short answer, then says where we use the term and which sources back it.</p>
</div>
</header>
${jump}
<div class="glossary-groups">
${groups}
</div>
${byCategory}
<aside class="cta glossary-cta"><p>Want to know if your business is ready to put AI to work?</p><a class="btn btn--secondary" data-track="readiness_cta_clicked" data-track-slug="glossary" data-track-placement="close" href="${esc(readinessHref("glossary", "close"))}">Take the Readiness Check</a></aside>
</main>`;
}

/** Write /glossary/ and every published term page. h carries the page shell and helpers from site-pages.mjs. */
export async function renderGlossary(h) {
  const { SITE, root, shell, writePage, orgNode, websiteNode, pageNode, WEBSITE_ID, ORG_ID } = h;
  const data = loadGlossary();
  const terms = publishedTerms(data);
  const bySlug = new Map(data.terms.map((t) => [t.slug, t]));
  await rm(join(root, "glossary"), { recursive: true, force: true });
  await rm(join(root, "assets/og/glossary"), { recursive: true, force: true });
  const indexUrl = `${SITE}${GLOSSARY_PATH}`;
  const setNode = {
    "@type": "DefinedTermSet",
    "@id": termSetId(SITE),
    name: data.set.name,
    description: data.set.description,
    url: indexUrl,
    inLanguage: "en",
    publisher: { "@id": ORG_ID },
    hasDefinedTerm: terms.map((t) => definedTerm(SITE, t)),
  };
  const modified = terms.map((t) => t.verified).sort().at(-1);
  await writePlate(root, "assets/og/glossary/index.jpg", "GLOSSARY", "Plain-English AI and search terms.");
  const indexPage = {
    ...pageNode({ type: "CollectionPage", id: `${indexUrl}#webpage`, url: indexUrl, name: GLOSSARY_INDEX_TITLE, description: GLOSSARY_INDEX_DESCRIPTION, image: `${SITE}/assets/og/glossary/index.jpg`, modified }),
    breadcrumb: { "@id": `${indexUrl}#breadcrumb` },
    mainEntity: { "@id": termSetId(SITE) },
  };
  await writePage("glossary/index.html", shell({
    title: `${GLOSSARY_INDEX_TITLE} | Abracadabra AI`,
    description: GLOSSARY_INDEX_DESCRIPTION,
    canonical: indexUrl,
    robots: "index,follow,max-image-preview:large",
    ogImage: `${SITE}/assets/og/glossary/index.jpg`,
    ogWidth: "1200",
    ogHeight: "630",
    ogAlt: "Glossary: plain-English AI and search terms, Abracadabra AI",
    extraHead: `<link rel="stylesheet" href="${GLOSSARY_CSS}">\n`,
    json: {
      "@context": "https://schema.org",
      "@graph": [orgNode(), websiteNode(), indexPage, setNode, crumbNode(`${indexUrl}#breadcrumb`, [
        { name: "Home", url: `${SITE}/` },
        { name: "Glossary", url: indexUrl },
      ])],
    },
    body: indexBody(h, terms),
  }));
  for (const term of terms) {
    const url = `${SITE}${termPath(term)}`;
    const sourceTitles = new Map();
    for (const path of term.sources) sourceTitles.set(path, await pageTitleOf(root, path));
    const og = `assets/og/glossary/${term.slug}.jpg`;
    await writePlate(root, og, "GLOSSARY", term.term);
    const page = {
      ...pageNode({ type: "WebPage", id: `${url}#webpage`, url, name: sq(term.question), description: sq(term.description), image: `${SITE}/${og}`, modified: term.verified }),
      datePublished: term.verified,
      breadcrumb: { "@id": `${url}#breadcrumb` },
      mainEntity: { "@id": termNodeId(SITE, term) },
      about: { "@id": termNodeId(SITE, term) },
      citation: term.refs.map((ref) => ({ "@type": "CreativeWork", name: ref.title, url: ref.url, publisher: { "@type": "Organization", name: ref.publisher } })),
      relatedLink: relatedOf(term, bySlug).map((r) => `${SITE}${termPath(r)}`),
    };
    if (!page.relatedLink.length) delete page.relatedLink;
    const graph = [
      orgNode(),
      websiteNode(),
      page,
      definedTerm(SITE, term, { full: true }),
      { "@type": "DefinedTermSet", "@id": termSetId(SITE), name: data.set.name, url: indexUrl },
      crumbNode(`${url}#breadcrumb`, [
        { name: "Home", url: `${SITE}/` },
        { name: "Glossary", url: indexUrl },
        { name: term.term, url },
      ]),
      faqNode(SITE, term),
    ];
    await writePage(`glossary/${term.slug}/index.html`, shell({
      title: `${sq(term.question)} | Abracadabra AI`,
      description: sq(term.description),
      canonical: url,
      robots: "index,follow,max-image-preview:large",
      ogImage: `${SITE}/${og}`,
      ogWidth: "1200",
      ogHeight: "630",
      ogAlt: `Glossary: ${term.term}, Abracadabra AI`,
      extraHead: `<link rel="stylesheet" href="${GLOSSARY_CSS}">\n`,
      json: { "@context": "https://schema.org", "@graph": graph },
      body: termBody(h, term, bySlug, sourceTitles),
    }));
  }
  return terms;
}

/**
 * Link the first prose mention of each published term on each of its source pages.
 * Throws when a listed source page no longer mentions the term, so the data stays true.
 */
export async function linkGlossaryMentions(root) {
  const terms = publishedTerms();
  const changed = new Map();
  for (const term of terms) {
    for (const path of term.sources) {
      const file = sourceFile(root, path);
      const html = changed.get(file) ?? (await readFile(file, "utf8"));
      const href = termPath(term);
      const next = linkFirstMention(html, term, href);
      if (next === html && !html.includes(`href="${href}"`)) {
        throw new Error(`Glossary: ${path} is listed as a source for ${term.term} but has no linkable mention`);
      }
      changed.set(file, next);
    }
  }
  for (const [file, html] of changed) {
    const count = (html.match(/class="glossary-link"/g) ?? []).length;
    if (count > MAX_GLOSSARY_LINKS_PER_PAGE) throw new Error(`Glossary: ${file} would carry ${count} glossary links (cap ${MAX_GLOSSARY_LINKS_PER_PAGE}); drop it from a term's sources`);
    await writeFile(file, html);
  }
  return changed.size;
}

/** Sitemap entries for the glossary, inside the generated site-urls block. */
export function glossarySitemapPaths() {
  const terms = publishedTerms();
  const modified = terms.map((t) => t.verified).sort().at(-1);
  return [[GLOSSARY_PATH, modified], ...terms.map((t) => [termPath(t), t.verified])];
}

export { findMention };
