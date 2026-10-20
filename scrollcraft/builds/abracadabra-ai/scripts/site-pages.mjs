import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ORG_ID, SITE, WEBSITE_ID } from "./blog.mjs";
import { headLinks, intakeForm, siteFooter, siteHeader } from "./site-chrome.mjs";
import { smartQuotesHtml } from "./typography.mjs";
import {
  MODIFIED,
  OFFERINGS_HEADING,
  OFFERINGS_KICKER,
  PLACEHOLDER,
  businessFunctions,
  cases,
  course,
  familyLogos,
  gatewayLogos,
  offerings,
  placeholders,
  products,
} from "./site-data.mjs";
import { pirxChartHtml, pirxChartPicture, writePirxChartImages } from "./pirx-chart.mjs";
import { READINESS_URL, processIntro, processSteps, salesPages } from "./service-sales.mjs";
import { serviceAlt, serviceOgPath, servicePicture, writeServiceImages } from "./service-visuals.mjs";
import { brandedPhotoCard, plateSvg } from "./og-brand.mjs";

const HOME_OG_ALT = "The abracadabra wordmark with an orange dot, above the headline: Let us bring your ideas to life.";

const root = fileURLToPath(new URL("..", import.meta.url));

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function clip(text, max) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const room = clean.slice(0, max);
  const space = room.lastIndexOf(" ");
  return (space > Math.min(24, max - 12) ? room.slice(0, space) : room).replace(/[\s,.;:|]+$/u, "");
}

function pageTitle(label) {
  const brand = " | Abracadabra AI";
  const full = `${label}${brand}`;
  if (full.length <= 60) return full;
  return `${clip(label, 60 - brand.length)}${brand}`;
}

function jsonLd(data) {
  return JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
}

