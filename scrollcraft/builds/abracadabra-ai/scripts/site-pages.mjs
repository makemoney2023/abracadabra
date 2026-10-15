import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { ORG_ID, PERSON_ID, SITE, WEBSITE_ID } from "./blog.mjs";
import { siteFooter, siteHeader } from "./site-chrome.mjs";
import {
  MODIFIED,
  OFFERINGS_HEADING,
  OFFERINGS_KICKER,
  PLACEHOLDER,
  cases,
  course,
  familyLogos,
  gatewayLogos,
  offerings,
  placeholders,
  products,
} from "./site-data.mjs";
import { READINESS_URL, processIntro, processSteps, salesPages } from "./service-sales.mjs";

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
  return `<aside class="placeholder"><strong>${esc(PLACEHOLDER)}</strong><p>${esc(text)}</p></aside>`;
}

function builtOn(tags) {
  return `Built on ${tags.join(", ")}. ${OFFERINGS_KICKER}`;
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
  return `<section id="models" class="sc-section models" aria-labelledby="models-title">
    <div class="sc-wrap">
      <h2 id="models-title" class="models__label">Every major model, one gateway</h2>
      ${marquee(gatewayLogos, "90s", false)}
      ${marquee(familyLogos, "70s", true)}
    </div>
  </section>`;
}

function offeringsHtml() {
  const cards = offerings.map((item) => {
    const page = salesPages[item.slug];
    return `<li><a href="/services/${item.slug}/"><h3>${esc(page.headline)}</h3><p>${esc(item.card)}</p><p class="services__tag">Built on ${esc(item.builtOn.join(", "))}</p></a></li>`;
  }).join("");
  return `<section id="services" class="sc-section services" aria-labelledby="services-title">
    <div class="sc-wrap">
      <p class="services__kicker">${esc(OFFERINGS_KICKER)}</p>
      <h2 id="services-title" class="sc-display sc-display--md">${esc(OFFERINGS_HEADING)}</h2>
      <ul class="services__grid">${cards}</ul>
    </div>
  </section>`;
}

function mediaSlot(slug, index, kind) {
  const cls = kind === "hero" ? "content-hero-photo" : "post-figure";
  const note = kind === "hero" ? "Hero image for this service." : "Image for this service.";
  const n = String(index).padStart(2, "0");
  return `<figure class="${cls}">
  <picture>
    <source srcset="/blog/media/services/${esc(slug)}/${n}.webp" type="image/webp">
    <img src="/blog/media/services/${esc(slug)}/${n}.jpg" alt="" width="1600" height="1000">
  </picture>
  <figcaption>${esc(PLACEHOLDER)}. ${esc(note)}</figcaption>
</figure>`;
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
  const titleLines = wrapLines(title).map((line, index) => (
    `<text x="72" y="${250 + index * 68}" fill="#F5F0E8" font-family="sans-serif" font-size="52">${esc(line)}</text>`
  )).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <rect width="1200" height="630" fill="#070706"/>
    <text x="72" y="150" fill="#FF4B24" font-family="sans-serif" font-size="24">${esc(label)}</text>
    ${titleLines}
  </svg>`;
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(file);
}

function shell({ title, description, canonical, robots, ogImage, ogWidth, ogHeight, ogAlt, json, body }) {
  const graph = JSON.stringify(json);
  if (graph.includes("PLACEHOLDER") || graph.includes("AggregateRating") || /"offers"\s*:/.test(graph)) {
    throw new Error(`Schema for ${canonical} includes a banned field`);
  }
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<!-- PLACEHOLDER — needs Christopher: Google Search Console verification meta -->
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
${body}
${siteFooter()}
</body>
</html>
`;
}

async function writePage(relativePath, html) {
  const file = join(root, relativePath);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, html);
}

