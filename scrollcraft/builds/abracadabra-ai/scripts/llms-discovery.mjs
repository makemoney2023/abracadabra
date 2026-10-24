/**
 * Build llms.txt and llms-full.txt for answer engines (llmstxt.org).
 * Output has no HTML comments, no <!--image:--> / <!--cta:--> placeholders,
 * and no unresolved [^footnote] markers. List entries are markdown links.
 */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cases, course, offerings, products } from "./site-data.mjs";
import { salesPages } from "./service-sales.mjs";
import { publishedTerms, termPath } from "./glossary-data.mjs";

/** Published glossary terms as markdown links, A to Z. */
export function glossaryLines() {
  return publishedTerms().map((term) => mdEntry(term.term, `${SITE}${termPath(term)}`, term.short));
}

function glossaryFullBlocks() {
  return publishedTerms()
    .map((term) => `### ${term.term}\n\n${term.short}\n\n${term.explainer.join("\n\n")}\n\n${SITE}${termPath(term)}`)
    .join("\n\n");
}

export const SITE = "https://abra-ca-dabra.app";

const CONTACT = "houdini@abra-ca-dabra.app";
const COURSE_URL = "https://learn.abra-ca-dabra.app";
const MAX_POST_CHARS = 7000;

/** Sentence-case label from a URL slug; keep common acronyms uppercase. */
export function slugLabel(slug) {
  const acronyms = new Set(["ai", "mcp", "llm", "crm", "erp", "seo", "aeo", "geo", "api"]);
  return slug
    .split("-")
    .map((word, index) => {
      if (acronyms.has(word)) return word.toUpperCase();
      if (index === 0) return word.charAt(0).toUpperCase() + word.slice(1);
      return word;
    })
    .join(" ");
}

export function mdEntry(title, url, note) {
  const cleanNote = String(note ?? "").replace(/\s+/g, " ").trim().replace(/\.$/, "");
  return cleanNote ? `- [${title}](${url}): ${cleanNote}.` : `- [${title}](${url})`;
}

/** Strip build markers and resolve [^id] footnotes using post.citations. */
export function cleanPostBody(post, { maxChars = MAX_POST_CHARS } = {}) {
  let body = String(post.body ?? "");
  body = body.replace(/<!--\s*image:\d+\s*-->/gi, "");
  body = body.replace(/<!--\s*cta:inline\s*-->/gi, "");
  body = body.replace(/<!--[\s\S]*?-->/g, "");
  body = body.replace(/\[\^([a-z0-9-]+)\]/g, (_, id) => {
    const citation = (post.citations ?? []).find((row) => row.id === id);
    if (!citation) return "";
    const year = citation.datePublished ? citation.datePublished.slice(0, 4) : "";
    return year ? ` (${citation.publisher}, ${year})` : ` (${citation.publisher})`;
  });
  body = body.replace(/\]\((\/[^)]+)\)/g, `](${SITE}$1)`);
  body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (maxChars && body.length > maxChars) {
    const cut = body.slice(0, maxChars);
    const at = Math.max(cut.lastIndexOf("\n\n"), cut.lastIndexOf(". "));
    body = `${(at > maxChars * 0.6 ? cut.slice(0, at + 1) : cut).trim()}\n\n… Full post: ${SITE}/blog/${post.slug}`;
  }
  return body;
}

export function postSourcesList(post) {
  const used = new Set();
  for (const match of String(post.body ?? "").matchAll(/\[\^([a-z0-9-]+)\]/g)) used.add(match[1]);
  const rows = (post.citations ?? []).filter((citation) => used.has(citation.id));
  if (!rows.length) return "";
  return `Sources\n${rows
    .map((citation, index) => {
      const when = citation.datePublished ? `, ${citation.datePublished}` : "";
      return `${index + 1}. ${citation.title} — ${citation.publisher}${when} — ${citation.url}`;
    })
    .join("\n")}`;
}

function analyzeShape(text) {
  const trimmed = text.trim();
  return {
    hasH1: /^#\s+\S+/m.test(trimmed),
    hasBlockquote: /^>\s+\S+/m.test(trimmed),
    hasMdLink: /^-\s+\[[^\]]+\]\(https?:\/\/[^)]+\)/m.test(trimmed),
  };
}