function fill(text, start, end, inner) {
  const pattern = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  if (!pattern.test(text)) throw new Error(`Missing marker ${start}`);
  return text.replace(pattern, `${start}\n${inner}\n${end}`);
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


function crumbList(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function visibleCrumbs(items) {
  const html = items.map((item, index) => (
    index === items.length - 1
      ? `<li aria-current="page">${esc(item.name)}</li>`
      : `<li><a href="${esc(item.href)}">${esc(item.name)}</a></li>`
  )).join("");
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${html}</ol></nav>`;
}

function placeholder(text) {
  return `<aside class="note"><!-- ${PLACEHOLDER} --><p>${esc(text)}</p><p><a href="/#start">Start a project</a></p></aside>`;
}

function underTheHood() {
  return "Running in production today.";
}

function logoItem(item) {
  if (item.file) {
    return `<li><img src="assets/logos/${esc(item.file)}" alt="${esc(item.name)}" width="24" height="24"><span>${esc(item.name)}</span></li>`;
  }
  const light = item.light ? " marquee__word marquee__word--light" : " marquee__word";
  return `<li><span class="${light.trim()}">${esc(item.name)}</span></li>`;
}

function marquee(items, duration, reverse) {
  const list = items.map(logoItem).join("");
  const direction = reverse ? " marquee--reverse" : "";
  return `<div class="marquee${direction}" style="--marquee-duration: ${duration}" tabindex="0">
        <div class="marquee__track">
          <ul class="marquee__list">${list}</ul>
          <ul class="marquee__list" aria-hidden="true">${list}</ul>
        </div>
      </div>`;
}

function modelsHtml() {
  return `<section id="models" class="sc-section section models" aria-labelledby="models-title">
    <div class="sc-wrap">
      <p class="kicker">Models</p>
      <h2 id="models-title" class="models__label">Built with</h2>
      ${marquee(gatewayLogos, "90s", false)}
      ${marquee(familyLogos, "70s", true)}
    </div>
  </section>`;
}

const HUB_SIZES = "(min-width: 1100px) 22rem, (min-width: 700px) 46vw, 100vw";
const HOME_CARD_SIZES = "(min-width: 1280px) 30vw, (min-width: 768px) 45vw, 85vw";
const SPLIT_SIZES = "(min-width: 1024px) 46vw, 100vw";

const ASSET_SIZE = {
  "/assets/schema-home.webp": [1600, 1000],
  "/assets/llmcourse-home.webp": [1600, 1000],
  "/assets/superfunnel-getting-started.webp": [1920, 1080],
  "/assets/strongfoam-erp-demo.webp": [1920, 1080],
  "/assets/course-hero-bg.webp": [1280, 720],
};

function loopFilm(loop) {
  return `<video class="loop-film" muted playsinline loop preload="none" poster="${esc(loop.base)}.jpg" width="1280" height="720" aria-label="${esc(loop.label)}"><source src="${esc(loop.base)}.webm" type="video/webm"><source src="${esc(loop.base)}.mp4" type="video/mp4"></video>`;
}

function filmPlayer(film) {
  return `<video class="case-film" controls playsinline preload="none" poster="${esc(film.poster)}" src="${esc(film.src)}" width="1920" height="1080" aria-label="${esc(film.label)}"></video>`;
}

function assetMedia(src, alt, { lazy = false } = {}) {
  const [width, height] = ASSET_SIZE[src] || [1600, 1000];
  const priority = lazy ? ' loading="lazy"' : ' fetchpriority="high"';
  return `<img src="${esc(src)}" alt="${esc(alt)}" width="${width}" height="${height}"${priority} decoding="async">`;
}

function pageHero({ crumbs = "", kicker, title, dek = "", actions = "", media = "" }) {
  const photo = media ? `<figure class="page-hero__media">${media}</figure>` : "";
  return `<header class="page-hero page-header${media ? " page-hero--photo" : ""}">
${photo}
<div class="page-hero__copy">
${crumbs}
<p class="eyebrow">${kicker}</p>
<h1>${title}</h1>
<div class="page-header__lede lede">${dek}</div>
${actions}
</div>
</header>`;
}

function pageActions(primaryHref, primaryLabel, secondaryHref, secondaryLabel) {
  return `<p class="page-hero__actions sales-actions"><a class="btn btn--primary" href="${esc(primaryHref)}">${esc(primaryLabel)}</a><a class="btn btn--tertiary" href="${esc(secondaryHref)}">${esc(secondaryLabel)} <span class="btn__arrow" aria-hidden="true">→</span></a></p>`;
}

function sectionHeading(kicker, title, copy = "") {
  return `<header class="section-heading"><p class="eyebrow">${esc(kicker)}</p><h2>${esc(title)}</h2>${copy ? `<p>${esc(copy)}</p>` : ""}</header>`;
}

function collectionIndex(items) {
  return `<div class="collection-index" aria-label="Collection summary">${items.map(([value, label]) => `<p><strong>${esc(String(value))}</strong><span>${esc(label)}</span></p>`).join("")}</div>`;
}

function functionPhoto(fn) {
  if (fn.services[0]) return servicePicture(fn.services[0], "hero", { lazy: true, sizes: HOME_CARD_SIZES });
  return `<img src="/assets/og/portfolio-strongfoam-website.png" alt="StrongFoam website" width="1200" height="630" loading="lazy" decoding="async">`;
}

function functionLinkList(fn) {
  const services = fn.services.map((slug) => `<li><a href="/services/${slug}/">${esc(salesPages[slug].headline)}</a></li>`).join("");
  const work = (fn.work || []).map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join("");
  return `<ul class="fn-card__links">${services}${work}</ul>`;
}

function offeringsHtml() {
  const cards = businessFunctions.map((fn) => {
    return `<li class="card fn-card" id="fn-${esc(fn.id)}"><div class="card__media">${functionPhoto(fn)}</div><div class="card__body"><h3 class="card__title">${esc(fn.name)}</h3><p class="card__dek">${esc(fn.promise)}</p>${functionLinkList(fn)}</div></li>`;
  }).join("");
  return `<section id="services" class="sc-section section services" aria-labelledby="services-title">
    <div class="sc-wrap">
      <p class="kicker">${esc(OFFERINGS_KICKER)}</p>
      <h2 id="services-title">Everything you need to put AI to work in your business.</h2>
      <div class="fn-scroller" data-scroller><ul class="fn-grid">${cards}</ul><div class="fn-scroller__fade" aria-hidden="true"></div></div>
      <div class="fn-scroller__dots" data-scroller-dots></div>
      <script src="/assets/scroller.mjs" type="module"></script>
    </div>
  </section>`;
}

function list(tag, items) {
  return `<${tag}>${items.map((item) => `<li>${esc(item)}</li>`).join("")}</${tag}>`;
}

function wrapLines(text, max = 26) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > max && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 4);
}

async function writePlate(file, label, title) {
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(plateSvg({ label, title }))).jpeg({ quality: 82, mozjpeg: true }).toFile(file);
}

function shell({ title, description, canonical, robots, ogImage, ogWidth, ogHeight, ogAlt, json, body, footer = "full" }) {
  const graph = JSON.stringify(json);
  if (graph.includes("PLACEHOLDER") || graph.includes("AggregateRating") || /"offers"\s*:/.test(graph)) {
    throw new Error(`Schema for ${canonical} includes a banned field`);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- PLACEHOLDER — needs owner sign-off: Google Search Console verification meta -->
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Abracadabra AI">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:image:width" content="${ogWidth}">
<meta property="og:image:height" content="${ogHeight}">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(ogImage)}">
<meta name="twitter:image:alt" content="${esc(ogAlt)}">
${headLinks()}
<link rel="stylesheet" href="/blog/blog.css?v=20261020a">
<link rel="stylesheet" href="/assets/pirx-shot.css?v=20261019n">
<script type="application/ld+json">
${jsonLd(json)}
</script>
</head>
<body>
${siteHeader()}
${body}
${siteFooter({ band: footer })}
</body>
</html>
`;
}

async function writePage(relativePath, html) {
  const file = join(root, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, smartQuotesHtml(html));
}

function baseGraph(pageNode, extra) {
  return {
    "@context": "https://schema.org",
    "@graph": [orgNode(), websiteNode(), pageNode, ...extra],
  };
}

function pageNode({ type, id, url, name, description, image }) {
  const node = {
    "@type": type,
    "@id": id,
    url,
    name,
    description,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
    dateModified: MODIFIED,
  };
  if (image) node.primaryImageOfPage = { "@type": "ImageObject", url: image };
  return node;
}

async function plateOrPhoto(key, label, title, photo) {
  const relative = `assets/og/${key}.jpg`;
  const file = join(root, relative);
  await mkdir(dirname(file), { recursive: true });
  if (photo) {
    const source = join(root, String(photo).replace(/^\//, ""));
    await (await brandedPhotoCard(source, { position: "attention" })).jpeg({ quality: 78, mozjpeg: true }).toFile(file);
  } else {
    await writePlate(file, label, title);
  }
  return {
    url: `${SITE}/${relative}`,
    width: "1200",
    height: "630",
    alt: `${title}, Abracadabra AI`,
  };
}

function shotImg(image, { lazy = true, className = "" } = {}) {
  const loading = lazy ? ' loading="lazy" decoding="async"' : "";
  const cls = className ? ` class="${className}"` : "";
  return `<img${cls} src="${esc(image.src)}" alt="${esc(image.alt)}" width="${image.width}" height="${image.height}"${loading}>`;
}

function shotPairHtml(pair) {
  return `<figure class="shot-pair">${shotImg(pair.desktop)}${shotImg(pair.mobile)}</figure>`;
}

function salesActions() {
  return `<p class="sales-actions" data-actions><a class="btn btn--primary sales-primary" href="/start/">Start a project</a><a class="btn btn--secondary sales-secondary" href="${esc(READINESS_URL)}">AI Readiness Check</a></p>`;
}

const SERVICE_GROUPS = {
  "ai-visibility": "Search & AI visibility",
  "ai-media": "Marketing",
  "search-grounded-research": "Marketing",
  "ai-assistants-and-agents": "Sales",
  "voice-and-realtime-agents": "Customer service",
  "web-automation": "Operations",
  "answers-from-your-documents": "Operations",
  "custom-apps": "Operations",
  "any-model-one-bill": "Platform",
  "safe-code-execution": "Platform",
  "machine-learning": "Operations",
  "mcp-connectors": "Platform",
};

function proofStrip(items) {
  const isCase = (item) => /^\/portfolio\/[^/]+\/?$/.test(item.href);
  const cases = items.filter(isCase);
  const rest = items.filter((item) => !isCase(item));
  const link = (item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`;
  const label = cases.length ? `<li class="proof-strip__label">See it in action:</li>` : "";
  return `<ul class="proof-strip">${label}${cases.map(link).join("")}${rest.map(link).join("")}</ul>`;
}

function cardGrid(className, items) {
  return `<ul class="${className}">${items.map((item) => `<li><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></li>`).join("")}</ul>`;
}

function comparisonTable(rows) {
  const body = rows.map((row) => `<tr><th scope="row">${esc(row.label)}</th><td>${esc(row.shelf)}</td><td>${esc(row.hire)}</td><td>${esc(row.us)}</td></tr>`).join("");
  return `<div class="extraction-table"><table>
<thead><tr><th></th><th>Off the shelf</th><th>Hire in-house</th><th>Abracadabra</th></tr></thead>
<tbody>${body}</tbody>
</table></div>`;
}

function leadHtml(lead) {
  if (!lead) return "";
  return `<p class="sales-lead">${esc(lead.before)} <a href="${esc(lead.href)}">${esc(lead.label)}</a>${esc(lead.after)}</p>`;
}

function capabilityHtml(block) {
  if (!block) return "";
  return `<section>
<h2>${esc(block.title)}</h2>
<p>${esc(block.text)} <a href="${esc(block.href)}">${esc(block.label)}</a></p>
</section>`;
}

function proofMetrics(className) {
  return `<div class="${className}" aria-label="PiRX results">
<p class="metric"><strong>398K</strong><span>search impressions</span></p>
<p class="metric"><strong>46.5K</strong><span>AI-feature impressions</span></p>
<p class="metric"><strong>90</strong><span>days, Jul 18–Oct 17</span></p>
</div>`;
}

function faqAccordion(faqs) {
  return `<div class="faq-list">${faqs.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join("")}</div>`;
}

function caseWindow(pair, title, caption, position = "top", eager = false) {
  const loading = eager ? "" : ' loading="lazy" decoding="async"';
  const mobileSource = position === "top"
    ? `<source media="(max-width: 700px)" srcset="${esc(pair.mobile.src)}">`
    : "";
  return `<figure class="case-window case-window--${esc(position)}">
<div class="case-window__bar"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><strong>${esc(title)}</strong></div>
<div class="case-window__viewport"><picture>
${mobileSource}
<img src="${esc(pair.desktop.src)}" alt="${esc(pair.desktop.alt)}" width="${pair.desktop.width}" height="${pair.desktop.height}"${loading}>
</picture></div>
<figcaption>${esc(caption)}</figcaption>
</figure>`;
}

function visibilityBody(page, item, crumbs) {
  const steps = processSteps.map((step, index) => `<li><span>0${index + 1}</span><div><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></div></li>`).join("");
  return `<main id="top" class="site-page sales visibility-page">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: esc(SERVICE_GROUPS[item.slug]),
  title: esc(page.headline),
  dek: `<p class="sales-dek">${esc(page.dek)}</p>`,
  actions: salesActions(),
  media: servicePicture(item.slug, "hero", { sizes: "(min-width: 1024px) 72rem, 100vw" }),
})}
${proofMetrics("visibility-hero__metrics")}
${proofStrip(page.strip)}
<section class="visibility-intro">
<div><p class="eyebrow">The shift</p><h2>${esc(page.problemTitle)}</h2></div>
<div class="visibility-intro__copy">${page.problem.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("")}</div>
</section>
<section class="visibility-outcomes">
<p class="eyebrow">The system</p>
<h2>Control what answer engines can find, trust, and quote.</h2>
${cardGrid("outcome-grid", page.outcomes)}
</section>
<section class="visibility-use">
<div><p class="eyebrow">Built for the real decisions</p><h2>Public when it helps. Private when it matters.</h2>${cardGrid("use-grid", page.uses)}</div>
<figure class="sales-split__photo">${servicePicture(item.slug, "body1", { lazy: true, sizes: SPLIT_SIZES })}</figure>
</section>
<section class="visibility-process">
<p class="eyebrow">How it works</p>
<h2>${esc(processIntro)}</h2>
<ol>${steps}</ol>
</section>
<section class="visibility-proof">
<div class="visibility-proof__copy">
<p class="eyebrow">Named proof · pirx.ca</p>
<h2>Near-zero to visible in 90 days.</h2>
<p>${esc(page.proofs[0].text)}</p>
<p><a class="btn btn--tertiary" href="/portfolio/pirx/">Read the PiRX case study <span class="btn__arrow" aria-hidden="true">→</span></a></p>
</div>
${pirxChartHtml()}
</section>
<section class="visibility-compare">
<p class="eyebrow">Buy the result, not the theatre</p>
<h2>How the options compare.</h2>
<p>${esc(page.compareIntro)}</p>
${comparisonTable(page.rows)}
</section>
<section class="price-block visibility-price">
<h2>Pricing</h2>
<p>Priced to the project. Tell us what you need and we'll quote it.</p>
<p><a href="/start/">Start a project</a></p>
</section>
<section class="visibility-faq">
<p class="eyebrow">FAQ</p>
<h2>What this can—and cannot—do.</h2>
${faqAccordion(page.faqs)}
</section>
<section class="sales-close">
<p class="eyebrow">Start with the question</p>
<h2>Make your best answer the easiest one to find.</h2>
<p>${esc(page.close)}</p>
${salesActions()}
</section>
</main>`;
}

async function renderOffering(item) {
  const page = salesPages[item.slug];
  if (!page) throw new Error(`Missing sales page for ${item.slug}`);
  const path = `/services/${item.slug}/`;
  const url = `${SITE}${path}`;
  const title = pageTitle(page.title);
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Services", href: "/services/", url: `${SITE}/services/` },
    { name: page.headline, href: path, url },
  ];
  const service = {
    "@type": "Service",
    "@id": `${url}#service`,
    name: page.headline,
    serviceType: page.short,
    description: page.description,
    provider: { "@id": ORG_ID },
    areaServed: "Worldwide",
    url,
  };
  const faq = {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: page.faqs.map(([name, text]) => ({
      "@type": "Question",
      name,
      acceptedAnswer: { "@type": "Answer", text },
    })),
  };
  const og = {
    url: `${SITE}${serviceOgPath(item.slug)}`,
    width: "1200",
    height: "630",
    alt: serviceAlt(item.slug, "hero"),
  };
  const steps = processSteps.map((step) => `<li><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join("");
  const proofs = page.proofs.map((proof) => `<article class="proof-card"><h3>${esc(proof.title)}</h3><p>${esc(proof.text)}</p>${proof.chart ? pirxChartHtml() : ""}${(proof.shots || []).map((pair) => shotPairHtml(pair)).join("")}${proof.href ? `<p><a href="${esc(proof.href)}">${esc(proof.link)}</a></p>` : ""}</article>`).join("\n");
  const html = shell({
    title,
    description: page.description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: og.alt,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${url}#webpage`,
      url,
      name: page.headline,
      description: page.description,
      image: og.url,
    }), [crumbList(crumbs), service, faq]),
    body: item.slug === "ai-visibility" ? visibilityBody(page, item, crumbs) : `<main id="top" class="site-page sales service-page">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: esc(SERVICE_GROUPS[item.slug] || OFFERINGS_KICKER),
  title: esc(page.headline),
  dek: `<p class="sales-dek">${esc(page.dek)}</p>\n${leadHtml(page.lead)}`,
  actions: salesActions(),
  media: servicePicture(item.slug, "hero", { sizes: "(min-width: 1024px) 72rem, 100vw" }),
})}
${proofStrip(page.strip)}
<section class="service-page__intro editorial-split">
${sectionHeading("The shift", page.problemTitle)}
<div class="editorial-split__body">
${page.problem.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n")}
</div>
</section>
<section class="service-page__outcomes">
${sectionHeading("The outcome", "What you get")}
${cardGrid("outcome-grid", page.outcomes)}
</section>
<section class="sales-split service-page__uses">
<div>
${sectionHeading("Where it earns its keep", "Use cases")}
${cardGrid("use-grid", page.uses)}
</div>
<figure class="sales-split__photo">${servicePicture(item.slug, "body1", { lazy: true, sizes: SPLIT_SIZES })}</figure>
</section>
${capabilityHtml(page.capability)}
<section class="service-page__process">
${sectionHeading("The operating model", "How it works")}
<p>${esc(processIntro)}</p>
<ol class="process">${steps}</ol>
</section>
<section class="service-page__compare">
${sectionHeading("The decision", "How it compares")}
<p>${esc(page.compareIntro)}</p>
${comparisonTable(page.rows)}
</section>
<section class="sales-split service-page__proof">
<div>
${sectionHeading(page.proofKicker || "Named work", page.proofTitle || "Proof")}
${proofs}
</div>
<figure class="sales-split__photo">${servicePicture(item.slug, "body2", { lazy: true, sizes: SPLIT_SIZES })}</figure>
</section>
<p class="cloud-line">${esc(underTheHood())}</p>
<section class="price-block">
<h2>Pricing</h2>
<p>Priced to the project. Tell us what you need and we'll quote it.</p>
<p><a href="/start/">Start a project</a></p>
</section>
<section class="faq-section" aria-labelledby="faq-title">
${sectionHeading("Questions, answered", "FAQ", "faq-title")}
${faqAccordion(page.faqs)}
</section>
<section class="sales-close">
<h2>Start a project</h2>
<p>${esc(page.close)}</p>
${salesActions()}
</section>
<div class="service-page__close" aria-hidden="true"><span>Describe it</span><span>Build it</span><span>Run it</span></div>
</main>`,
  });
  await writePage(`services/${item.slug}/index.html`, html);
}

