/**
 * HQ product page (/products/hq/), the homepage #hq feature section, and the HQ structured data.
 * Copy is company voice and generic on purpose: it states only what HQ's own docs and the
 * social-posting facts from Client Services support. No numbers, prices, ratings or client names.
 * Every picture is an illustrated mockup with sample content (see hq-visuals.mjs).
 */
import { NETWORKS, figure, flowDiagramTall, flowDiagramWide } from "./hq-visuals.mjs";
import { hqProduct } from "./site-data.mjs";

export const HQ_SLUG = "hq";
export const HQ_PATH = "/products/hq/";
export const READINESS = "https://check.abra-ca-dabra.app/check";
export const HQ_ARTICLE = "/blog/how-client-work-flows-through-hq";
export const AGENT_ARTICLE = "/blog/what-is-an-ai-agent";
export const COURSE = "/course/llm-leverage/";
export const CLOUDFLARE_ARTICLE = "/blog/why-we-build-on-cloudflare";
export const HQ_DESCRIPTION = hqProduct.description;
export const HQ_PAGE_DESCRIPTION = "HQ is where our team and digital workers deliver your work. Review it, approve it, and schedule approved posts to Instagram, LinkedIn and more.";
export const HQ_IMAGE = hqProduct.image;
export const HQ_IMAGE_ALT = hqProduct.imageAlt;

export const hqFaqs = [
  ["What is HQ?", "HQ is the client workspace where Abracadabra's team and digital workers deliver your work. It holds your requests, your board, your finished work, your folders and your social calendar."],
  ["Does anything reach me or my social networks without approval?", "No. Work an agent files is held until it has been reviewed and released. Only finished work you have approved can be scheduled or posted."],
  ["Which social networks does HQ post to?", `${NETWORKS.slice(0, -1).join(", ")} and ${NETWORKS.at(-1)}. Your accounts connect through each network's own sign-in.`],
  ["What are digital workers?", "AI agents we set up for your business, each with a clear role. They work from cards on your board, use skills picked for each task, and file their work for review."],
  ["How do I get started?", "Take the Readiness Check, a five-to-seven-minute questionnaire about how your business runs today. It scores readiness, growth and website visibility, and names the stage your business is at. It gives you next steps for your business, and you can book a thirty-minute working session if you want one."],
];

const flowSteps = [
  ["Request", "Send a request by email, through the start-a-project form, or as a note on a piece in your space. HQ logs it and puts it in front of Client Services."],
  ["Plan", "A card opens on your project board, tied to the request it came from, with a plan for what each piece of work must make."],
  ["Agents build", "Each digital worker takes a piece, picks the skills it needs for the task, and builds. It files the work to HQ, where the work is held."],
  ["Review", "Client Services checks the work against your request, and a person on our team signs off. If something is off, it goes back to the agent with a note."],
  ["You approve", "Once the work is released to your space, you open a piece and approve it, ask for a change, or remove it. A change request opens a new card."],
  ["Delivery", "Finished work sits in named folders in your space, like Blog or Social. Each file shows its type, and pictures show a small thumbnail."],
  ["Social calendar", "Only approved work can be scheduled to your social networks. Once a piece is approved and your accounts are connected, it is scheduled into your next open slot."],
];

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function networkList() {
  return `<ul class="hq-networks" aria-label="Social networks HQ can post to">${NETWORKS.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>`;
}

function flowFigure() {
  return `<figure class="hq-flow">
<div class="hq-flow__wide">${flowDiagramWide({ mode: "live", id: "hq-flow-wide" })}</div>
<div class="hq-flow__tall">${flowDiagramTall({ mode: "live", id: "hq-flow-tall" })}</div>
<figcaption>Illustrative diagram. Simplified.</figcaption>
</figure>`;
}

function split({ id, eyebrow, title, intro, bullets = [], extra = "", media, flip = false }) {
  const list = bullets.length ? `<ul class="hq-points">${bullets.map(([head, text]) => `<li><strong>${esc(head)}</strong> ${text}</li>`).join("")}</ul>` : "";
  return `<section id="${id}" class="hq-section hq-split${flip ? " hq-split--flip" : ""}" aria-labelledby="${id}-title">
<div class="hq-split__copy">
<p class="eyebrow">${esc(eyebrow)}</p>
<h2 id="${id}-title">${esc(title)}</h2>
${intro}
${list}
${extra}
</div>
<div class="hq-split__media">${media}</div>
</section>`;
}

