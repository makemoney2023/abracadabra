import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import sharp from "sharp";
import { z } from "zod";
import { headLinks, siteFooter, siteHeader } from "./site-chrome.mjs";
import { smartQuotesHtml } from "./typography.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const SITE = "https://abra-ca-dabra.app";
export const CHECK = "https://check.abra-ca-dabra.app/check";
/** House byline. Change it here and every byline, author box, meta author, and JSON-LD author follows. */
export const AUTHOR = { name: "Abracadabra Studio", url: "https://abra-ca-dabra.app", id: `${SITE}/#studio` };
export const AUTHOR_ID = AUTHOR.id;
export const ORG_ID = `${SITE}/#org`;
export const WEBSITE_ID = `${SITE}/#website`;

const imageSchema = z.object({
  src: z.string().regex(/^\/blog\/media\/[a-z0-9-]+\/0[123]\.(?:png|webp)$/),
  file: z.string().regex(/^[a-z0-9-]+\.jpg$/),
  alt: z.string().min(12),
  caption: z.string().min(8).optional(),
  prompt: z.string().min(40),
});

const citationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(8),
  url: z.string().url(),
  publisher: z.string().min(2),
  datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  figures: z.array(z.string().regex(/^\d+(?:\.\d+)?$/)).default([]),
});

export const postSchema = z.object({
  title: z.string().min(12).max(70),
  description: z.string().min(110).max(165),
  datePublished: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateModified: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pillar: z.string().min(3),
  cluster: z.string().min(3),
  primaryQuery: z.string().min(8),
  author: z.literal("abracadabra-studio"),
  cta: z.string().min(12),
  images: z.array(imageSchema).length(3),
  faqs: z.array(z.object({
    question: z.string().min(12),
    answer: z.string().min(40),
  })).min(3),
  citations: z.array(citationSchema).min(1),
});

export const BANNED = [
  /\bstreamline\b/i,
  /\bleverage\b/i,
  /\binnovative\b/i,
  /\btransformational\b/i,
  /magic with no system behind it/i,
];

export const FORBIDDEN_CLAIMS = [
  "95.4",
  "60–80",
  "60-80",
  "$4k",
  "$22k",
  "80,000",
  "80000",
  "10+ hours",
  "1,000+ tests",
  "under 500ms",
];

marked.setOptions({ gfm: true, breaks: false });

export function asOf() {
  return process.env.BLOG_AS_OF || new Date().toISOString().slice(0, 10);
}

export function previewMode() {
  return process.env.BLOG_PREVIEW === "1";
}

export function isPublic(post, day = asOf()) {
  return previewMode() || post.datePublished <= day;
}

function publicRobots(value) {
  return previewMode() ? "noindex,nofollow" : value;
}

export function ctaHref(slug, placement) {
  const url = new URL(CHECK);
  url.searchParams.set("utm_source", "blog");
  url.searchParams.set("utm_medium", "cta");
  url.searchParams.set("utm_campaign", slug);
  url.searchParams.set("utm_content", placement);
  return url.toString();
}

export function numberTokens(text) {
  const stripped = text.replace(/https?:\/\/\S+/g, " ");
  return [...stripped.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)]
    .map((match) => match[0].replace(/,/g, ""));
}