async function renderOfferingsHub() {
  const url = `${SITE}/services/`;
  const title = `${OFFERINGS_HEADING} | Abracadabra AI`;
  const description = "Search, marketing, sales, customer service, operations, design, and the platform underneath. Safe code execution ships inside the assistants and keeps its own page.";
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Services", href: "/services/", url },
  ];
  const listNode = {
    "@type": "ItemList",
    "@id": `${url}#list`,
    name: OFFERINGS_HEADING,
    numberOfItems: offerings.length,
    itemListElement: offerings.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Service",
        name: salesPages[item.slug].headline,
        url: `${SITE}/services/${item.slug}/`,
      },
    })),
  };
  const og = await plateOrPhoto("services", "Services", OFFERINGS_HEADING, null);
  const groups = businessFunctions.map((fn) => {
    const cards = fn.services.map((slug) => {
      const page = salesPages[slug];
      const note = slug === "safe-code-execution" ? " Part of AI assistants." : "";
      const photo = servicePicture(slug, "hero", { lazy: true, sizes: HUB_SIZES });
      return `<li><a href="/services/${slug}/">${photo}<strong>${esc(page.headline)}</strong><span>${esc(page.description)}${esc(note)}</span></a></li>`;
    }).join("");
    const workItems = fn.work || [];
    const work = workItems.map((item) => `<li><a href="${esc(item.href)}"><strong>${esc(item.label)}</strong><span>${esc(fn.promise)}</span></a></li>`).join("");
    const few = fn.services.length + workItems.length < 3 ? " cards--pair" : "";
    return `<section id="${esc(fn.id)}" class="fn-group"><h2>${esc(fn.name)}</h2><p>${esc(fn.promise)}</p><ul class="cards${few}">${cards}${work}</ul></section>`;
  }).join("\n");
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: og.alt,
    json: baseGraph(pageNode({
      type: "CollectionPage",
      id: `${url}#webpage`,
      url,
      name: OFFERINGS_HEADING,
      description,
    }), [crumbList(crumbs), listNode]),
    body: `<main id="top" class="site-page collection-page collection-page--services">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: esc(OFFERINGS_KICKER),
  title: esc(OFFERINGS_HEADING),
  dek: `<p>${esc(description)}</p>`,
})}
${collectionIndex([[businessFunctions.length, "business functions"], [offerings.length, "systems you can commission"], ["01", "operating partner"]])}
${groups}
</main>`,
  });
  await writePage("services/index.html", html);
}