export function hqPageBody({ crumbs, pageActions, sectionHeading }) {
  const steps = `<ol class="hq-steps">${flowSteps.map(([title, text], i) => `<li><span class="hq-steps__n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></li>`).join("")}</ol>`;
  const faq = `<div class="faq-list">${hqFaqs.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div>`;
  return `<main id="top" class="site-page product-page hq-page">
<header class="page-hero page-header hq-hero">
<div class="page-hero__copy hq-hero__copy">
${crumbs}
<p class="eyebrow">Product</p>
<h1>One place to request, review and approve the work.</h1>
<div class="page-header__lede lede"><p>HQ is the workspace where our team and a crew of digital workers get your work done. Nothing reaches your folders, and nothing reaches your social networks, until it has been reviewed and you have approved it.</p><p>HQ is for CEOs and business owners leveraging AI across their businesses.</p></div>
${pageActions(READINESS, "Take the Readiness Check", HQ_ARTICLE, "How client work moves through HQ")}
</div>
<div class="hq-hero__media">${figure("board", { id: "hq-hero-board" })}</div>
</header>

<section id="how-work-flows" class="hq-section" aria-labelledby="how-work-flows-title">
${sectionHeading("How work flows", "From request to calendar, one path.", "Digital workers do the building. People check it. You decide what goes out.")}
${flowFigure()}
${steps}
<p class="hq-more">Want the longer walk-through? Read <a href="${HQ_ARTICLE}">How Client Work Moves Through HQ and Our AI Agents</a>.</p>
</section>

${split({
  id: "review",
  eyebrow: "Review and approval",
  title: "Checked before it reaches you. Approved by you before it goes anywhere.",
  intro: "<p>HQ holds finished work until people have checked it. You see it when it is ready, and you make the call.</p>",
  bullets: [
    ["Held by default.", "Work an agent files stays out of your folders, previews, shared links and search until it is released."],
    ["Client Services reviews first.", "It checks the work against your request, and sends it back to the agent with a note when something is off."],
    ["You make the call.", "Approve a piece, ask for a change, or remove it. Removed work can be put back in your Library."],
  ],
  media: figure("review", { id: "hq-review-mock" }),
})}

${split({
  id: "folders",
  eyebrow: "Folders and file types",
  title: "Named folders. Every file labelled.",
  intro: "<p>Finished work lands in named folders in your space, like Blog, Social or Brand. Each file shows its type, such as image, PDF, document or spreadsheet, and pictures show a thumbnail, so you can tell what is what without opening everything.</p><p>Your Library shows finished work as a wall of pictures: articles, social posts, pictures, video, websites and documents. You can share a piece with a read-only view link.</p>",
  media: figure("folders", { id: "hq-folders-mock" }),
  flip: true,
})}

${split({
  id: "social",
  eyebrow: "Social, automated",
  title: "Approved work goes onto your social calendar.",
  intro: `<p>Automated social posting is live in HQ, since October 21, 2026. Each client has a Social page with a calendar. Connect your accounts through each network's own sign-in. Once a piece is approved and your accounts are connected, it is scheduled into your next open slot.</p>${networkList()}`,
  bullets: [
    ["Approved work only.", "Only finished work you have approved can be scheduled or posted. Work that is still held cannot."],
    ["Nothing goes out on its own.", "Nothing is posted until you approve it."],
  ],
  media: figure("social", { id: "hq-social-mock" }),
})}

${split({
  id: "digital-workers",
  eyebrow: "Digital workers",
  title: "A team of agents that get work done, like magic.",
  intro: `<p>Behind every card is a digital worker: an AI agent set up for your business with a clear role. Each client has a lead agent, and some have helper agents too. They read the card, build the work and file it to HQ for review. Think of it as a bench of specialists you do not have to hire or manage.</p>
<h3>Skills chosen for every task</h3>
<p>Agents do not carry a fixed toolkit. For each card, an agent searches HQ's skill library for what the task needs, such as copywriting, design or search. It loads the skills that fit, attaches the skill packs to the card, and follows them. When it files the work, it lists the skills it used and says whether each one helped, with a short note.</p>
<p>New to agents? Read <a href="${AGENT_ARTICLE}">What Is an AI Agent? A Plain Answer for Owners</a>. Want your own team to get more from AI first? Take the <a href="${COURSE}">LLM Leverage course</a>, a self-paced course for better answers from any model.</p>`,
  media: figure("workers", { id: "hq-workers-mock" }),
  flip: true,
})}