export function allowedFigures(post) {
  return new Set(post.citations.flatMap((citation) => citation.figures));
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function escXml(value) {
  return esc(value);
}

function jsonLd(data) {
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

function wrap(text, width) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

function ogSvg(title, eyebrow) {
  const lines = wrap(title, 26);
  const tspans = lines.map((line, index) => (
    `<tspan x="72" dy="${index === 0 ? 0 : 62}">${escXml(line)}</tspan>`
  )).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#070706" stop-opacity="0.94"/>
      <stop offset="0.58" stop-color="#070706" stop-opacity="0.82"/>
      <stop offset="1" stop-color="#070706" stop-opacity="0.28"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="#070706"/>
  <rect width="1200" height="630" fill="url(#scrim)"/>
  <rect x="72" y="72" width="96" height="8" fill="#FF4B24"/>
  <text x="72" y="124" fill="#8DEBF2" font-family="IBM Plex Sans, DejaVu Sans, sans-serif" font-size="22" font-weight="500">${escXml(eyebrow)}</text>
  <text x="72" y="210" fill="#F5F0E8" font-family="Inter Tight, DejaVu Sans, sans-serif" font-size="48" font-weight="700">${tspans}</text>
  <text x="72" y="566" fill="#AAA49A" font-family="IBM Plex Sans, DejaVu Sans, sans-serif" font-size="22">abra-ca-dabra.app</text>
</svg>`;
}

const HERO_WIDTH = 1280;
const HERO_HEIGHT = 720;

function imageSize(image) {
  return image.src.endsWith(".webp")
    ? { width: HERO_WIDTH, height: HERO_HEIGHT }
    : { width: 1600, height: 900 };
}

function picture(image) {
  const { width, height } = imageSize(image);
  const fallback = image.src.endsWith(".webp") ? image.src.replace(/\.webp$/, ".jpg") : image.src;
  const img = `<img src="${esc(fallback)}" alt="${esc(image.alt)}" width="${width}" height="${height}">`;
  if (!image.src.endsWith(".webp")) return img;
  return `<picture><source srcset="${esc(image.src)}" type="image/webp">${img}</picture>`;
}

async function writeOg(title, eyebrow, dest, photo) {
  const plate = join(root, "content/images/og-plate.jpg");
  const base = photo && existsSync(photo)
    ? await sharp(photo).resize(1200, 630, { fit: "cover", position: "centre" }).png().toBuffer()
    : existsSync(plate)
    ? await sharp(plate).resize(1200, 630, { fit: "cover", position: "right" }).png().toBuffer()
    : await sharp({
      create: { width: 1200, height: 630, channels: 3, background: "#070706" },
    }).png().toBuffer();
  await mkdir(dirname(dest), { recursive: true });
  await sharp(base)
    .composite([{ input: Buffer.from(ogSvg(title, eyebrow)) }])
    .jpeg({ quality: 80 })
    .toFile(dest);
  const meta = await sharp(dest).metadata();
  if (meta.width !== 1200 || meta.height !== 630) {
    throw new Error(`${dest} is ${meta.width}x${meta.height}, expected 1200x630`);
  }
}

function figure(image, kind = "inline") {
  const caption = image.caption ? `<figcaption>${esc(image.caption)}</figcaption>` : "";
  const cls = kind === "hero" ? "content-hero-photo" : "post-figure";
  return `<figure class="${cls}">${picture(image)}${caption}</figure>`;
}

function headingId(html) {
  const text = html.replace(/<[^>]+>/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return text || "section";
}

function decorateProse(html) {
  html = html.replace(/<p>([^<]{24,}?[.!?])(\s)/, "<p><strong>$1</strong>$2");
  html = html.replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => `<h2 id="${headingId(inner)}">${inner}</h2>`);
  html = html.replace(/<table>[\s\S]*?<\/table>/g, (table) => `<div class="extraction-table">${table}</div>`);
  return html;
}

function statCallout(post) {
  const text = post.body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\^[^\]]+\]/g, "");
  const match = text.match(/[^.!\n]{0,180}\d{1,3}%[^.!\n]{0,180}/);
  if (!match) return "";
  const sentence = match[0].replace(/\s+/g, " ").trim();
  const value = sentence.match(/\d{1,3}%/)[0];
  return `<figure class="key-stat"><dl><dt>Cited in this note</dt><dd>${esc(value)}</dd></dl><figcaption>${esc(sentence)}</figcaption></figure>`;
}

function tocFrom(html) {
  const heads = [...html.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)];
  const items = heads.map(([, id, inner]) => `<li><a href="#${id}">${inner.replace(/<[^>]+>/g, "")}</a></li>`).join("");
  const list = `<p>On this page</p><ol>${items}<li><a href="#faq">Questions</a></li><li><a href="#sources">Sources</a></li></ol>`;
  return `<nav class="toc post-toc" aria-label="On this page"><details class="toc__sheet"><summary>On this page</summary>${list}</details><div class="toc__rail">${list}</div></nav>`;
}

const FEATURED_SLUG = "ai-readiness-assessment";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

function readingMinutes(post) {
  const words = post.body.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function cardMeta(post) {
  const minutes = readingMinutes(post);
  const label = minutes === 1 ? "1 min read" : `${minutes} min read`;
  return `<span class="card-meta"><time datetime="${esc(post.datePublished)}">${esc(formatDate(post.datePublished))}</time><span aria-hidden="true">·</span><span>${label}</span></span>`;
}

function pillarId(pillar) {
  return `pillar-${pillar.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function postCard(post) {
  return `<li data-pillar="${esc(post.pillar)}"><a href="/blog/${post.slug}"><span class="post-card-photo">${picture(post.images[0])}</span><span class="kicker">${esc(post.pillar)}</span><strong>${esc(post.title)}</strong><span class="card-dek">${esc(post.description)}</span>${cardMeta(post)}</a></li>`;
}

function featuredPost(post) {
  return `<a class="featured-post" data-pillar="${esc(post.pillar)}" href="/blog/${post.slug}"><span class="featured-photo">${picture(post.images[0])}</span><span class="featured-copy"><span class="kicker">Featured · ${esc(post.pillar)}</span><strong>${esc(post.title)}</strong><span class="card-dek">${esc(post.description)}</span>${cardMeta(post)}</span></a>`;
}

function pillarFilter(posts) {
  const pillars = [...new Set(posts.map((post) => post.pillar))].sort((a, b) => a.localeCompare(b));
  const controls = [
    `<input type="radio" name="pillar" id="pillar-all" checked>`,
    `<label for="pillar-all">All</label>`,
    ...pillars.flatMap((pillar) => {
      const id = pillarId(pillar);
      return [
        `<input type="radio" name="pillar" id="${id}">`,
        `<label for="${id}">${esc(pillar)}</label>`,
      ];
    }),
  ].join("");
  const rules = pillars.map((pillar) => {
    const id = pillarId(pillar);
    const value = pillar.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    return `.blog-index:has(#${id}:checked) .featured-post:not([data-pillar="${value}"]),.blog-index:has(#${id}:checked) .cards > li:not([data-pillar="${value}"]){display:none}`;
  }).join("");
  return `<fieldset class="pillar-filter"><legend>Filter by topic</legend>${controls}</fieldset><style>${rules}</style>`;
}

function authorBox() {
  return `<aside class="author-box"><p class="kicker">Author</p><h2>${esc(AUTHOR.name)}</h2><p>The notes are written by the people who design, build and run AI-powered tools at Abracadabra. Every number names its source.</p><a href="/about/">About us</a></aside>`;
}

function renderMarkdown(post) {
  let body = post.body;
  const used = [];
  body = body.replace(/\[\^([a-z0-9-]+)\]/g, (_, id) => {
    if (!post.citations.some((citation) => citation.id === id)) {
      throw new Error(`${post.slug} cites unknown source ${id}`);
    }
    if (!used.includes(id)) used.push(id);
    const n = used.indexOf(id) + 1;
    return `<sup><a href="#source-${id}">${n}</a></sup>`;
  });
  for (const citation of post.citations) {
    if (!used.includes(citation.id)) {
      throw new Error(`${post.slug} never references citation ${citation.id}`);
    }
  }
  let html = marked.parse(body);
  html = html.replace("<!--image:2-->", figure(post.images[1]));
  html = html.replace("<!--image:3-->", figure(post.images[2]));
  if (html.includes("<!--image:")) {
    throw new Error(`${post.slug} has an image marker that was not replaced`);
  }
  if (!html.includes("<!--cta:inline-->")) {
    throw new Error(`${post.slug} is missing the inline CTA marker`);
  }
  html = html.replace("<!--cta:inline-->", ctaBlock(post, "inline"));
  return decorateProse(html);
}

function ctaBlock(post, placement) {
  const href = ctaHref(post.slug, placement);
  const label = placement === "sticky" ? "Take the Readiness Check" : "Run the Readiness Check";
  const primary = placement === "close"
    ? `<a class="btn btn--primary" href="/start/">Start a project</a>`
    : "";
  return `<aside class="cta cta-${placement}"><p>${esc(post.cta)}</p>${primary}<a class="btn btn--secondary" data-track="readiness_cta_clicked" data-track-slug="${esc(post.slug)}" data-track-placement="${placement}" href="${esc(href)}">${label}</a></aside>`;
}

function relatedPosts(post, posts) {
  return posts
    .filter((other) => other.slug !== post.slug)
    .sort((a, b) => {
      const score = (item) => (item.pillar === post.pillar ? 0 : item.cluster === post.cluster ? 1 : 2);
      return score(a) - score(b) || a.datePublished.localeCompare(b.datePublished);
    })
    .slice(0, 3);
}

function graphForPost(post, htmlPath) {
  const url = `${SITE}/blog/${post.slug}`;
  const images = post.images.map((image) => {
    const { width, height } = imageSize(image);
    return {
      "@type": "ImageObject",
      url: `${SITE}${image.src}`,
      width,
      height,
      caption: image.alt,
    };
  });
  return {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(),
      websiteNode(),
      authorNode(),
      {
        "@type": "BlogPosting",
        "@id": `${url}#post`,
        headline: post.title,
        description: post.description,
        datePublished: post.datePublished,
        dateModified: post.dateModified,
        mainEntityOfPage: url,
        url,
        inLanguage: "en",
        keywords: post.primaryQuery,
        articleSection: post.pillar,
        image: images,
        author: { "@id": AUTHOR_ID },
        publisher: { "@id": ORG_ID },
        citation: post.citations.map((citation) => ({
          "@type": "CreativeWork",
          name: citation.title,
          url: citation.url,
          publisher: { "@type": "Organization", name: citation.publisher },
          ...(citation.datePublished ? { datePublished: citation.datePublished } : {}),
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
          { "@type": "ListItem", position: 3, name: post.title, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: post.faqs.map((faq) => ({
          "@type": "Question",
          name: faq.question,
          acceptedAnswer: { "@type": "Answer", text: faq.answer },
        })),
      },
    ],
  };
}

function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "Abracadabra AI",
    url: `${SITE}/`,
    email: "houdini@abra-ca-dabra.app",
    slogan: "From thought to working software",
  };
}

function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: `${SITE}/`,
    name: "Abra-ca-dabra",
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };
}

function authorNode() {
  return {
    "@type": "Organization",
    "@id": AUTHOR_ID,
    name: AUTHOR.name,
    url: AUTHOR.url,
    parentOrganization: { "@id": ORG_ID },
  };
}

function pageShell({ title, description, canonical, robots, ogImage, ogAlt, ogType, json, body }) {
  return smartQuotesHtml(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="author" content="${esc(AUTHOR.name)}">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Abracadabra AI">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta name="twitter:image:alt" content="${esc(ogAlt)}">
${headLinks()}
<link rel="stylesheet" href="/blog/blog.css?v=20261019b">
<script type="application/ld+json">
${jsonLd(json)}
</script>
</head>
<body>
${siteHeader()}
${previewMode() ? `<p class="preview-banner">Preview build. Scheduled notes are included here so they can be reviewed before their publish date. Search engines are asked not to index this copy.</p>` : ""}
${body}
${siteFooter()}
</body>
</html>
`);
}

function crumbs(items) {
  const html = items.map((item, index) => (
    index === items.length - 1
      ? `<li aria-current="page">${esc(item.name)}</li>`
      : `<li><a href="${esc(item.href)}">${esc(item.name)}</a></li>`
  )).join("");
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${html}</ol></nav>`;
}

async function renderPost(post, posts) {
  const url = `${SITE}/blog/${post.slug}`;
  const live = isPublic(post);
  const ogPath = `/blog/og/${post.slug}.jpg`;
  const ogAlt = `${post.title} — Abracadabra AI`;
  const heroSource = join(root, "content/images", post.images[0].file);
  await writeOg(post.title, "ABRACADABRA AI", join(root, ogPath.slice(1)), heroSource);
  for (const image of post.images) {
    const source = join(root, "content/images", image.file);
    const dest = join(root, image.src.slice(1));
    if (!existsSync(source)) throw new Error(`Missing image source ${image.file} for ${post.slug}`);
    await mkdir(dirname(dest), { recursive: true });
    if (image.src.endsWith(".webp")) {
      const sized = sharp(source).resize(HERO_WIDTH, HERO_HEIGHT, { fit: "cover", position: "centre" });
      await sized.clone().webp({ quality: 76, effort: 4 }).toFile(dest);
      await sized.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(dest.replace(/\.webp$/, ".jpg"));
      const stalePng = dest.replace(/\.webp$/, ".png");
      if (existsSync(stalePng)) await unlink(stalePng);
    } else {
      await sharp(source).resize(1600, 900, { fit: "cover" }).png().toFile(dest);
    }
  }
  const related = relatedPosts(post, posts);
  const sources = post.citations.map((citation) => {
    const date = citation.datePublished ? ` ${esc(citation.datePublished)}.` : "";
    return `<li id="source-${citation.id}"><a href="${esc(citation.url)}">${esc(citation.title)}</a>. ${esc(citation.publisher)}.${date}</li>`;
  }).join("");
  const faqs = post.faqs.map((faq) => `<details><summary>${esc(faq.question)}</summary><p>${esc(faq.answer)}</p></details>`).join("");
  const relatedHtml = related.map((item) => postCard(item)).join("");
  const allNotes = posts
    .filter((item) => item.slug !== post.slug)
    .map((item) => `<li><a href="/blog/${item.slug}">${esc(item.title)}</a></li>`)
    .join("");
  const words = post.body.split(/\s+/).filter(Boolean).length;
  const links = (post.body.match(/\]\(/g) || []).length;
  if (links > words / 60) {
    console.warn(`${post.slug} has ${links} links in ${words} words (more than 1 per 60 words).`);
  }
  const prose = renderMarkdown(post).replace("</p>", `</p>\n${statCallout(post)}`);
  const body = `<main id="top" class="blog-post">
<header class="content-hero">
${crumbs([{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title, href: `/blog/${post.slug}` }])}
<div class="hero-copy">
<p class="kicker">${esc(post.pillar)} · ${esc(post.primaryQuery)}</p>
<h1>${esc(post.title)}</h1>
<p class="dek">${esc(post.description)}</p>
<p class="byline">By <a href="/about/">${esc(AUTHOR.name)}</a> · <time datetime="${post.datePublished}">${post.datePublished}</time></p>
${live ? "" : `<p class="scheduled">Scheduled for ${esc(post.datePublished)}. This preview is not in the public index yet.</p>`}
</div>
${figure(post.images[0], "hero")}
</header>
<div class="reading-progress" aria-hidden="true"></div>
<div class="post-layout">
<article>
<div class="prose post-prose">
${prose}
</div>
<section id="faq"><h2>Questions</h2><div class="faq-list">${faqs}</div></section>
<section id="sources"><h2>Sources</h2><ol>${sources}</ol></section>
${authorBox()}
<section id="related" class="post-related"><h2>Related</h2><ul class="cards">${relatedHtml}</ul></section>
<section id="all-notes"><h2>All notes</h2><ul>${allNotes}</ul></section>
${ctaBlock(post, "close")}
</article>
<aside class="post-aside">
${tocFrom(prose)}
</aside>
</div>
</main>
${ctaBlock(post, "sticky")}`;
  const html = pageShell({
    title: `${post.title} | Abracadabra AI`,
    description: post.description,
    canonical: url,
    robots: publicRobots(live ? "index,follow,max-image-preview:large" : "noindex,nofollow"),
    ogImage: `${SITE}${ogPath}`,
    ogAlt,
    ogType: "article",
    json: graphForPost(post),
    body,
  });
  const dest = join(root, "blog", post.slug, "index.html");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
}

function blogIndexGraph(livePosts) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      orgNode(),
      websiteNode(),
      authorNode(),
      {
        "@type": "Blog",
        "@id": `${SITE}/blog#blog`,
        name: "Abracadabra AI blog",
        url: `${SITE}/blog`,
        description: "Short notes for owners on when to buy a tool, when to build, and whether the business is ready. Every number names its source.",
        publisher: { "@id": ORG_ID },
        inLanguage: "en",
      },
      {
        "@type": "ItemList",
        name: "Published notes",
        numberOfItems: livePosts.length,
        itemListElement: livePosts.map((post, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: `${SITE}/blog/${post.slug}`,
          name: post.title,
        })),
      },
    ],
  };
}

