/**
 * Super Funnel System: the SuperPatch case study at /portfolio/super-funnel/.
 * Text is from Christopher (Oct 23, 2026). The eight films are the files already on the site
 * (assets/films/superfunnel-<slug>.mp4 and assets/films/thumbs/superfunnel-<slug>.jpg); the films page keeps them too.
 */

const UPLOAD_DATE = "2026-10-07";

export const SF_FILMS = [
  { slug: "getting-started", name: "Getting started", seconds: 66, iso: "PT1M6S", line: "A tour of Home, the associate's daily dashboard: hot and new leads, the setup checklist and the navigation.", desc: "Associate tour of the home dashboard, setup, pipeline, and nav." },
  { slug: "working-a-lead", name: "Working a lead", seconds: 44, iso: "PT44S", line: "A quiz lead lands in Contacts on its own. Open it, then move through Rapport and Discovery with the opener already written.", desc: "Associate tour from Contacts through Discovery." },
  { slug: "quiz-lead-samples", name: "Quiz lead, samples", seconds: 62, iso: "PT1M2S", line: "A quiz lead who asked for samples: pack them, mark them shipped, then send the follow-up from the associate's phone.", desc: "A quiz lead who wants samples, through ship and follow-up." },
  { slug: "quiz-lead-no-samples", name: "Quiz lead, no samples", seconds: 56, iso: "PT56S", line: "A quiz lead with no samples: start the conversation at Rapport, with Discovery prefilled.", desc: "A quiz lead with no samples: Rapport and a prefilled Discovery." },
  { slug: "follow-ups-activity", name: "Follow-ups and Activity", seconds: 56, iso: "PT56S", line: "Who to message today: due follow-ups on Home, the calendar view, and Activity, which shows who has sat at a step too long.", desc: "Due follow-ups, the calendar, and Activity." },
  { slug: "my-page-card-funnels", name: "My Page, card, and funnels", seconds: 86, iso: "PT1M26S", line: "One share link and QR code that credit the associate: the digital card, the landing and recruiting pages, and the funnels.", desc: "Share card, landing page, public page, and funnels." },
  { slug: "social", name: "Social", seconds: 70, iso: "PT1M10S", line: "The social calendar with an approved post and a ready caption for every day, plus the inbox and analytics.", desc: "Social calendar, inbox, and analytics." },
  { slug: "team-settings", name: "Team and settings", seconds: 64, iso: "PT1M4S", line: "The team an associate personally enrolled, the settings, and the Compliance guide.", desc: "Team, settings, and compliance." },
];

export const SF_CHAPTERS = [
  { title: "Start here", slugs: ["getting-started"] },
  { title: "Work a lead", slugs: ["working-a-lead", "quiz-lead-samples", "quiz-lead-no-samples", "follow-ups-activity"] },
  { title: "Share and get credit", slugs: ["my-page-card-funnels"] },
  { title: "Social and team", slugs: ["social", "team-settings"] },
];

const PIPELINE = ["Add Contact", "Rapport", "Discovery", "Samples", "Follow-up", "Close", "Purchase Links", "Testimonial", "Recruit"];

const SNAPSHOT = [
  ["Client", "SuperPatch"],
  ["Users", "SuperPatch associates, signed in with their backoffice credentials"],
  ["Role", "Product design and full-stack engineering"],
  ["Surface", "Pipeline CRM, public pages, digital card, social studio, follow-up tools"],
  ["Stack", "Next.js 16, Cloudflare Workers (OpenNext), Neon Postgres via Hyperdrive, R2, Cloudflare cron"],
];

// [bold lead, rest, extra html key]
const STEPS = [
  ["An associate signs in once.", "They use their existing backoffice username and password. The app builds a profile from their rep ID and shop username. Every contact, page, and post they create belongs to that profile and no one else's."],
  ["They share one link.", "It can be their digital card, a QR code, a recruiting page, or a product funnel. Each one carries the associate's rep code. When a visitor arrives through someone else's link, the page they are reading still pays the page owner."],
  ["The visitor picks a door.", "", "doors"],
  ["The lead lands in the pipeline.", "A quiz unlock or a form submission creates a contact with no second form and no re-entry. A quiz lead arrives with its recommended patches, a link back to the report, and a source tag. A lead who wants to build a business enters at the Recruit step. A product lead enters at the first step. If the same lead arrives twice, the app recognises it and creates no duplicate. If the app is unreachable, the visitor still gets their report."],
  ["The associate works it.", "Contacts move through nine steps: Add Contact, Rapport, Discovery, Samples, Follow-up, Close, Purchase Links, Testimonial, Recruit. Each step carries its own script. The associate switches between a searchable list and a drag-and-drop board and filters by lead date. They can import contacts from CSV, vCard, or the phone's contact picker.", "pipeline"],
  ["The follow-up leaves from their own phone.", "The script opens as a text, email, or WhatsApp draft already addressed to the contact. The associate reads it and presses send. One tap on I sent it logs the message and advances the contact. Bulk mode queues drafts for many contacts and opens them one at a time. The app never sends a message by itself."],
  ["Home tells them what to do next.", "The top of the screen shows hot and new leads ranked by intent: landing leads first, then sample requests, then report-only quiz leads. Below that are the follow-ups due today and a setup checklist for new associates. The widgets for survey activity, samples, and lead locations can be rearranged."],
];