<section id="security" class="hq-section hq-security" aria-labelledby="security-title">
<p class="eyebrow">Security and AI</p>
<h2 id="security-title">Built on Cloudflare.</h2>
<p>HQ runs on Cloudflare Workers, like our website and our Readiness Check. Each point below is something HQ uses today. Our note on <a href="${CLOUDFLARE_ARTICLE}">why we build on Cloudflare</a> has the sources and says which tools we use and which we only plan to.</p>
<ul class="hq-points">
<li><strong>Attacks are stopped at the edge.</strong> HQ is served through the Cloudflare network, which detects and mitigates DDoS attacks automatically. <a href="https://developers.cloudflare.com/ddos-protection/">Cloudflare's docs</a> list this protection as available on all plans.</li>
<li><strong>Files and records are encrypted.</strong> Your files are stored in Cloudflare R2 and HQ's records in Cloudflare D1. Cloudflare's docs say <a href="https://developers.cloudflare.com/r2/reference/data-security/">R2</a> and <a href="https://developers.cloudflare.com/d1/reference/data-security/">D1</a> both encrypt stored data at rest and move data over TLS.</li>
<li><strong>Staff tools sit behind Access.</strong> The private tool server our agents use is guarded by <a href="https://developers.cloudflare.com/cloudflare-one/access-controls/policies/">Cloudflare Access</a>, part of Cloudflare One. HQ presents a service token to get in.</li>
<li><strong>AI runs on the same platform.</strong> HQ calls Workers AI through <a href="https://developers.cloudflare.com/ai-gateway/">Cloudflare AI Gateway</a>, which Cloudflare describes as giving visibility and control over AI apps with analytics, logging and rate limiting. Our agents are built on the Cloudflare Agents SDK.</li>
</ul>
<ul class="hq-pills" aria-label="What the platform gives HQ"><li class="ui-pill ui-pill--done">DDoS protection</li><li class="ui-pill ui-pill--done">Encrypted files and records</li><li class="ui-pill ui-pill--done">Access for staff tools</li><li class="ui-pill ui-pill--progress">Workers AI and AI Gateway</li></ul>
</section>

<section id="faq" class="hq-section hq-faq" aria-labelledby="hq-faq-title">
<p class="eyebrow">Questions</p>
<h2 id="hq-faq-title">What owners ask about HQ.</h2>
${faq}
</section>

<section class="product-page__next premium-cta hq-cta">
${sectionHeading("Start here", "See where your business stands first.", "The Readiness Check is a five-to-seven-minute questionnaire about how your business runs today. It scores readiness, growth and website visibility, and names the stage your business is at. It gives you next steps for your business.")}
${pageActions(READINESS, "Take the Readiness Check", "/start/", "Start a project")}
</section>
</main>`;
}

// SINGLE PLACE TO SWAP THE VIDEO: change the four file paths below (and the duration/summary if the cut
// changes) and run `npm run build`. The section, the homepage JSON-LD node and the sitemap entry all read from here.
// The landscape files in assets/video/hq-product-* are the approved v4 cut; the portrait files are the v5 vertical cut.
export const HQ_VIDEO = {
  landscape: "/assets/video/hq-product-landscape.mp4",
  // Portrait screens (width <= height) use the v5 vertical cut (1080x1920, silent), which is native 9:16.
  portrait: "/assets/video/hq-product-portrait.mp4",
  posterLandscape: "/assets/video/hq-product-landscape.jpg",
  posterPortrait: "/assets/video/hq-product-portrait.jpg",
  title: "HQ product video",
  seconds: 56,
  uploadDate: "2026-10-23",
  description: "A 56-second silent video about HQ: requests land as cards, digital workers pick up the work, Client Services reviews it, you approve it, and approved posts are scheduled to your connected social networks.",
  // Built only from facts already on the HQ page.
  summary: "A 56-second silent video about HQ. Every request lands as a card on the work board and becomes a written plan before work starts. A team of digital workers, which are AI agents, picks up the work, searches the skill library for each task, uses the skill packs, cites the skills used and reports whether they helped. Client Services reviews before anything reaches you, and finished work lands in your folders and Library. Only client-approved finished work can be scheduled or posted: once a piece is approved and your accounts are connected, it is scheduled into your next open slot, for Instagram, Facebook, LinkedIn, TikTok, X, YouTube, Threads, Google Business and Bluesky. HQ runs on Cloudflare. The video ends with the Readiness Check, a five-to-seven-minute questionnaire.",
};

/** VideoObject node for the homepage graph, generated from HQ_VIDEO. */
export function hqVideoNode(site, orgId) {
  return {
    "@type": "VideoObject",
    "@id": `${site}/#video-hq-product`,
    name: HQ_VIDEO.title,
    description: HQ_VIDEO.description,
    thumbnailUrl: `${site}${HQ_VIDEO.posterLandscape}`,
    contentUrl: `${site}${HQ_VIDEO.landscape}`,
    embedUrl: `${site}/#hq-video`,
    duration: `PT${HQ_VIDEO.seconds}S`,
    uploadDate: HQ_VIDEO.uploadDate,
    width: 1920,
    height: 1080,
    inLanguage: "en",
    isFamilyFriendly: true,
    publisher: { "@id": orgId },
  };
}