async function renderIndex(posts) {
  const live = posts.filter((post) => isPublic(post));
  const ogAlt = "Abracadabra AI blog — notes on AI for operators";
  await writeOg("Notes for operators", "BLOG", join(root, "blog/og/index.jpg"));
  const featured = live.find((post) => post.slug === FEATURED_SLUG) ?? live[0];
  const rest = featured ? live.filter((post) => post.slug !== featured.slug) : [];
  const board = live.length
    ? `${pillarFilter(live)}${featuredPost(featured)}<ul class="cards">${rest.map((post) => postCard(post)).join("")}</ul>`
    : `<p class="empty">No note is public yet. Each one appears here on its publish date, with the sources and the Readiness Check link in the page.</p>`;
  const body = `<main id="top" class="blog-index">
<header class="content-hero blog-index-hero">
${crumbs([{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }])}
<div class="hero-copy">
<p class="kicker">Notes</p>
<h1>Notes on putting AI to work.</h1>
<p class="dek">When a product already fits, and when you need a system of your own. Every number names its source.</p>
</div>
</header>
${board}
</main>`;
  const html = pageShell({
    title: "Blog | Abracadabra AI",
    description: "Notes on buying a product that already fits, and on building a system of your own. Every number names its source.",
    canonical: `${SITE}/blog`,
    robots: publicRobots("index,follow,max-image-preview:large"),
    ogImage: `${SITE}/blog/og/index.jpg`,
    ogAlt,
    ogType: "website",
    json: blogIndexGraph(live),
    body,
  });
  await mkdir(join(root, "blog"), { recursive: true });
  await writeFile(join(root, "blog/index.html"), html);
}