function caseAbout(item, url) {
  if (item.kind === "course") {
    return {
      "@type": "Course",
      name: item.name,
      description: item.summary,
      url,
      provider: { "@id": ORG_ID },
      sameAs: item.sameAs,
    };
  }
  if (item.kind === "work") {
    return {
      "@type": "CreativeWork",
      name: item.name,
      description: item.summary,
      url,
    };
  }
  if (item.kind === "site" || item.kind === "proof") {
    return {
      "@type": "WebSite",
      name: item.name,
      description: item.summary,
      url,
      ...(item.sameAs ? { sameAs: item.sameAs } : {}),
    };
  }
  return {
    "@type": "SoftwareApplication",
    name: item.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: item.summary,
    url,
    sameAs: item.sameAs,
  };
}

function pirxCaseBody(item, crumbs, relatedHtml) {
  const [home, article] = item.shots;
  return `<main id="top" class="site-page pirx-case">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "PiRX · App, machine learning & AI visibility",
  title: "From invisible to 398K search impressions.",
  dek: `<p>${esc(item.summary)}</p><p class="sales-actions"><a class="btn btn--primary" href="${esc(item.sameAs)}">Open pirx.ca</a><a class="btn btn--secondary" href="/services/ai-visibility/">See the visibility system</a></p>`,
  media: `${shotImg(item.hero.desktop, { lazy: false, className: "shot-desktop" })}${shotImg(item.hero.mobile, { lazy: false, className: "shot-mobile" })}`,
})}
${proofMetrics("pirx-case__metrics")}
<section class="pirx-case__story">
<div><p class="eyebrow">The brief</p><h2>Build something useful enough to earn the search.</h2></div>
<div>
<p>${esc(item.body[0])} ${esc(item.body[1])} The blogs answer the specific questions runners already type into search and AI assistants.</p>
</div>
</section>
<section class="pirx-case__method pirx-case__app" aria-labelledby="pirx-app-title">
<p class="eyebrow">The app</p>
<h2 id="pirx-app-title">We designed and built the PIRX app and its machine learning.</h2>
<ol>
<li><span>01</span><div><h3>Projected Time</h3><p>The race time a runner’s own training supports today. One odd run can’t swing it.</p></div></li>
<li><span>02</span><div><h3>Supported Range</h3><p>The band around it. Thin or messy data makes the band wider, not the number bolder.</p></div></li>
<li><span>03</span><div><h3>Five Structural Drivers</h3><p>Aerobic Base, Threshold Density, Speed Exposure, Running Economy and Load Consistency. They always add up to the Improvement Since Baseline.</p></div></li>
</ol>
<p>A runner connects the watch they already wear. Personal models, including gradient boosting, learn each runner’s patterns and are only used when they beat the app’s safe rules. Athletic estimates, not medical advice. <a href="/services/machine-learning/">See how we build machine learning</a>.</p>
</section>
<section class="pirx-case__gallery" aria-labelledby="pirx-gallery-title">
<div class="pirx-case__gallery-head"><p class="eyebrow">The system</p><h2 id="pirx-gallery-title">Product, evidence, and useful answers—one connected experience.</h2></div>
${caseWindow(item.hero, "Product", "A race predictor that turns a recent result into a useful next target.", "top", true)}
${caseWindow(home, "Experience", "The product, sample output, and guidance continue as one deliberate journey.", "middle")}
${caseWindow(article, "Content engine", "Specific public guides give search engines and answer engines something real to cite.", "article")}
</section>
<section class="pirx-case__results">
<div class="pirx-case__results-copy">
<p class="eyebrow">The result</p>
<h2>Demand compounded. The evidence stayed attached.</h2>
<p>${esc(item.body[3])}</p>
<p>${esc(item.body[4])}</p>
<p class="fine">The AI-feature count is separate and is not added to the search total. Results vary by site; these are pirx.ca’s own dated numbers.</p>
</div>
${pirxChartHtml()}
</section>
<section class="pirx-case__next">
<div><p class="eyebrow">Use the same operating model</p><h2>Turn expertise into a product—and a public record worth finding.</h2></div>
<div>${relatedHtml}<p class="sales-actions"><a class="btn btn--primary" href="/start/">Start a project</a><a class="btn btn--tertiary" href="/services/ai-visibility/">Explore AI visibility <span class="btn__arrow" aria-hidden="true">→</span></a></p></div>
</section>
</main>`;
}