function baseGraph(pageNode, extra) {
  return {
    "@context": "https://schema.org",
    "@graph": [orgNode(), websiteNode(), personNode(), pageNode, ...extra],
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
  if (photo) {
    return {
      url: `${SITE}${photo}`,
      width: "1600",
      height: "1000",
      alt: title,
    };
  }
  const relative = `assets/og/${key}.png`;
  await writePlate(join(root, relative), label, title);
  return {
    url: `${SITE}/${relative}`,
    width: "1200",
    height: "630",
    alt: `${title}, Abracadabra AI`,
  };
}

function salesActions() {
  return `<p class="sales-actions"><a class="sales-primary" href="/#brief">Show us how it works</a><a class="sales-secondary" href="${esc(READINESS_URL)}">AI Readiness Check</a></p>`;
}

function proofStrip(items) {
  return `<ul class="proof-strip">${items.map((item) => `<li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join("")}</ul>`;
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
  const og = await plateOrPhoto(item.slug, "Service", page.headline, null);
  const questions = page.faqs.map(([name, text]) => `<h3>${esc(name)}</h3>\n<p>${esc(text)}</p>`).join("\n");
  const steps = processSteps.map((step) => `<li><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join("");
  const proofs = page.proofs.map((proof) => `<article class="proof-card"><h3>${esc(proof.title)}</h3><p>${esc(proof.text)}</p><p><a href="${esc(proof.href)}">${esc(proof.link)}</a></p></article>`).join("\n");
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
    }), [crumbList(crumbs), service, faq]),
    body: `<main class="site-page sales">
${visibleCrumbs(crumbs)}
<p class="kicker">${esc(OFFERINGS_KICKER)}</p>
<h1>${esc(page.headline)}</h1>
<p class="sales-dek">${esc(page.dek)}</p>
${leadHtml(page.lead)}
${salesActions()}
${proofStrip(page.strip)}
${mediaSlot(item.slug, 1, "hero")}
<section>
<h2>${esc(page.problemTitle)}</h2>
${page.problem.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n")}
</section>
<section>
<h2>What changes</h2>
${cardGrid("outcome-grid", page.outcomes)}
</section>
${mediaSlot(item.slug, 2, "body")}
<section>
<h2>Three places it shows up</h2>
${cardGrid("use-grid", page.uses)}
</section>
${capabilityHtml(page.capability)}
<section>
<h2>How it gets built</h2>
<p>${esc(processIntro)}</p>
<ol class="process">${steps}</ol>
</section>
<section>
<h2>Off the shelf, a hire, or us</h2>
<p>${esc(page.compareIntro)}</p>
${comparisonTable(page.rows)}
</section>
${mediaSlot(item.slug, 3, "body")}
<section>
<h2>Work we can name</h2>
${proofs}
</section>
<p class="cloud-line">${esc(page.cloudflare)} ${esc(builtOn(item.builtOn))}</p>
<section class="price-block">
<h2>Pricing</h2>
<p>Contact for pricing. We price the job after the brief, not from a public rate card.</p>
<p><a href="/#brief">Show us how it works</a></p>
</section>
<section>
<h2>Questions</h2>
${questions}
</section>
<section class="sales-close">
<h2>See it on your work</h2>
<p>${esc(page.close)}</p>
${salesActions()}
</section>
</main>`,
  });
  await writePage(`services/${item.slug}/index.html`, html);
}