async function renderAuthor() {
  const ogAlt = "About Abracadabra";
  await writeOg("About Abracadabra", "ABRACADABRA", join(root, "blog/og/author.jpg"));
  const body = `<main id="top" class="site-page">
<header class="page-hero">
<div class="page-hero__copy">
${crumbs([{ name: "Home", href: "/" }, { name: "About", href: "/about/" }])}
<p class="kicker">About</p>
<h1>We build software around how you work.</h1>
<p class="dek">Abracadabra designs, builds and runs AI-powered tools for businesses whose work doesn't fit off-the-shelf software. Every system we ship comes with a short film of the real screens.</p>
</div>
</header>
<article>
<h2>How we work</h2>
<p>We start with how the work gets done today, write it down, and agree on it with you before anything is built. Then we build on Cloudflare, test on your real work, and keep the system running after launch.</p>
<h2>Work we've shipped</h2>
<ul>
<li><a href="https://milrcorr.com">Milrcorr</a>: the website for StrongFoam's sister commercial fit-out business, where visitors see the work and request an estimate.</li>
<li><a href="https://strongfoam.com/">StrongFoam</a>: a website where visitors can start an estimate and book.</li>
<li><a href="https://schema-two.vercel.app/">Schema</a>: see how easily AI search can find your site, and get the fixes.</li>
<li><a href="https://llm-leverage-course.vercel.app">LLM Leverage</a>: a self-paced course for getting real work done with AI, plus workshops you can run.</li>
<li><a href="/films.html">Super Funnel</a>: a sales app for independent associates, shown in eight short films.</li>
</ul>
<h2>Contact</h2>
<p>Reach us at <a href="mailto:houdini@abra-ca-dabra.app">houdini@abra-ca-dabra.app</a>, or <a class="btn btn--primary" href="/start/">Start a project</a>.</p>
</article>
</main>`;
  const html = pageShell({
    title: "About | Abracadabra AI",
    description: "Abracadabra designs, builds and runs AI-powered tools that fit how your business already works.",
    canonical: `${SITE}/about/`,
    robots: publicRobots("index,follow,max-image-preview:large"),
    ogImage: `${SITE}/blog/og/author.jpg`,
    ogAlt,
    ogType: "website",
    json: {
      "@context": "https://schema.org",
      "@graph": [
        orgNode(),
        websiteNode(),
        authorNode(),
        {
          "@type": "AboutPage",
          url: `${SITE}/about/`,
          mainEntity: { "@id": ORG_ID },
          isPartOf: { "@id": WEBSITE_ID },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "About", item: `${SITE}/about/` },
          ],
        },
      ],
    },
    body,
  });
  const dest = join(root, "about/index.html");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
}

