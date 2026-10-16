import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { marked } from "marked";
import sharp from "sharp";
import { z } from "zod";
import { siteFooter, siteHeader } from "./site-chrome.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
export const SITE = "https://abra-ca-dabra.app";
export const CHECK = "https://check.abra-ca-dabra.app/check";
export const PERSON_ID = `${SITE}/#christopher-buzny`;
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
  author: z.literal("christopher-buzny"),
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
  <text x="72" y="124" fill="#8DEBF2" font-family="DejaVu Sans, sans-serif" font-size="22">${escXml(eyebrow)}</text>
  <text x="72" y="210" fill="#F5F0E8" font-family="DejaVu Sans, sans-serif" font-size="48" font-weight="700">${tspans}</text>
  <text x="72" y="566" fill="#AAA49A" font-family="DejaVu Sans, sans-serif" font-size="22">abra-ca-dabra.app</text>
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
    .png()
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
  return `<nav class="post-toc" aria-label="On this page"><p>On this page</p><ol>${items}<li><a href="#faq">Questions</a></li><li><a href="#sources">Sources</a></li></ol></nav>`;
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
  return `<fieldset class="pillar-filter"><legend>Filter by pillar</legend>${controls}</fieldset><style>${rules}</style>`;
}

function authorBox() {
  return `<aside class="author-box"><p class="kicker">Author</p><h2>Christopher Buzny</h2><p>Founder of Abracadabra AI. We design, build and run AI-powered tools that fit your business. You leave with the live system, a film of the screens, and the words you use to show it. Credentials, education, and personal profile links stay off this page until Christopher confirms them.</p><a href="/about/christopher-buzny">About Christopher</a></aside>`;
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
  return `<aside class="cta cta-${placement}"><p>${esc(post.cta)}</p><a data-track="readiness_cta_clicked" data-track-slug="${esc(post.slug)}" data-track-placement="${placement}" href="${esc(href)}">${label}</a></aside>`;
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
      personNode(),
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
        author: { "@id": PERSON_ID },
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
    email: "dev@pirx.ca",
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

function personNode() {
  return {
    "@type": "Person",
    "@id": PERSON_ID,
    name: "Christopher Buzny",
    jobTitle: "Founder",
    url: `${SITE}/about/christopher-buzny`,
    worksFor: { "@id": ORG_ID },
  };
}

function pageShell({ title, description, canonical, robots, ogImage, ogAlt, ogType, json, body }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&amp;family=Tektur:wght@500;600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' fill='%23070706'/%3E%3Ctext x='32' y='44' text-anchor='middle' font-family='Georgia,serif' font-size='40' fill='%23FF4B24'%3EA%3C/text%3E%3C/svg%3E">
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
`;
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
  const ogPath = `/blog/og/${post.slug}.png`;
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
  const prose = renderMarkdown(post).replace("</p>", `</p>\n${statCallout(post)}`);
  const body = `<main id="top" class="blog-post">
<header class="content-hero">
${crumbs([{ name: "Home", href: "/" }, { name: "Blog", href: "/blog" }, { name: post.title, href: `/blog/${post.slug}` }])}
<div class="hero-copy">
<p class="kicker">${esc(post.pillar)} · ${esc(post.primaryQuery)}</p>
<h1>${esc(post.title)}</h1>
<p class="dek">${esc(post.description)}</p>
<p class="byline">By <a href="/about/christopher-buzny">Christopher Buzny</a> · <time datetime="${post.datePublished}">${post.datePublished}</time></p>
${live ? "" : `<p class="scheduled">Scheduled for ${esc(post.datePublished)}. This preview is not in the public index yet.</p>`}
</div>
${figure(post.images[0], "hero")}
</header>
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
      personNode(),
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
  await writeOg("Notes for operators", "BLOG", join(root, "blog/og/index.png"));
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
<h1>When a product already fits, and when you need a system.</h1>
<p class="dek">Notes on buying a product that already fits, and on building a system of your own. Every number names its source.</p>
</div>
</header>
${board}
</main>`;
  const html = pageShell({
    title: "Blog | Abracadabra AI",
    description: "Notes on buying a product that already fits, and on building a system of your own. Every number names its source.",
    canonical: `${SITE}/blog`,
    robots: publicRobots("index,follow,max-image-preview:large"),
    ogImage: `${SITE}/blog/og/index.png`,
    ogAlt,
    ogType: "website",
    json: blogIndexGraph(live),
    body,
  });
  await mkdir(join(root, "blog"), { recursive: true });
  await writeFile(join(root, "blog/index.html"), html);
}

async function renderAuthor() {
  const ogAlt = "Christopher Buzny, founder of Abracadabra AI";
  await writeOg("Christopher Buzny", "FOUNDER", join(root, "blog/og/author.png"));
  const body = `<main id="top" class="site-page">
<header class="page-hero">
<div class="page-hero__copy">
${crumbs([{ name: "Home", href: "/" }, { name: "Christopher Buzny", href: "/about/christopher-buzny" }])}
<p class="kicker">Founder</p>
<h1>Christopher Buzny</h1>
<p class="dek">Founder of Abracadabra AI. We design, build and run AI-powered tools that fit your business. You leave with the live system, a film of the screens, and the words you use to show it.</p>
</div>
</header>
<article>
<!-- TODO(christopher): confirm credentials, education, years in practice, and certifications. Do not invent them. -->
<aside class="note"><p>Credentials, education, and certifications are not published on this page.</p></aside>
<!-- TODO(christopher): confirm personal LinkedIn, X, and GitHub URLs before adding sameAs. -->
<aside class="note"><p>Personal profile links are not published. The studio inbox is <a href="mailto:dev@pirx.ca">dev@pirx.ca</a>.</p></aside>
<h2>Systems the studio has shipped</h2>
<ul>
<li><a href="https://milrcorr.com">Milrcorr</a> is the public site for StrongFoam's sister commercial fit-out work. A visitor can see the work and request an estimate.</li>
<li><a href="https://strongfoam.com/">StrongFoam</a> is the public site, with an estimate a visitor can start and a booking.</li>
<li><a href="https://schema-two.vercel.app/">Schema</a> scores whether answer engines can find a site, and writes the fix.</li>
<li><a href="https://llm-leverage-course.vercel.app">The self-paced course</a> is for better answers from any model, plus a workshop path you can run.</li>
<li><a href="/films.html">Super Funnel</a> is the associate film set. The other tours stay on the films page.</li>
</ul>
<p>The work is on the <a href="/">home page</a>. The notes are on the <a href="/blog">blog</a>.</p>
</article>
</main>`;
  const html = pageShell({
    title: "Christopher Buzny | Abracadabra AI",
    description: "Christopher Buzny is the founder of Abracadabra AI. The studio inbox is dev@pirx.ca.",
    canonical: `${SITE}/about/christopher-buzny`,
    robots: publicRobots("index,follow,max-image-preview:large"),
    ogImage: `${SITE}/blog/og/author.png`,
    ogAlt,
    ogType: "profile",
    json: {
      "@context": "https://schema.org",
      "@graph": [
        orgNode(),
        websiteNode(),
        {
          ...personNode(),
          description: "Founder of Abracadabra AI. Credentials and personal profile URLs are unpublished until confirmed.",
        },
        {
          "@type": "ProfilePage",
          url: `${SITE}/about/christopher-buzny`,
          mainEntity: { "@id": PERSON_ID },
          isPartOf: { "@id": WEBSITE_ID },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: "Christopher Buzny", item: `${SITE}/about/christopher-buzny` },
          ],
        },
      ],
    },
    body,
  });
  const dest = join(root, "about/christopher-buzny/index.html");
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, html);
}

async function renderPrivacy() {
  const ogAlt = "Abracadabra AI privacy draft, not in force until review";
  await writeOg("Privacy draft", "FOR REVIEW", join(root, "blog/og/privacy.png"));
  const body = `<main id="top">
${crumbs([{ name: "Home", href: "/" }, { name: "Privacy", href: "/privacy" }])}
<article>
<p class="draft">Draft for review. Not in force until Christopher signs it.</p>
<h1>Privacy</h1>
<p class="dek">This draft says what the marketing site and the Readiness Check will collect. It is not the policy, and it is not in force.</p>
<h2>What this draft covers</h2>
<p>The marketing site at abra-ca-dabra.app is static. It does not run an analytics script. The Readiness Check at check.abra-ca-dabra.app stores the answers submitted so it can show a band and four scores. That product educates and routes. It does not diagnose.</p>
<h2>Analytics after consent</h2>
<p>PostHog is the analytics tool the studio intends to use, and only after a visitor consents. This draft does not install a PostHog script. No pageview, click, or session is sent to PostHog from this site until a consent step exists and Christopher has signed this page.</p>
<p>The blog's Readiness Check links include a label so the check can record which note the visit came from. The label is part of the link. It is not a tracker on this page.</p>
<h2>Contact</h2>
<p>Questions about this draft go to the studio inbox, <a href="mailto:dev@pirx.ca">dev@pirx.ca</a>.</p>
</article>
</main>`;
  const html = pageShell({
    title: "Privacy (draft) | Abracadabra AI",
    description: "Draft privacy note for Abracadabra AI. PostHog is named only as analytics that would run after consent. This page is not in force yet.",
    canonical: `${SITE}/privacy`,
    robots: "noindex,nofollow",
    ogImage: `${SITE}/blog/og/privacy.png`,
    ogAlt,
    ogType: "website",
    json: {
      "@context": "https://schema.org",
      "@graph": [
        orgNode(),
        websiteNode(),
        personNode(),
        {
          "@type": "WebPage",
          url: `${SITE}/privacy`,
          name: "Privacy (draft)",
          description: "Draft privacy note. Not in force until signed.",
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
    "/about/christopher-buzny /about/christopher-buzny/index.html 200",
    "/about/christopher-buzny/ /about/christopher-buzny/index.html 200",
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
    [`${SITE}/about/christopher-buzny`, asOf()],
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
  const inner = `\n## Blog\n\nIndex: ${SITE}/blog\nAuthor: ${SITE}/about/christopher-buzny\nPrivacy draft (not in force): ${SITE}/privacy\n\n${lines.join("\n")}\n`;
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
  if (html.includes(PERSON_ID)) return html;
  const block = `{
      "@type": "Person",
      "@id": "${PERSON_ID}",
      "name": "Christopher Buzny",
      "jobTitle": "Founder",
      "url": "${SITE}/about/christopher-buzny",
      "worksFor": { "@id": "${ORG_ID}" }
    },`;
  if (!html.includes('"@graph": [')) return html;
  return html.replace('"@graph": [', `"@graph": [\n    ${block}`);
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