export function isUsefulLlms(text) {
  const shape = analyzeShape(text);
  return shape.hasH1 && shape.hasBlockquote && shape.hasMdLink;
}

function proofFacts() {
  return [
    "From near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days for pirx.ca.",
    "Google Search Console, Jul 18 to Oct 17, 2026: 398K search impressions, 1.94K clicks, average position 7.6.",
    "The Generative AI features report is a separate count (46.5K impressions) and is not added to the search total.",
    "Top pages in that AI-features report: good-10k-time-by-age 11,068; good-half-marathon-time-by-age 8,192; good-5k-time-by-age 6,728.",
    "Both curves start near zero in mid-July, step up around Aug 31, and reach daily peaks of about 12–18K (search) and about 1.2–1.8K (AI features) by mid-September.",
    "Search impressions and AI-feature impressions are separate reports. These counts are indexed demand, not a traffic or revenue result.",
  ].join(" ");
}

function buildLlmsTxt({ posts, updated }) {
  const live = posts.filter((post) => post.live !== false);
  const serviceLines = [
    mdEntry("Services", `${SITE}/services/`, "Menu of AI and software services built around how you already work"),
    ...offerings.map((item) => {
      const page = salesPages[item.slug];
      return mdEntry(slugLabel(item.slug), `${SITE}/services/${item.slug}/`, page.headline.replace(/\.$/, ""));
    }),
  ];
  const portfolioLines = [
    mdEntry("Portfolio", `${SITE}/portfolio/`, "Named systems the studio has shipped"),
    ...cases.map((item) => mdEntry(item.name, `${SITE}/portfolio/${item.slug}/`, item.summary)),
  ];
  const productLines = [
    mdEntry("Products", `${SITE}/products/`, "Schema, the LLM Leverage course and HQ"),
    ...products.map((item) => mdEntry(item.name, `${SITE}/products/${item.slug}/`, item.description)),
    mdEntry("How client work moves through HQ", `${SITE}/blog/how-client-work-flows-through-hq`, "How a request becomes a card, agents build, Client Services reviews, and you approve before anything is released"),
    mdEntry("What is an AI agent?", `${SITE}/blog/what-is-an-ai-agent`, "A plain answer for owners, and how digital workers fit in"),
    mdEntry(course.name, `${SITE}/course/${course.slug}/`, course.description),
    mdEntry("LLM Leverage course (learn)", COURSE_URL, "Self-paced course for better answers from any model"),
  ];
  const pageLines = [
    mdEntry("Home", `${SITE}/`, "Studio overview and how a project starts"),
    mdEntry("Walkthrough", `${SITE}/walkthrough.html`, "One continuous flight through Schema and LLM Leverage"),
    mdEntry("Films", `${SITE}/films.html`, "Live captures of Schema and LLM Leverage, plus Super Funnel associate tours"),
    mdEntry("Blog", `${SITE}/blog`, "Notes with named sources; listed only on or after publish date"),
    mdEntry("About", `${SITE}/about/`, "Who we are and how we work"),
    mdEntry("Privacy", `${SITE}/privacy`, "How we handle information"),
    mdEntry("Start a project", `${SITE}/start/`, `Write houdini@ or use the form; contact ${CONTACT}`),
    mdEntry("Readiness Check", "https://check.abra-ca-dabra.app/check", "Five-to-seven-minute score of pressure, readiness, growth, and site visibility"),
    mdEntry("Schema", "https://schema.abra-ca-dabra.app/", "Scores how visible a site is to answer engines and generates the repair"),
  ];
  const shippedLines = [
    mdEntry("Milrcorr", "https://milrcorr.com", "Public site for StrongFoam's sister commercial fit-out work; request an estimate"),
    mdEntry("PIRX", `${SITE}/portfolio/pirx/`, "Runner app at pirx.ca with Projected Time, Supported Range, and five Structural Drivers; athletic estimates, not medical advice"),
    mdEntry("StrongFoam", "https://strongfoam.com/", "Public site with an estimate a visitor can start and a booking"),
    mdEntry("Schema", "https://schema.abra-ca-dabra.app/", "AI visibility score and repair"),
    mdEntry("LLM Leverage", COURSE_URL, "Self-paced course plus a workshop path"),
    mdEntry("Super Funnel System", `${SITE}/portfolio/super-funnel/`, "SuperPatch field app: one shared link becomes a credited lead and a nine-step pipeline; case study with eight film tours"),
  ];
  const blogLines = live.length
    ? live.map((post) => mdEntry(post.title, `${SITE}/blog/${post.slug}`, post.description))
    : ["- No post is public on this date. Scheduled notes stay out of this list until datePublished."];

  return `# Abracadabra AI

> We design, build and run AI-powered tools that fit your business, not the other way around.

Abracadabra AI turns a description of how you already work into production software. AI takes a task; a person stays where the relationship matters. Contact ${CONTACT}. Site ${SITE}/. Last updated: ${updated}.

## What we build

Software follows the steps, exceptions, and words you already use. Eight functions (Search & AI visibility, Marketing, Social media, Sales, Customer service, Operations, Design, and Platform) start from one written plan so later work runs together. AEO, GEO, and SEO run as one discipline. MCP connectors on Cloudflare let assistants use your tools with sign-in, permissions, and approval before any change. Each project leaves you with the live system, the film, and the words to show it.

Wellness and clinical-style tools the studio builds are non-diagnostic: they educate and route; they do not diagnose.

## Proof: pirx.ca

${proofFacts()}

## Services

${serviceLines.join("\n")}

## Portfolio

${portfolioLines.join("\n")}

## Products and course

${productLines.join("\n")}

## Shipped systems

${shippedLines.join("\n")}

## How a project works

1. You describe the work in your own words: the steps, the exceptions, and the sentence a good rep already says.
2. We build the software around those steps. AI removes a task. A person stays where the relationship matters.
3. You leave with the live system, the film, and the words.

When a product already on the market does the job, the reply says so and points there.

## Pages

${pageLines.join("\n")}

## Glossary

${mdEntry("Glossary", `${SITE}/glossary/`, "Plain-English definitions of AI and search terms, each checked against primary sources")}
${glossaryLines().join("\n")}

## Blog

${blogLines.join("\n")}

## Optional

${mdEntry("llms-full.txt", `${SITE}/llms-full.txt`, "Longer overview, services, portfolio, products, how a project works, proof detail, and full blog posts")}
`;
}