async function renderPrivacy() {
  const ogAlt = "Abracadabra AI privacy";
  await writeOg("Privacy", "ABRACADABRA AI", join(root, "blog/og/privacy.jpg"));
  const body = `<main id="top">
${crumbs([{ name: "Home", href: "/" }, { name: "Privacy", href: "/privacy" }])}
<article>
<h1>Privacy</h1>
<p class="dek">What abra-ca-dabra.app and the Readiness Check collect, why, and how to reach us.</p>
<p><strong>Effective date:</strong> <!-- PLACEHOLDER — needs owner sign-off: effective date --> [to be confirmed]</p>
<h2>This website</h2>
<p>abra-ca-dabra.app is a static website hosted on Cloudflare. It does not use analytics, advertising or tracking scripts, and the site itself does not set cookies. Like any host, Cloudflare processes standard request data, such as IP address and browser type, to deliver and protect the site.</p>
<p>The start form at /start/ sends your name, email, company, and the note you write to the studio inbox. It does not set a cookie. A hidden field catches automated submissions and those are dropped. If you email us instead, we receive your address and whatever you include, and we use it only to reply.</p>
<h2>The Readiness Check</h2>
<p>The Readiness Check at check.abra-ca-dabra.app stores the answers you give so it can score them and show your results. If you choose to, it also stores your name, your email address and your website address. We use your website address to run a public scan of that site. We use your email address to send your report and, if you book a working session, notes from that session. Nothing else is sent.</p>
<p>To prevent abuse, the check keeps a one-way hash of your IP address rather than the address itself. Links from this site into the check can carry a label showing which page you came from.</p>
<p>The check educates and points to a next step. It is not medical, legal or financial advice, and it does not diagnose.</p>
<h2>Analytics</h2>
<p>We may add analytics (PostHog) in the future, and only after you consent. No analytics run today.</p>
<h2>Your choices</h2>
<p>You can ask us what we hold about you, or ask us to correct or delete it, by emailing us. We do not sell personal information.</p>
<h2>Contact</h2>
<p>Questions about privacy go to <a href="mailto:houdini@abra-ca-dabra.app">houdini@abra-ca-dabra.app</a>.</p>
</article>
</main>`;
  const html = pageShell({
    title: "Privacy | Abracadabra AI",
    description: "What abra-ca-dabra.app and the Readiness Check collect, why, and how to reach us.",
    canonical: `${SITE}/privacy`,
    robots: "noindex,nofollow",
    ogImage: `${SITE}/blog/og/privacy.jpg`,
    ogAlt,
    ogType: "website",
    json: {
      "@context": "https://schema.org",
      "@graph": [
        orgNode(),
        websiteNode(),
        authorNode(),
        {
          "@type": "WebPage",
          url: `${SITE}/privacy`,
          name: "Privacy",
          description: "What the site and the Readiness Check collect.",
          isPartOf: { "@id": WEBSITE_ID },
        },
      ],
    },
    body,
  });
  const dest = join(root, "privacy/index.html");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
}