const DOORS = [
  ["The product funnel", "answers one question: is there a patch for my problem? It collects nothing. It sends the visitor to the Signal Score quiz with the owner's credit attached."],
  ["The recruiting page", "answers a different question: should I build with this person? It tells the associate's story, shows proof and testimonials, and ends in a lead form. After the form, it offers a booking link."],
];

const INSIDE = [
  ["Sample queue", "A quiz visitor who asks for a sample appears in a ship queue. The associate marks the sample shipped. They can export the list to CSV or Excel for fulfilment."],
  ["My Page and My Funnel", "Associates edit their public pages without touching code: story, photos, city, video, testimonials, and which sections appear. The recruiting page is a chaptered scroll experience built around film and animation. Phones get their own lighter media. Visitors who prefer reduced motion get still images."],
  ["Digital card", "The card has a photo, social links, an Add to Contacts download, and a QR code. It generates its own preview image, so it looks right wherever it is shared."],
  ["Social studio", "Associates write captions that pass brand-voice and compliance checks, schedule posts on a calendar, and read performance analytics. One inbox covers Instagram, Facebook, and X, with keyword auto-replies. Every reply passes the same banned-phrase check as a new post."],
  ["Compliance", "A Say This / Never Say This guide and a copy checker keep every message inside company rules."],
  ["Team", "Leaders see the people they personally enrolled."],
  ["Guided onboarding", "The first visit to each screen plays a short walkthrough video. A replay button stays in the top bar."],
];

const CLOUDFLARE_INTRO = [
  "The whole app runs as one Cloudflare Worker, with no servers to manage. Next.js is compiled for Workers through OpenNext with Node compatibility enabled. Pages, API routes, webhooks, and scheduled jobs all run at the edge, close to the associate and the visitor.",
];

const CLOUDFLARE = [
  ["Neon Postgres through Hyperdrive", "Workers can't hold database connections open, so Hyperdrive pools them. Contacts, profiles, page configurations, journeys, and social data all live in Postgres. The pgvector extension is installed and ready for AI retrieval features. If the database is not configured, the app fails closed and the health check reports it. It never quietly falls back to storing data somewhere else."],
  ["R2 for files", "Associate photos and page media sit in a private bucket, served only through an authenticated media route. A second bucket holds the Next.js incremental cache."],
  ["Cron for the social studio", "An hourly scheduled job syncs post analytics, follower counts, and inbox history. It calls the app's own sync route through a service binding, so the job runs inside the same deployment and uses the same code."],
  ["A separate Worker for the quiz", "Signal Score stays its own deployment. The two systems talk through one shared-secret webhook. This keeps a problem on one side from taking down the other. A lead is recorded once per quiz session, so a retried webhook never creates a duplicate."],
  ["Rate limits in Postgres", "Login and public lead forms are throttled with an atomic fixed-window counter in the database. It holds under concurrent requests from many edge locations, where a read-then-write counter would let bursts through."],
  ["Tenancy", "Every contact, page, and post is tied to a profile ID. An associate can reach only their own records."],
];

const RELEASE = [
  "Every push runs type checks, lint, and the full test suite in CI.",
  "A migration runner applies schema changes in order and records a checksum for each one. It refuses to re-apply a file that was edited after it ran.",
  "Secrets live in Worker secrets, never in the repo.",
  "The deploy command forces local-prototype flags off so a development setting can't ship to production.",
];

const PHONE = [
  "It installs to the home screen.",
  "The contact sheet is a full-height swipeable carousel on mobile.",
  "Every tap target is at least 44 px.",
  "Public pages meet accessibility standards and load fast on mobile connections.",
];

const OUTCOME = [
  "An associate shares one link. A stranger becomes a contact, credited to the right person, with a script ready to send. Every public call to action pays the page owner. The associate sends every message themselves. The whole system runs on one Cloudflare deployment with a single sign-in.",
];