function caseStudyBody(item, crumbs, relatedHtml) {
  const liveHref = item.sameAs || "/start/";
  const liveLabel = item.sameAs ? "Open the live system" : "Start a similar project";
  const visual = item.loop
    ? loopFilm(item.loop)
    : item.hero
      ? `${shotImg(item.hero.desktop, { lazy: false, className: "shot-desktop" })}${shotImg(item.hero.mobile, { lazy: false, className: "shot-mobile" })}`
      : item.image
        ? assetMedia(item.image, item.imageAlt)
        : "";
  const story = item.body.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n");
  const product = products.some((productItem) => productItem.slug === item.slug)
    ? `/products/${item.slug}/`
    : item.slug === "llm-leverage"
      ? "/course/llm-leverage/"
      : "/portfolio/";
  const productLabel = products.some((productItem) => productItem.slug === item.slug)
    ? "See the product"
    : item.slug === "llm-leverage"
      ? "See the course"
      : "Explore all work";

  return `<main id="top" class="site-page case-study">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "Portfolio",
  title: esc(item.name),
  dek: `<p>${esc(item.summary)}</p>`,
  actions: pageActions(liveHref, liveLabel, product, productLabel),
  media: visual,
})}
<section class="case-study__story editorial-split">
${sectionHeading("The work", "A working system, not a concept.")}
<div class="editorial-split__body">${story}</div>
</section>
${visual ? `<section class="case-study__gallery" aria-label="${esc(item.name)} product view">
${sectionHeading("Inside the system", "The real interface, in motion.")}
<figure class="experience-panel"><div class="experience-panel__bar"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><strong>${esc(item.name)}</strong></div><div class="experience-panel__viewport">${item.film ? filmPlayer(item.film) : visual}</div></figure>
</section>` : ""}
<section class="case-study__next">
<div>${sectionHeading("Make the next one yours", "Build around the work you already do.")}</div>
<div>${relatedHtml}${pageActions("/start/", "Start a project", "/portfolio/", "See all work")}</div>
</section>
</main>`;
}

async function renderCase(item) {
  const path = `/portfolio/${item.slug}/`;
  const url = `${SITE}${path}`;
  const title = pageTitle(item.name);
  const description = clip(item.summary, 155);
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Portfolio", href: "/portfolio/", url: `${SITE}/portfolio/` },
    { name: item.name, href: path, url },
  ];
  const og = await plateOrPhoto(`portfolio-${item.slug}`, "Portfolio", item.name, item.image || null);
  const related = (item.services || []).map((slug) => {
    const page = salesPages[slug];
    if (!page) throw new Error(`Missing service ${slug} for ${item.slug}`);
    return `<li><a href="/services/${esc(slug)}/">${esc(page.short)}</a></li>`;
  }).join("");
  const relatedHtml = related ? `<h2>Related services</h2><ul>${related}</ul>` : "";
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: item.imageAlt || og.alt,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${url}#webpage`,
      url,
      name: item.name,
      description: item.summary,
      image: item.image ? `${SITE}${item.image}` : undefined,
    }), [crumbList(crumbs), caseAbout(item, url)]),
    body: item.slug === "pirx" ? pirxCaseBody(item, crumbs, relatedHtml) : caseStudyBody(item, crumbs, relatedHtml),
  });
  await writePage(`portfolio/${item.slug}/index.html`, html);
}