/** Sitemap <video:video> entry, generated from HQ_VIDEO. */
export function hqVideoSitemap(site) {
  return `    <video:video>
      <video:thumbnail_loc>${site}${HQ_VIDEO.posterLandscape}</video:thumbnail_loc>
      <video:title>${esc(HQ_VIDEO.title)}</video:title>
      <video:description>${esc(HQ_VIDEO.description)}</video:description>
      <video:content_loc>${site}${HQ_VIDEO.landscape}</video:content_loc>
      <video:duration>${HQ_VIDEO.seconds}</video:duration>
      <video:publication_date>${HQ_VIDEO.uploadDate}</video:publication_date>
    </video:video>`;
}

/** Full-viewport HQ video section, placed right after #name. Behaviour lives in /assets/hq-video.js. */
export function hqVideoSection() {
  const portraitSrc = HQ_VIDEO.portrait || HQ_VIDEO.landscape;
  const portraitPoster = HQ_VIDEO.posterPortrait || HQ_VIDEO.posterLandscape;
  const hasPortrait = Boolean(HQ_VIDEO.portrait && HQ_VIDEO.posterPortrait);
  const play = '<svg class="hq-video__icon hq-video__icon--play" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  const pause = '<svg class="hq-video__icon hq-video__icon--pause" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  return `<section id="hq-video" class="hq-video${hasPortrait ? " hq-video--has-portrait" : ""}" aria-labelledby="hq-video-title" aria-describedby="hq-video-summary" style="--hq-video-poster: url(${HQ_VIDEO.posterLandscape}); --hq-video-poster-portrait: url(${portraitPoster})" data-hq-video>
  <h2 id="hq-video-title" class="hq-video__sr">${esc(HQ_VIDEO.title)}</h2>
  <p id="hq-video-summary" class="hq-video__sr">${esc(HQ_VIDEO.summary)}</p>
  <div class="hq-video__ambient" aria-hidden="true"></div>
  <picture class="hq-video__poster">
    ${hasPortrait ? `<source media="(max-aspect-ratio: 1/1)" srcset="${HQ_VIDEO.posterPortrait}" width="1080" height="1920">` : ""}
    <img class="hq-video__frame" src="${HQ_VIDEO.posterLandscape}" width="1920" height="1080" alt="" loading="lazy" decoding="async">
  </picture>
  <video class="hq-video__frame hq-video__media" muted loop playsinline preload="metadata" aria-labelledby="hq-video-title" aria-describedby="hq-video-summary" data-src-landscape="${HQ_VIDEO.landscape}" data-src-portrait="${portraitSrc}" data-poster-landscape="${HQ_VIDEO.posterLandscape}" data-poster-portrait="${portraitPoster}"></video>
  <div class="hq-video__scrim" aria-hidden="true"></div>
  <div class="hq-video__bar">
    <nav class="hq-video__links" aria-label="About HQ"><a href="${HQ_PATH}">Meet HQ</a><a href="${HQ_ARTICLE}">How client work moves through HQ</a></nav>
    <button type="button" class="hq-video__toggle" data-hq-video-toggle aria-label="Play the HQ product video">${play}${pause}<span class="hq-video__toggle-text">Play</span></button>
  </div>
</section>`;
}