function buildLlmsFullTxt({ posts, updated }) {
  const live = posts.filter((post) => post.live !== false);
  const serviceBlocks = offerings
    .map((item) => {
      const page = salesPages[item.slug];
      return `### ${slugLabel(item.slug)}\n\n${page.description}\n\n${SITE}/services/${item.slug}/`;
    })
    .join("\n\n");
  const portfolioBlocks = cases
    .map((item) => {
      const body = (item.body ?? []).join(" ");
      return `### ${item.name}\n\n${item.summary}${body ? ` ${body}` : ""}\n\n${SITE}/portfolio/${item.slug}/`;
    })
    .join("\n\n");
  const productBlocks = [
    ...products.map(
      (item) => `### ${item.name}\n\n${item.llmsBody ?? item.description}\n\n${SITE}/products/${item.slug}/`,
    ),
    `### ${course.name}\n\n${course.description}\n\n${COURSE_URL}\nAlso listed at ${SITE}/course/${course.slug}/`,
  ].join("\n\n");

  const postBlocks = live.length
    ? live
        .map((post) => {
          const body = cleanPostBody(post);
          const sources = postSourcesList(post);
          return `## ${post.title}\n\n${SITE}/blog/${post.slug}\n\n${post.description}\n\n${body}${sources ? `\n\n${sources}` : ""}`;
        })
        .join("\n\n")
    : "No live posts.";

  return `# Abracadabra AI

> We design, build and run AI-powered tools that fit your business, not the other way around.

Full site text for answer engines. Generated ${updated}. Contact ${CONTACT}.

## Index

${mdEntry("llms.txt", `${SITE}/llms.txt`, "Short quotable index with markdown page links")}
${mdEntry("Home", `${SITE}/`, "Studio overview")}
${mdEntry("Services", `${SITE}/services/`, "Service menu")}
${mdEntry("Portfolio", `${SITE}/portfolio/`, "Named shipped systems")}
${mdEntry("Products", `${SITE}/products/`, "Schema, the LLM Leverage course and HQ")}
${mdEntry("Blog", `${SITE}/blog`, "Notes with named sources")}
${mdEntry("Glossary", `${SITE}/glossary/`, "Plain-English AI and search terms with sources")}

## Overview

Abracadabra AI designs, builds and runs AI-powered tools that fit how a business already works. The studio ships working systems, not slide decks. A description of the work becomes production software. The calendar gets shorter because the plan is written first and later work runs at the same time; the work does not shrink, the waiting between the work does. The studio does not publish a duration or a percentage for that.

The name Abracadabra, traced far enough, is Aramaic, roughly "avra kadavra": I will create as I speak.

AEO (answer engines), GEO (generative engines), and SEO (classic search) run as one discipline. The studio maps questions buyers ask, publishes direct answers with evidence, connects page, entity, schema, and source signals, then measures indexed demand, clicks, and observed AI-search visibility. Placement is not guaranteed.

## Services

${serviceBlocks}

## Portfolio

${portfolioBlocks}

## Products and course

${productBlocks}

## How a project works

1. You describe the work in your own words: the steps, the exceptions, and the sentence a good rep already says.
2. We build the software around those steps. AI removes a task. A person stays where the relationship matters.
3. You leave with the live system, the film, and the words.

When a product already on the market does the job, the reply says so and points there.

Primary action: Start a project (${CONTACT}). Secondary: See what we've built (${SITE}/#work). Readiness Check: https://check.abra-ca-dabra.app/check. Schema: https://schema.abra-ca-dabra.app/.

## Proof: pirx.ca

${proofFacts()}

Also shipped, named when the client allows: clinical-style assessments (non-diagnostic; they educate and route, they do not diagnose), direct-sales floors, coaching agents, signed agreements, fraud review on live orders, and the pirx.ca Search Console record dated above. The list is a sample of what shipped, not a ceiling on what the studio will take on.

## Glossary

Each definition was checked against primary sources on the date shown on its page.

${glossaryFullBlocks()}

## Blog posts

Only posts with datePublished on or before ${updated} are included.

${postBlocks}
`;
}