async function renderPortfolioHub() {
  const url = `${SITE}/portfolio/`;
  const title = "Portfolio | Abracadabra AI";
  const description = "Live work you can open and try, including Milrcorr, StrongFoam, SuperPatch products, Renew Implants and pirx.ca.";
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Portfolio", href: "/portfolio/", url },
  ];
  const list = {
    "@type": "ItemList",
    name: "Portfolio",
    numberOfItems: cases.length,
    itemListElement: cases.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: `${SITE}/portfolio/${item.slug}/`,
    })),
  };
  const og = await plateOrPhoto("portfolio", "Portfolio", "Named systems, open and running", null);
  const cards = cases.map((item) => {
    const photo = item.cardImage
      ? shotImg(item.cardImage, { lazy: true })
      : item.image
        ? assetMedia(item.image, item.imageAlt, { lazy: true })
        : "";
    return `<li><a href="/portfolio/${item.slug}/">${photo}<strong>${esc(item.name)}</strong><span>${esc(item.summary)}</span></a></li>`;
  }).join("");
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: og.alt,
    json: baseGraph(pageNode({
      type: "CollectionPage",
      id: `${url}#webpage`,
      url,
      name: "Portfolio",
      description,
    }), [crumbList(crumbs), list]),
    body: `<main id="top" class="site-page collection-page collection-page--portfolio">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "Portfolio",
  title: "Work that's live.",
  dek: "<p>Live work you can open and try, including Milrcorr, StrongFoam, SuperPatch products, Renew Implants and pirx.ca.</p>",
})}
${collectionIndex([[cases.length, "named systems"], ["Live", "screens, not mockups"], ["Open", "the work and try it"]])}
<ul class="cards">${cards}</ul>
</main>`,
  });
  await writePage("portfolio/index.html", html);
}

async function renderProduct(item) {
  const path = `/products/${item.slug}/`;
  const url = `${SITE}${path}`;
  const title = pageTitle(item.name);
  const description = clip(item.description, 155);
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Products", href: "/products/", url: `${SITE}/products/` },
    { name: item.name, href: path, url },
  ];
  const app = {
    "@type": ["SoftwareApplication", "Product"],
    "@id": `${url}#product`,
    name: item.name,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: item.description,
    url,
    image: `${SITE}${item.image}`,
    creator: { "@id": ORG_ID },
    sameAs: item.sameAs,
  };
  const og = await plateOrPhoto(`product-${item.slug}`, "Product", item.name, item.image);
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: item.imageAlt,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${url}#webpage`,
      url,
      name: item.name,
      description: item.description,
      image: `${SITE}${item.image}`,
    }), [crumbList(crumbs), app]),
    body: `<main id="top" class="site-page product-page">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "Product",
  title: esc(item.name),
  dek: `<p>${esc(item.description)}</p>`,
  actions: pageActions(item.sameAs, "Open the live system", `/portfolio/${item.caseSlug}/`, "Read the build note"),
  media: assetMedia(item.image, item.imageAlt),
})}
<section class="product-page__experience editorial-split">
${sectionHeading("Use the real thing", "Open it. Try it. Decide from the work.")}
<div class="editorial-split__body"><p>${esc(item.description)}</p><p>What you see here is the shipped interface—not a concept render or a speculative roadmap.</p></div>
</section>
<section class="experience-panel" aria-label="${esc(item.name)} product preview">
<div class="experience-panel__bar"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><strong>${esc(item.name)}</strong></div>
<div class="experience-panel__viewport">${assetMedia(item.image, item.imageAlt, { lazy: true })}</div>
</section>
<section class="product-page__next premium-cta">
${sectionHeading("Need it shaped around your workflow?", "Use the product—or commission the system that fits.")}
${placeholder(placeholders.product)}
${pageActions("/start/", "Start a project", `/portfolio/${item.caseSlug}/`, "Read the portfolio note")}
</section>
</main>`,
  });
  await writePage(`products/${item.slug}/index.html`, html);
}

async function renderProductsHub() {
  const url = `${SITE}/products/`;
  const title = "Products | Abracadabra AI";
  const description = "Ready-made tools you can try today: Schema and Super Funnel.";
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: "Products", href: "/products/", url },
  ];
  const list = {
    "@type": "ItemList",
    name: "Products",
    numberOfItems: products.length,
    itemListElement: products.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "SoftwareApplication",
        name: item.name,
        url: `${SITE}/products/${item.slug}/`,
      },
    })),
  };
  const og = await plateOrPhoto("products", "Products", "Two systems, live", null);
  const cards = products.map((item) => `<li><a href="/products/${item.slug}/">${assetMedia(item.image, item.imageAlt, { lazy: true })}<strong>${esc(item.name)}</strong><span>${esc(item.description)}</span></a></li>`).join("");
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: og.alt,
    footer: "compact",
    json: baseGraph(pageNode({
      type: "CollectionPage",
      id: `${url}#webpage`,
      url,
      name: "Products",
      description,
    }), [crumbList(crumbs), list]),
    body: `<main id="top" class="site-page collection-page collection-page--products">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "Products",
  title: "Software you can use today.",
  dek: "<p>Ready-made tools you can try today: Schema and Super Funnel.</p>",
})}
${collectionIndex([[products.length, "products"], ["Live", "and ready to open"], ["Real", "screens and workflows"]])}
<ul class="cards cards--pair">${cards}</ul>
</main>`,
  });
  await writePage("products/index.html", html);
}

async function renderCourse() {
  const path = "/course/llm-leverage/";
  const url = `${SITE}${path}`;
  const title = "LLM Leverage course | Abracadabra AI";
  const description = clip(course.description, 155);
  const crumbs = [
    { name: "Home", href: "/", url: `${SITE}/` },
    { name: course.name, href: path, url },
  ];
  const node = {
    "@type": "Course",
    "@id": `${url}#course`,
    name: course.name,
    description: course.description,
    url,
    provider: { "@id": ORG_ID },
    image: `${SITE}${course.image}`,
    sameAs: course.sameAs,
    hasCourseInstance: [
      { "@type": "CourseInstance", courseMode: "self-paced", name: "Self-paced" },
      { "@type": "CourseInstance", courseMode: "workshop", name: "Workshop" },
    ],
  };
  const og = await plateOrPhoto("course-llm-leverage", "Course", course.name, course.image);
  const html = shell({
    title,
    description,
    canonical: url,
    robots: "index,follow",
    ogImage: og.url,
    ogWidth: og.width,
    ogHeight: og.height,
    ogAlt: course.imageAlt,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${url}#webpage`,
      url,
      name: course.name,
      description: course.description,
      image: `${SITE}${course.image}`,
    }), [crumbList(crumbs), node]),
    body: `<main id="top" class="site-page course-page">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "LLM Leverage",
  title: "Learn to get real work done with AI.",
  dek: `<p>${esc(course.description)}</p>\n<p>Built for class or self-paced study. Includes four workshop decks, practice exercises, templates, a glossary and a capstone gallery.</p>`,
  actions: pageActions(course.sameAs, "Open the course", "/portfolio/llm-leverage/", "Read the build note"),
  media: assetMedia("/assets/course-hero-bg.webp", course.imageAlt),
})}
<section class="course-page__path editorial-split">
${sectionHeading("A complete learning path", "Learn alone—or bring the room with you.")}
<div class="editorial-split__body"><p>Twelve modules turn better prompting into a repeatable working method. The workshop path gives a team the same language, practice, and operating rhythm.</p><p>Every module ends with a quiz. The capstone gallery makes the work visible rather than leaving completion as a checkbox.</p></div>
</section>
<section class="experience-panel experience-panel--course" aria-label="LLM Leverage course preview">
<div class="experience-panel__bar"><span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span><strong>LLM Leverage</strong></div>
<div class="experience-panel__viewport">${assetMedia(course.image, course.imageAlt, { lazy: true })}</div>
</section>
<section class="premium-cta">
${sectionHeading("Put it into practice", "Open the course or bring the workshop to your team.")}
${placeholder(placeholders.course)}
${pageActions(course.sameAs, "Open the course", "/start/", "Plan a team rollout")}
</section>
</main>`,
  });
  await writePage("course/llm-leverage/index.html", html);
}