async function writeFeed(posts) {
  const live = posts.filter((post) => isPublic(post));
  const items = live.map((post) => `    <item>
      <title>${esc(post.title)}</title>
      <link>${SITE}/blog/${post.slug}</link>
      <guid>${SITE}/blog/${post.slug}</guid>
      <pubDate>${new Date(`${post.datePublished}T00:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(post.description)}</description>
    </item>`).join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Abracadabra AI blog</title>
    <link>${SITE}/blog</link>
    <description>Notes for owners on when to buy a tool, when to build, and whether the business is ready. A post appears here on its publish date.</description>
    <lastBuildDate>${new Date(`${asOf()}T00:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
  await mkdir(join(root, "blog"), { recursive: true });
  await writeFile(join(root, "blog/rss.xml"), xml);
}

async function writeRedirects(posts) {
  const lines = [
    "/blog /blog/index.html 200",
    "/blog/ /blog/index.html 200",
    ...posts.flatMap((post) => [
      `/blog/${post.slug} /blog/${post.slug}/index.html 200`,
      `/blog/${post.slug}/ /blog/${post.slug}/index.html 200`,
    ]),
    "/about/christopher-buzny /about/ 301",
    "/about/christopher-buzny/ /about/ 301",
    "/about /about/index.html 200",
    "/about/ /about/index.html 200",
    "/privacy /privacy/index.html 200",
    "/privacy/ /privacy/index.html 200",
  ];
  const block = `# blog-redirects\n${lines.join("\n")}\n`;
  const path = join(root, "_redirects");
  let text = await readFile(path, "utf8");
  if (text.includes("# blog-redirects")) {
    text = text.replace(/\n# blog-redirects[\s\S]*$/, `\n${block}`);
  } else {
    text = `${text.trimEnd()}\n${block}`;
  }
  await writeFile(path, text);
}

async function writeSitemap(posts) {
  const live = posts.filter((post) => isPublic(post));
  const urls = [
    [`${SITE}/blog`, asOf()],
    [`${SITE}/about/`, asOf()],
    ...live.map((post) => [`${SITE}/blog/${post.slug}`, post.dateModified]),
  ];
  const block = `  <!-- blog-urls -->\n${urls.map(([loc, lastmod]) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`).join("\n")}\n`;
  const path = join(root, "sitemap.xml");
  let xml = await readFile(path, "utf8");
  if (xml.includes("<!-- blog-urls -->")) {
    xml = xml.replace(/\n\s*<!-- blog-urls -->[\s\S]*?(?=<\/urlset>)/, `\n${block}`);
  } else {
    xml = xml.replace("</urlset>", `${block}</urlset>`);
  }
  await writeFile(path, xml);
}

async function writeLlms(posts) {
  const live = posts.filter((post) => isPublic(post));
  const lines = live.length
    ? live.map((post) => `- ${post.title}: ${SITE}/blog/${post.slug}`)
    : ["- No post is public on this date. Scheduled notes stay out of this list until datePublished."];
  const inner = `\n## Blog\n\nIndex: ${SITE}/blog\nAbout: ${SITE}/about/\nPrivacy: ${SITE}/privacy\n\n${lines.join("\n")}\n`;
  const path = join(root, "llms.txt");
  let text = await readFile(path, "utf8");
  const start = "<!-- blog-live:start -->";
  const end = "<!-- blog-live:end -->";
  if (!text.includes(start)) {
    text = `${text.trim()}\n\n${start}${inner}${end}\n`;
  } else {
    text = text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}${inner}${end}`);
  }
  await writeFile(path, text);
  const full = `# Abracadabra AI blog, full text\n\nGenerated ${asOf()}. Only posts with datePublished on or before that day are included.\n\n${live.map((post) => `## ${post.title}\n\n${post.body}\n`).join("\n") || "No live posts.\n"}`;
  await writeFile(join(root, "llms-full.txt"), full);
}