export const SF_HEADLINE = "Every link an associate shares ends in a credited, followed-up lead.";
export const SF_INTRO = "Super Funnel System is a field app for SuperPatch associates. It takes a stranger from a shared link, through a quiz or a recruiting page, into a nine-step pipeline. It then hands the associate the exact message to send next. It runs on Cloudflare Workers, backed by Postgres and R2.";
export const SF_SUMMARY = "A field app for SuperPatch associates: one shared link becomes a credited lead, a nine-step pipeline and the exact message to send next. Eight film tours.";
export const SF_DIAGRAM = {
  src: "/assets/super-funnel/super-funnel-system-architecture.webp",
  src1200: "/assets/super-funnel/super-funnel-system-architecture-1200.webp",
  width: 2400,
  height: 1470,
  alt: "Architecture diagram: a visitor or associate reaches one Cloudflare Worker running Next.js through OpenNext. A separate Signal Score quiz Worker, a social posting service and Klaviyo send webhooks in. Hyperdrive connects the Worker to Neon Postgres, R2 holds photos and the incremental cache, and an hourly cron job syncs social analytics and the inbox.",
};

export function sfFilmsTotalSeconds() {
  return SF_FILMS.reduce((sum, film) => sum + film.seconds, 0);
}

function clock(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function filmByslug(slug) {
  const film = SF_FILMS.find((row) => row.slug === slug);
  if (!film) throw new Error(`Unknown Super Funnel film ${slug}`);
  return film;
}

/** VideoObject nodes for the case page; same facts as the films page, ids scoped to this page. */
export function sfVideoNodes(site, orgId, pageUrl) {
  return SF_FILMS.map((film) => ({
    "@type": "VideoObject",
    "@id": `${pageUrl}#superfunnel-${film.slug}`,
    name: `Super Funnel: ${film.name}`,
    description: film.desc,
    thumbnailUrl: `${site}/assets/films/thumbs/superfunnel-${film.slug}.jpg`,
    contentUrl: `${site}/assets/films/superfunnel-${film.slug}.mp4`,
    duration: film.iso,
    uploadDate: UPLOAD_DATE,
    publisher: { "@id": orgId },
  }));
}

/** <video:video> sitemap entries for the case page's URL block (the films page keeps its own). */
export function sfSitemapVideos(site) {
  return SF_FILMS.map((film) => `    <video:video>
      <video:thumbnail_loc>${site}/assets/films/thumbs/superfunnel-${film.slug}.jpg</video:thumbnail_loc>
      <video:title>Super Funnel: ${film.name}</video:title>
      <video:description>${film.desc}</video:description>
      <video:content_loc>${site}/assets/films/superfunnel-${film.slug}.mp4</video:content_loc>
      <video:duration>${film.seconds}</video:duration>
      <video:publication_date>${UPLOAD_DATE}</video:publication_date>
    </video:video>`).join("\n");
}

/** llms-full text for the case. */
export const SF_LLMS_BODY = [
  SF_INTRO,
  "It follows one lead from a shared link to a credited contact in a nine-step pipeline (Add Contact, Rapport, Discovery, Samples, Follow-up, Close, Purchase Links, Testimonial, Recruit), and the associate sends every message from their own phone.",
  "Built on one Cloudflare Worker (Next.js through OpenNext), Neon Postgres via Hyperdrive, R2 and Cloudflare cron. A separate Worker runs the Signal Score quiz. Eight film tours are on the page.",
];

export function superFunnelCaseBody({ esc, pageHero, visibleCrumbs, crumbs, relatedHtml }) {
  const doors = `<ul class="sf-case__doors">${DOORS.map(([lead, rest]) => `<li><strong>${esc(lead)}</strong> ${esc(rest)}</li>`).join("")}</ul>`;
  const pipeline = `<ol class="sf-case__pipeline" aria-label="The nine pipeline steps">${PIPELINE.map((step) => `<li>${esc(step)}</li>`).join("")}</ol>`;
  const steps = STEPS.map(([lead, rest, extra], index) => `<li><span>${String(index + 1).padStart(2, "0")}</span><div><h3>${esc(lead)}</h3>${rest ? `<p>${esc(rest)}</p>` : ""}${extra === "doors" ? doors : ""}${extra === "pipeline" ? pipeline : ""}</div></li>`).join("\n");
  const snapshot = `<dl class="sf-case__snapshot">${SNAPSHOT.map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
  const chapters = SF_CHAPTERS.map((chapter, index) => {
    const cards = chapter.slugs.map((slug) => {
      const film = filmByslug(slug);
      return `<figure class="sf-film" id="film-${esc(slug)}">
<video controls playsinline preload="none" width="1280" height="720" poster="/assets/films/thumbs/superfunnel-${esc(slug)}.jpg" src="/assets/films/superfunnel-${esc(slug)}.mp4" aria-label="Super Funnel: ${esc(film.name)}"></video>
<figcaption><strong>${esc(film.name)}</strong><span class="sf-film__time">${clock(film.seconds)}</span><span class="sf-film__line">${esc(film.line)}</span></figcaption>
</figure>`;
    }).join("\n");
    return `<div class="sf-chapter${chapter.slugs.length === 1 ? " sf-chapter--single" : ""}">
<h3><span>${String(index + 1).padStart(2, "0")}</span>${esc(chapter.title)}</h3>
<div class="sf-chapter__films">
${cards}
</div>
</div>`;
  }).join("\n");
  const inside = INSIDE.map(([title, text]) => `<li><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("");
  const cloud = CLOUDFLARE.map(([title, text]) => `<li><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("");
  const release = `<li class="sf-case__wide"><h3>Release discipline</h3><ul>${RELEASE.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></li>`;
  const phone = PHONE.map((line) => `<li>${esc(line)}</li>`).join("");
  const outcome = OUTCOME.map((text) => `<p>${esc(text)}</p>`).join("");
  const total = sfFilmsTotalSeconds();
  const filmsLength = `${Math.floor(total / 60)} min ${total % 60} s`;

  return `<main id="top" class="site-page pirx-case sf-case">
${pageHero({
  crumbs: visibleCrumbs(crumbs),
  kicker: "SuperPatch · Field app for associates",
  title: esc(SF_HEADLINE),
  dek: `<p>${esc(SF_INTRO)}</p><p class="sales-actions"><a class="btn btn--primary" href="#films">Watch the tours</a><a class="btn btn--secondary" href="/start/">Start a project</a></p>`,
})}
<div class="pirx-case__metrics sf-case__metrics" aria-label="Super Funnel System at a glance">
<p class="metric"><strong>9</strong><span>pipeline steps</span></p>
<p class="metric"><strong>8</strong><span>film tours, ${esc(filmsLength)}</span></p>
<p class="metric"><strong>1</strong><span>Cloudflare deployment</span></p>
</div>
<section class="sf-case__snap" aria-labelledby="sf-snapshot-title">
<h2 id="sf-snapshot-title" class="eyebrow">Snapshot</h2>
${snapshot}
</section>
<section class="pirx-case__story sf-case__flow" aria-labelledby="sf-flow-title">
<div><p class="eyebrow">The flow</p><h2 id="sf-flow-title">One lead, start to finish.</h2><p class="sf-case__sub">The clearest way to explain the product is to follow a single lead.</p></div>
<ol class="sf-case__steps">
${steps}
</ol>
</section>
<section class="sf-case__films" id="films" aria-labelledby="sf-films-title">
<div class="sf-case__films-head"><p class="eyebrow">The tours</p><h2 id="sf-films-title">Watch it work.</h2><p>Eight short tours of the app, in the order an associate meets it. They use a demo associate account with sample data.</p></div>
${chapters}
</section>
<section class="sf-case__inside" aria-labelledby="sf-inside-title">
<p class="eyebrow">What's inside</p>
<h2 id="sf-inside-title">The tools around the pipeline.</h2>
<ul class="sf-case__grid">${inside}</ul>
</section>
<section class="sf-case__cloud" aria-labelledby="sf-cloud-title">
<p class="eyebrow">Built on Cloudflare</p>
<h2 id="sf-cloud-title">One Worker, one deployment, no servers to manage.</h2>
${CLOUDFLARE_INTRO.map((text) => `<p class="sf-case__lede">${esc(text)}</p>`).join("")}
<figure class="sf-case__diagram"><picture><source type="image/webp" srcset="${esc(SF_DIAGRAM.src1200)} 1200w, ${esc(SF_DIAGRAM.src)} ${SF_DIAGRAM.width}w" sizes="(min-width: 1100px) 1000px, 100vw"><img src="${esc(SF_DIAGRAM.src)}" alt="${esc(SF_DIAGRAM.alt)}" width="${SF_DIAGRAM.width}" height="${SF_DIAGRAM.height}" loading="lazy" decoding="async"></picture><figcaption>Illustrative diagram. Simplified.</figcaption></figure>
<ul class="sf-case__grid">${cloud}${release}</ul>
</section>
<section class="sf-case__phone" aria-labelledby="sf-phone-title">
<div><p class="eyebrow">Designed for the phone</p><h2 id="sf-phone-title">Most associates work from a phone, so the app starts there.</h2></div>
<ul class="sf-case__ticks">${phone}</ul>
</section>
<section class="pirx-case__results sf-case__outcome" aria-labelledby="sf-outcome-title">
<div class="pirx-case__results-copy"><p class="eyebrow">Outcome</p><h2 id="sf-outcome-title">One link in, one credited contact out.</h2>${outcome}</div>
</section>
<section class="pirx-case__next sf-case__next">
<div><p class="eyebrow">Build yours</p><h2>Turn the way your team works into software.</h2></div>
<div>${relatedHtml}<p class="sales-actions"><a class="btn btn--primary" href="/start/">Start a project</a><a class="btn btn--tertiary" href="/portfolio/">See all case studies <span class="btn__arrow" aria-hidden="true">→</span></a></p></div>
</section>
</main>`;
}