/** Homepage feature section, inserted between #clients and #models-band. */
export function hqHomeSection() {
  const beat = (name, title, text) => `<li class="hq-home__beat">${figure(name, { id: `hq-home-${name}`, className: "hq-shot--home" })}<h3>${esc(title)}</h3><p>${esc(text)}</p></li>`;
  return `<section id="hq" class="section hq-home" aria-labelledby="hq-title">
  <div class="wrap">
    <p class="eyebrow">HQ</p>
    <h2 id="hq-title">One place to request, review and approve the work.</h2>
    <p class="lede">HQ is the workspace where your Abracadabra team and a crew of digital workers deliver. Nothing reaches your folders or your social networks until it has been reviewed and you have approved it. It is for CEOs and business owners leveraging AI across their businesses.</p>
    <ol class="hq-home__beats">
      ${beat("board", "Request it", "Each request becomes a card on your board, with a plan for the work.")}
      ${beat("review", "Review it", "Finished work is held, checked by Client Services, then released for you to approve, change or remove.")}
      ${beat("social", "Schedule it", `Once a piece is approved and your accounts are connected, it is scheduled into your next open slot. Networks: ${NETWORKS.slice(0, -1).join(", ")} and ${NETWORKS.at(-1)}.`)}
    </ol>
    <p class="hq-home__actions" data-actions><a class="btn btn--secondary" href="${HQ_PATH}">Meet HQ</a><a class="btn btn--tertiary" href="${HQ_ARTICLE}">How client work moves through HQ <span class="btn__arrow" aria-hidden="true">→</span></a></p>
    <p class="hq-home__more">Our digital workers search a skill library for every task. New to agents? <a href="${AGENT_ARTICLE}">What is an AI agent?</a></p>
  </div>
</section>`;
}

/** Structured data for the HQ page. `posts` are the live blog posts from loadPosts(). */
export function hqGraphNodes({ SITE, ORG_ID, WEBSITE_ID, crumbList, crumbs, posts }) {
  const url = `${SITE}${HQ_PATH}`;
  const productId = `${url}#product`;
  const post = (slug) => posts.find((p) => p.slug === slug);
  const article = (slug) => {
    const p = post(slug);
    return {
      "@type": "BlogPosting",
      "@id": `${SITE}/blog/${slug}#post`,
      headline: p.title,
      url: `${SITE}/blog/${slug}`,
      datePublished: p.datePublished,
      inLanguage: "en",
      publisher: { "@id": ORG_ID },
    };
  };
  const articles = ["how-client-work-flows-through-hq", "what-is-an-ai-agent"].filter(post).map(article);
  const crumb = { ...crumbList(crumbs), "@id": `${url}#breadcrumb` };
  const faq = {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: hqFaqs.map(([name, text]) => ({ "@type": "Question", name, acceptedAnswer: { "@type": "Answer", text } })),
  };
  const app = {
    "@type": ["SoftwareApplication", "Product"],
    "@id": productId,
    name: "HQ",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: HQ_DESCRIPTION,
    url,
    image: `${SITE}${HQ_IMAGE}`,
    creator: { "@id": ORG_ID },
    featureList: [
      "Requests, a project board and finished work in one client workspace",
      "Work held until it has been reviewed by Client Services and released",
      "Client approval of each piece: approve, ask for a change, or remove",
      "Named folders with file types shown",
      "A social calendar for approved work",
      "Digital workers that pick skills for each task and report whether each one helped",
    ],
  };
  const related = [`${SITE}${HQ_ARTICLE}`, `${SITE}${AGENT_ARTICLE}`, `${SITE}${CLOUDFLARE_ARTICLE}`];
  return {
    breadcrumbId: crumb["@id"],
    app,
    related,
    mentions: articles.map((a) => ({ "@id": a["@id"] })),
    nodes: [crumb, app, faq, ...articles.map((a) => (a["@id"].includes("how-client-work-flows-through-hq") ? { ...a, mentions: [{ "@id": productId }] } : a))],
    faqId: faq["@id"],
    productId,
  };
}