async function renderOfferingsHub() {
  const url = `${SITE}/services/`;
  const title = "What we build and run | Abracadabra AI";
  const description = "Ten systems Abracadabra AI builds and runs on Cloudflare's global network. Safe code execution ships inside AI assistants.";
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
  const cards = offerings.map((item) => {
    const page = salesPages[item.slug];
    const note = item.slug === "safe-code-execution" ? " Part of AI assistants." : "";
    return `<li><a href="/services/${item.slug}/"><strong>${esc(page.headline)}</strong><span>${esc(page.description)}${esc(note)}</span></a></li>`;
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
      name: OFFERINGS_HEADING,
      description,
    }), [crumbList(crumbs), listNode]),
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">${esc(OFFERINGS_KICKER)}</p>
<h1>${esc(OFFERINGS_HEADING)}</h1>
<p>Ten systems we build and run. Safe code execution is a capability of the assistants, and it keeps its own page so the limit can be read on its own.</p>
<ul class="cards">${cards}</ul>
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
  const productLink = products.some((product) => product.slug === item.slug)
    ? `<p><a href="/products/${item.slug}/">Product page</a></p>`
    : "";
  const courseLink = item.slug === "llm-leverage"
    ? `<p><a href="/course/llm-leverage/">Course page</a></p>`
    : "";
  const live = item.sameAs ? `<p><a href="${esc(item.sameAs)}">Open the live system</a></p>` : "";
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
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">Portfolio</p>
<h1>${esc(item.name)}</h1>
${item.body.map((paragraph) => `<p>${esc(paragraph)}</p>`).join("\n")}
${live}
${relatedHtml}
${productLink}
${courseLink}
${placeholder(placeholders.portfolio)}
</main>`,
  });
  await writePage(`portfolio/${item.slug}/index.html`, html);
}

async function renderPortfolioHub() {
  const url = `${SITE}/portfolio/`;
  const title = "Portfolio | Abracadabra AI";
  const description = "Named work we can show, including SuperPatch products, StrongFoam, Renew Implants, and pirx.ca.";
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
  const og = await plateOrPhoto("portfolio", "Portfolio", "Working systems", null);
  const cards = cases.map((item) => `<li><a href="/portfolio/${item.slug}/"><strong>${esc(item.name)}</strong><span>${esc(item.summary)}</span></a></li>`).join("");
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
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">Portfolio</p>
<h1>Working systems, already in the world.</h1>
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
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">Product</p>
<h1>${esc(item.name)}</h1>
<p>${esc(item.description)}</p>
<p><a href="${esc(item.sameAs)}">Open the live system</a></p>
<p><a href="/portfolio/${item.caseSlug}/">Portfolio note</a></p>
${placeholder(placeholders.product)}
</main>`,
  });
  await writePage(`products/${item.slug}/index.html`, html);
}

async function renderProductsHub() {
  const url = `${SITE}/products/`;
  const title = "Products | Abracadabra AI";
  const description = "Showdesk, Schema, and Super Funnel. Public prices are not listed because none are published.";
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
  const og = await plateOrPhoto("products", "Products", "Products", null);
  const cards = products.map((item) => `<li><a href="/products/${item.slug}/"><strong>${esc(item.name)}</strong><span>${esc(item.description)}</span></a></li>`).join("");
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
      name: "Products",
      description,
    }), [crumbList(crumbs), list]),
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">Products</p>
<h1>Products</h1>
<ul class="cards">${cards}</ul>
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
    body: `<main class="site-page">
${visibleCrumbs(crumbs)}
<p class="kicker">Course</p>
<h1>${esc(course.name)}</h1>
<p>${esc(course.description)}</p>
<p>The public course site is built for class and self-paced study. It lists 4 workshop decks, static sandboxes, templates, a glossary, and a capstone gallery.</p>
<p><a href="${esc(course.sameAs)}">Open the course</a></p>
<p><a href="/portfolio/llm-leverage/">Portfolio note</a></p>
${placeholder(placeholders.course)}
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

async function patchHome() {
  const path = join(root, "index.html");
  let html = await readFile(path, "utf8");
  html = fill(html, "<!-- SITE-NAV -->", "<!-- /SITE-NAV -->", siteHeader());
  html = fill(html, "<!-- SITE-FOOT -->", "<!-- /SITE-FOOT -->", siteFooter());
  html = fill(html, "<!-- MODELS -->", "<!-- /MODELS -->", modelsHtml());
  html = fill(html, "<!-- OFFERINGS -->", "<!-- /OFFERINGS -->", offeringsHtml());
  await writeFile(path, html);
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
  await rm(join(root, "offerings"), { recursive: true, force: true });
  await renderOfferingsHub();
  for (const item of offerings) await renderOffering(item);
  await renderPortfolioHub();
  for (const item of cases) await renderCase(item);
  await renderProductsHub();
  for (const item of products) await renderProduct(item);
  await renderCourse();
  await patchHome();
  await patchSitemap();
  await patchRedirects();
  await patchLlms();
  console.log(`site pages ${MODIFIED}`);
}

if (process.argv[1] && process.argv[1].endsWith("site-pages.mjs")) {
  await buildSitePages();
}