function siteUrls() {
  const paths = [
    "/services/",
    ...offerings.map((item) => `/services/${item.slug}/`),
    "/portfolio/",
    ...cases.map((item) => `/portfolio/${item.slug}/`),
    "/products/",
    ...products.map((item) => `/products/${item.slug}/`),
    "/course/llm-leverage/",
    "/start/",
    "/start/thanks/",
  ];
  return paths.map((path) => `  <url>\n    <loc>${SITE}${path}</loc>\n    <lastmod>${MODIFIED}</lastmod>\n  </url>`).join("\n");
}

function siteRedirects() {
  const paths = [
    "/services",
    ...offerings.map((item) => `/services/${item.slug}`),
    "/portfolio",
    ...cases.map((item) => `/portfolio/${item.slug}`),
    "/products",
    ...products.map((item) => `/products/${item.slug}`),
    "/course/llm-leverage",
    "/start",
    "/start/thanks",
  ];
  const rewrites = paths.flatMap((path) => [
    `${path} ${path}/index.html 200`,
    `${path}/ ${path}/index.html 200`,
  ]);
  const moved = [
    "/offerings /services/ 301",
    "/offerings/ /services/ 301",
    ...offerings.flatMap((item) => [
      `/offerings/${item.slug} /services/${item.slug}/ 301`,
      `/offerings/${item.slug}/ /services/${item.slug}/ 301`,
    ]),
    "/portfolio/showdesk /portfolio/ 301",
    "/portfolio/showdesk/ /portfolio/ 301",
    "/portfolio/canadian-discount-appliances /portfolio/ 301",
    "/portfolio/canadian-discount-appliances/ /portfolio/ 301",
    "/products/showdesk /portfolio/ 301",
    "/products/showdesk/ /portfolio/ 301",
  ];
  return [...rewrites, ...moved].join("\n");
}

function llmsPages() {
  const lines = [
    `- Services: ${SITE}/services/`,
    ...offerings.map((item) => `- ${salesPages[item.slug].headline}: ${SITE}/services/${item.slug}/`),
    `- Portfolio: ${SITE}/portfolio/`,
    ...cases.map((item) => `- ${item.name}: ${SITE}/portfolio/${item.slug}/`),
    `- Products: ${SITE}/products/`,
    ...products.map((item) => `- ${item.name}: ${SITE}/products/${item.slug}/`),
    `- LLM Leverage course: ${SITE}/course/llm-leverage/`,
  ];
  return lines.join("\n");
}


function homeProofHtml() {
  return `<section id="proof" aria-labelledby="proof-title">
  <div class="wrap">
    <p class="kicker">Search &amp; AI visibility</p>
    <h2 id="proof-title">Get found in AI search.</h2>
    <p>PiRX went from near-zero to 398K search impressions and 46.5K AI-feature impressions in 90 days.</p>
    <p class="fine">Google Search Console, Jul 18 to Oct 17, 2026. The AI-feature count is separate and is not added to the search total.</p>
    ${pirxChartHtml({ sizes: "(min-width: 860px) 46vw, 100vw" })}
    <p data-actions><a class="btn btn--primary" href="/#start">Start a project</a><a class="btn btn--tertiary" href="/services/ai-visibility/">Get found in AI search <span class="btn__arrow" aria-hidden="true">→</span></a></p>
  </div>
</section>`;
}

export function clientProofHtml(entries, caseList = cases) {
  if (!entries?.length) return "";
  const cards = entries.map((entry) => {
    const item = caseList.find((row) => row.slug === entry.slug);
    if (!item) throw new Error(`Unknown proof slug ${entry.slug}`);
    const also = (entry.also || []).map((slug) => {
      const extra = caseList.find((row) => row.slug === slug);
      if (!extra) throw new Error(`Unknown proof slug ${slug}`);
      return extra.summary;
    });
    const quote = entry.quote && entry.person
      ? `<blockquote class="proof-card__quote"><p>${esc(entry.quote)}</p><footer>${esc(entry.person)}${entry.role ? `, ${esc(entry.role)}` : ""}</footer></blockquote>`
      : "";
    return `<li class="card proof-card"><div class="card__body"><p class="card__title">${esc(item.name)}</p><p class="card__dek">${esc([item.summary, ...also].join(" "))}</p>${quote}<p class="card__actions"><a class="btn btn--tertiary" href="/portfolio/${esc(item.slug)}/">Read the case study <span class="btn__arrow" aria-hidden="true">→</span></a></p></div></li>`;
  }).join("");
  const pirx = caseList.find((row) => row.slug === "pirx");
  const figures = (pirx?.proofFigures || []).map((figure) => `<p class="num"><strong>${esc(figure.value)}</strong> ${esc(figure.label)}</p>`).join("");
  const metrics = figures
    ? `<div class="proof-metrics" data-num>${figures}<p class="proof-metrics__caption">${esc(pirx.proofCaption || "")}</p></div>`
    : "";
  return `<section id="clients" class="section proof-band" aria-labelledby="clients-title">
  <div class="wrap">
    <p class="eyebrow">Proof</p>
    <h2 id="clients-title">Work we can name.</h2>
    <ul class="proof-grid">${cards}</ul>
    ${metrics}
  </div>
</section>`;
}