export function buildDiscoveryFiles({ posts, updated }) {
  const withLive = posts.map((post) => ({
    ...post,
    live: post.live === true || post.live === false ? post.live : undefined,
  }));
  // Caller passes already-filtered live posts, or full list with isPublic applied.
  const llmsTxt = buildLlmsTxt({ posts: withLive, updated });
  const llmsFullTxt = buildLlmsFullTxt({ posts: withLive, updated });
  if (!isUsefulLlms(llmsTxt)) throw new Error("llms.txt failed usefulness check (H1, blockquote, markdown link)");
  if (!isUsefulLlms(llmsFullTxt)) throw new Error("llms-full.txt failed usefulness check (H1, blockquote, markdown link)");
  for (const [name, text] of [
    ["llms.txt", llmsTxt],
    ["llms-full.txt", llmsFullTxt],
  ]) {
    if (/<!--/.test(text)) throw new Error(`${name} still contains an HTML comment`);
    if (/\[\^[a-z0-9-]+\]/.test(text)) throw new Error(`${name} still contains a footnote marker`);
    if (/<!--\s*image:|<!--\s*cta:/i.test(text)) throw new Error(`${name} still contains a placeholder`);
  }
  return { llmsTxt, llmsFullTxt, updated };
}

export async function writeDiscoveryFiles(root, posts, { updated, isPublicFn } = {}) {
  if (!updated) throw new Error("writeDiscoveryFiles requires updated (YYYY-MM-DD)");
  const live = isPublicFn
    ? posts.map((post) => ({ ...post, live: isPublicFn(post) })).filter((post) => post.live)
    : posts;
  const { llmsTxt, llmsFullTxt } = buildDiscoveryFiles({ posts: live, updated });
  await writeFile(join(root, "llms.txt"), llmsTxt.endsWith("\n") ? llmsTxt : `${llmsTxt}\n`);
  await writeFile(join(root, "llms-full.txt"), llmsFullTxt.endsWith("\n") ? llmsFullTxt : `${llmsFullTxt}\n`);
  return { updated, bytes: { llms: llmsTxt.length, full: llmsFullTxt.length } };
}