function injectPerson(html) {
  // Remove any legacy Person node; the house byline lives on blog pages only.
  return html.replace(/\{\s*"@type": "Person",[\s\S]*?"worksFor": \{ "@id": "[^"]+" \}\s*\},\s*/g, "");
}

async function injectSitewidePerson() {
  for (const file of ["index.html", "walkthrough.html", "films.html"]) {
    const path = join(root, file);
    const html = await readFile(path, "utf8");
    const next = injectPerson(html);
    if (next !== html) await writeFile(path, next);
  }
}

export async function loadPosts() {
  const dir = join(root, "content/blog");
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
  const posts = [];
  for (const file of files) {
    const raw = await readFile(join(dir, file), "utf8");
    const parsed = matter(raw);
    const data = postSchema.parse(parsed.data);
    const slug = file.replace(/\.md$/, "");
    if (data.images.some((image) => !image.src.startsWith(`/blog/media/${slug}/`))) {
      throw new Error(`${slug} image src must live under /blog/media/${slug}/`);
    }
    const prose = `${data.title}\n${data.description}\n${parsed.content}\n${data.faqs.map((faq) => `${faq.question}\n${faq.answer}`).join("\n")}`
      .replace(/<!--[\s\S]*?-->/g, " ");
    for (const pattern of BANNED) {
      if (pattern.test(prose)) throw new Error(`${slug} uses banned language ${pattern}`);
    }
    for (const claim of FORBIDDEN_CLAIMS) {
      if (prose.includes(claim)) throw new Error(`${slug} includes unapproved claim ${claim}`);
    }
    const allowed = allowedFigures(data);
    for (const token of numberTokens(prose)) {
      if (!allowed.has(token)) throw new Error(`${slug} uses unsourced number ${token}`);
    }
    if (!parsed.content.includes("<!--image:2-->") || !parsed.content.includes("<!--image:3-->")) {
      throw new Error(`${slug} needs image markers for the two in-body images`);
    }
    posts.push({ ...data, slug, body: parsed.content.trim() });
  }
  if (posts.length < 2) throw new Error("Expected the first two calendar posts");
  return posts;
}

export async function build() {
  const posts = await loadPosts();
  await renderIndex(posts);
  await renderAuthor();
  await renderPrivacy();
  for (const post of posts) await renderPost(post, posts);
  await writeFeed(posts);
  await writeRedirects(posts);
  await writeSitemap(posts);
  await writeLlms(posts);
  await injectSitewidePerson();
  await writeFile(join(root, "blog/build-stamp.json"), `${JSON.stringify({ asOf: asOf(), preview: previewMode() }, null, 2)}\n`);
  const relativeRoot = relative(process.cwd(), root) || ".";
  console.log(`blog build ${asOf()} (${posts.length} posts) in ${relativeRoot}`);
}