async function renderStart() {
  const url = `${SITE}/start/`;
  const html = shell({
    title: "Start a project | Abracadabra AI",
    description: "Tell us how the work gets done. We reply within one working day.",
    canonical: url,
    robots: "index,follow",
    ogImage: `${SITE}/assets/og/home.jpg`,
    ogWidth: "1200",
    ogHeight: "630",
    ogAlt: HOME_OG_ALT,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${url}#webpage`,
      url,
      name: "Start a project",
      description: "Tell us how the work gets done. We reply within one working day.",
    }), []),
    body: `<main id="top" class="site-page start-page">
${pageHero({
  kicker: "Start",
  title: "Start a project",
  dek: "<p>Tell us how your work gets done, and we will build software that fits it.</p>",
})}
${intakeForm()}
</main>`,
  });
  await writePage("start/index.html", html);
  const thanks = shell({
    title: "Got it | Abracadabra AI",
    description: "We reply within one working day.",
    canonical: `${SITE}/start/thanks/`,
    robots: "noindex",
    ogImage: `${SITE}/assets/og/home.jpg`,
    ogWidth: "1200",
    ogHeight: "630",
    ogAlt: HOME_OG_ALT,
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${SITE}/start/thanks/#webpage`,
      url: `${SITE}/start/thanks/`,
      name: "Got it",
      description: "We reply within one working day.",
    }), []),
    body: `<main id="top" class="site-page confirmation-page">
<section class="confirmation-page__panel">
<p class="eyebrow">Message received</p>
<p class="confirmation-page__mark" aria-hidden="true">✓</p>
<h1>Got it. We reply within one working day.</h1>
<p class="lede">If you need to add something, email <a href="mailto:houdini@abra-ca-dabra.app">houdini@abra-ca-dabra.app</a>.</p>
<p class="confirmation-page__actions" data-actions><a class="btn btn--primary" href="/portfolio/">See the work</a><a class="btn btn--tertiary" href="/">Back to home <span class="btn__arrow" aria-hidden="true">→</span></a></p>
</section>
</main>`,
  });
  await writePage("start/thanks/index.html", thanks);
}

async function renderMissing() {
  const html = shell({
    title: "Page not found | Abracadabra AI",
    description: "That page vanished.",
    canonical: `${SITE}/404.html`,
    robots: "noindex",
    ogImage: `${SITE}/assets/og/home.jpg`,
    ogWidth: "1200",
    ogHeight: "630",
    ogAlt: HOME_OG_ALT,
    footer: "compact",
    json: baseGraph(pageNode({
      type: "WebPage",
      id: `${SITE}/404.html#webpage`,
      url: `${SITE}/404.html`,
      name: "Page not found",
      description: "That page vanished.",
    }), []),
    body: `<main id="top" class="site-page page-missing">
<p class="eyebrow">404</p>
<h1>That page vanished.</h1>
<p class="lede">The page is gone. The work is still here.</p>
<p class="hero__actions" data-actions><a class="btn btn--primary" href="/start/">Start a project</a><a class="btn btn--secondary" href="/">Back to home</a><a class="btn btn--tertiary" href="/portfolio/">See the work <span class="btn__arrow" aria-hidden="true">→</span></a></p>
<ul class="missing-links"><li><a href="/services/">Services</a></li><li><a href="/portfolio/">Work</a></li><li><a href="/products/">Products</a></li><li><a href="/blog">Blog</a></li></ul>
</main>`,
  });
  await writePage("404.html", html);
}

async function patchHome() {
  const path = join(root, "index.html");
  const proof = JSON.parse(await readFile(join(root, "content/proof.json"), "utf8"));
  let html = await readFile(path, "utf8");
  html = fill(html, "<!-- SITE-NAV -->", "<!-- /SITE-NAV -->", siteHeader({ home: true }));
  html = fill(html, "<!-- SITE-FOOT -->", "<!-- /SITE-FOOT -->", siteFooter({ band: "none" }));
  html = fill(html, "<!-- MODELS -->", "<!-- /MODELS -->", modelsHtml());
  html = fill(html, "<!-- OFFERINGS -->", "<!-- /OFFERINGS -->", offeringsHtml());
  html = fill(html, "<!-- CLIENTS -->", "<!-- /CLIENTS -->", clientProofHtml(proof.entries));
  html = fill(html, "<!-- AI-SEARCH-TILE -->", "<!-- /AI-SEARCH-TILE -->", "");
  html = fill(html, "<!-- PROOF -->", "<!-- /PROOF -->", homeProofHtml());
  await writeFile(path, smartQuotesHtml(html));
}

async function patchFilms() {
  const path = join(root, "films.html");
  let html = await readFile(path, "utf8");
  html = fill(html, "<!-- SITE-NAV -->", "<!-- /SITE-NAV -->", siteHeader());
  html = fill(html, "<!-- SITE-FOOT -->", "<!-- /SITE-FOOT -->", siteFooter({ band: "compact" }));
  await writeFile(path, smartQuotesHtml(html));
}

async function patchSitemap() {
  const path = join(root, "sitemap.xml");
  let xml = await readFile(path, "utf8");
  xml = xml.replace(
    "<loc>https://abra-ca-dabra.app/</loc>\n    <lastmod>2026-10-07</lastmod>",
    `<loc>https://abra-ca-dabra.app/</loc>\n    <lastmod>${MODIFIED}</lastmod>`,
  );
  xml = fill(xml, "<!-- site-urls -->", "<!-- /site-urls -->", siteUrls());
  await writeFile(path, xml);
}

async function patchRedirects() {
  const path = join(root, "_redirects");
  let text = await readFile(path, "utf8");
  text = fill(text, "# site-redirects", "# /site-redirects", siteRedirects());
  await writeFile(path, text);
}

async function patchLlms() {
  const path = join(root, "llms.txt");
  let text = await readFile(path, "utf8");
  text = text.replace(/^Last updated: .+$/m, `Last updated: ${MODIFIED}`);
  text = fill(text, "<!-- site-pages:start -->", "<!-- site-pages:end -->", llmsPages());
  await writeFile(path, text);
}

export async function buildSitePages() {
  await writeServiceImages();
  await writePirxChartImages();
  await rm(join(root, "offerings"), { recursive: true, force: true });
  await renderOfferingsHub();
  for (const item of offerings) await renderOffering(item);
  await renderPortfolioHub();
  for (const item of cases) await renderCase(item);
  await renderProductsHub();
  for (const item of products) await renderProduct(item);
  await renderCourse();
  await renderStart();
  await renderMissing();
  await patchHome();
  await patchFilms();
  await patchSitemap();
  await patchRedirects();
  await patchLlms();
  console.log(`site pages ${MODIFIED}`);
}

if (process.argv[1] && process.argv[1].endsWith("site-pages.mjs")) {
  await buildSitePages();
}
