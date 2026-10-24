import { businessFunctions } from "./site-data.mjs";
import { salesPages } from "./service-sales.mjs";
import { navIcon } from "./nav-icons.mjs";

export const ASSET_VERSION = "20261020b";
const YEAR = new Date().getFullYear();
const EMAIL = "houdini@abra-ca-dabra.app";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function megaLink(slug, description) {
  const page = salesPages[slug];
  if (!page) throw new Error(`Missing sales page ${slug}`);
  return `<a class="site-nav__mega-link" href="/services/${slug}/">${navIcon(slug)}<span class="site-nav__text"><strong>${esc(page.headline)}</strong><span class="site-nav__desc">${esc(description)}</span></span></a>`;
}

const navGroups = [
  {
    label: "Build",
    links: [
      ["custom-apps", "Software around the way the work already runs."],
      ["web-automation", "Repetitive web jobs that run themselves."],
      ["answers-from-your-documents", "Answers from the files you already keep."],
      ["safe-code-execution", "AI that can run code, with a fence around it."],
      ["machine-learning", "Models that show a number and the reasons."],
      ["mcp-connectors", "Let your AI use your tools, safely."],
    ],
  },
  {
    label: "Create",
    links: [
      ["ai-media", "On-brand images, video and voice."],
      ["voice-and-realtime-agents", "A voice that answers from your records."],
      ["ai-assistants-and-agents", "An assistant that finishes the request."],
    ],
  },
  {
    label: "Grow",
    links: [
      ["ai-visibility", "Show up when someone asks an assistant."],
      ["search-grounded-research", "Research you can open and check."],
      ["any-model-one-bill", "Every model, on one invoice."],
    ],
  },
];

const learnLinks = [
  ["LLM Leverage", "/course/llm-leverage/", "A course for better answers from any model."],
  ["Notes", "/blog", "How to put AI to work."],
];

function groupHtml(label, links) {
  return `<div class="site-nav__group" role="group" aria-label="${esc(label)}"><p class="site-nav__fn-name" aria-hidden="true">${esc(label)}</p>${links}</div>`;
}

function servicesNav() {
  const built = navGroups.map((group) => groupHtml(group.label, group.links.map(([slug, description]) => megaLink(slug, description)).join(""))).join("");
  const learn = groupHtml("Learn", learnLinks.map(([title, href, description]) => (
    `<a class="site-nav__mega-link" href="${esc(href)}">${navIcon(href)}<span class="site-nav__text"><strong>${esc(title)}</strong><span class="site-nav__desc">${esc(description)}</span></span></a>`
  )).join(""));
  return `<details class="site-nav__services"><summary>Services</summary><div class="site-nav__mega">${built}${learn}</div></details>`;
}

function functionFoot() {
  return businessFunctions.map((fn) => {
    const href = fn.services.length ? `/services/#${fn.id}` : "/portfolio/";
    return `<a href="${href}">${esc(fn.name)}</a>`;
  }).join("\n    ");
}

export function headLinks({ home = false } = {}) {
  const font = home ? "assets/fonts.css" : "/assets/fonts.css";
  const site = home ? `assets/site.css?v=${ASSET_VERSION}` : `/assets/site.css?v=${ASSET_VERSION}`;
  const motion = home ? `assets/restored-motion.css?v=${ASSET_VERSION}` : "";
  const icon = home ? "assets/icons" : "/assets/icons";
  const manifest = home ? "/manifest.webmanifest" : "/manifest.webmanifest";
  return `<meta name="theme-color" content="#070706">
<link rel="icon" href="${icon}/favicon.svg" type="image/svg+xml">
<link rel="icon" href="${icon}/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="${icon}/apple-touch-icon.png">
<link rel="manifest" href="${manifest}">
<link rel="preload" href="${home ? "assets" : "/assets"}/fonts/inter-tight-600.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${home ? "assets" : "/assets"}/fonts/ibm-plex-sans-400.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${font}">
<link rel="stylesheet" href="${site}">
${motion ? `<link rel="stylesheet" href="${motion}">` : ""}`;
}

const chip = (name, value) => `<label class="intake__chip"><input type="radio" name="${name}" value="${esc(value)}" required><span>${esc(value)}</span></label>`;

export function intakeForm() {
  const needs = ["Film", "Website", "Product", "Course", "Not sure"].map((value) => chip("need", value)).join("");
  const budgets = ["Under $15k", "$15–40k", "$40k+", "Not sure"].map((value) => chip("budget", value)).join("");
  const timelines = ["Now", "This month", "This quarter", "Not sure"].map((value) => chip("timeline", value)).join("");
  return `<form class="intake" action="/api/intake" method="post">
  <label>Name <input name="name" required autocomplete="name" maxlength="120"></label>
  <label>Email <input name="email" type="email" required autocomplete="email" maxlength="200"></label>
  <label>Company <span class="fine">(optional)</span> <input name="company" autocomplete="organization" maxlength="160"></label>
  <fieldset class="intake__chips"><legend>What you need</legend>${needs}</fieldset>
  <fieldset class="intake__chips"><legend>Budget</legend>${budgets}</fieldset>
  <fieldset class="intake__chips"><legend>Timeline</legend>${timelines}</fieldset>
  <label>Tell us more <textarea name="message" rows="4" maxlength="4000"></textarea></label>
  <label class="intake__honey">Website <input name="company_website" tabindex="-1" autocomplete="off"></label>
  <button class="btn btn--primary" type="submit">Start a project</button>
  <p class="intake__status" aria-live="polite"></p>
  <p><a class="btn btn--tertiary" href="mailto:${EMAIL}">${EMAIL} <span class="btn__arrow" aria-hidden="true">→</span></a></p>
</form>
<script src="/assets/intake.js" defer></script>`;
}

export function siteHeader({ home = false } = {}) {
  const start = home ? "/#start" : "/start/";
  return `<a class="skip" href="#top">Skip to content</a>
<header class="site-nav">
  <a class="site-nav__mark" href="/" aria-label="Abracadabra AI home">abracadabra<span class="wm-dot">.</span></a>
  <details class="site-nav__menu">
    <summary class="site-nav__toggle" aria-label="Menu"><span class="site-nav__glyph" aria-hidden="true"></span></summary>
  </details>
  <nav class="site-nav__links" aria-label="Site">
    ${servicesNav()}
    <a href="/portfolio/">Case studies</a>
    <a href="/products/">Products</a>
    <a href="/blog">Blog</a>
    <a class="btn btn--primary site-nav__cta" href="${start}">Start a project</a>
  </nav>
</header>
<script>
  document.querySelectorAll(".site-nav").forEach(function (bar) {
    var menu = bar.querySelector(".site-nav__menu");
    var services = bar.querySelector(".site-nav__services");
    var here = location.pathname;
    if (here.slice(-10) === "index.html") here = here.slice(0, -10);
    bar.querySelectorAll(".site-nav__links a:not(.site-nav__cta)").forEach(function (link) {
      var path = link.getAttribute("href") || "";
      var top = link.parentElement && link.parentElement.classList.contains("site-nav__links");
      if (here === path || (top && path !== "/" && here.indexOf(path) === 0)) link.setAttribute("aria-current", "page");
    });
    if (services && here.indexOf("/services/") === 0) services.querySelector("summary").classList.add("is-current");
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        document.documentElement.style.setProperty("--nav-h", bar.offsetHeight + "px");
      }).observe(bar);
    }
    bar.addEventListener("click", function (event) {
      if (!event.target.closest("a")) return;
      if (menu) menu.open = false;
      if (services) services.open = false;
    });
    if (menu) {
      menu.addEventListener("toggle", function () {
        document.documentElement.classList.toggle("menu-open", menu.open);
      });
    }
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    var services = document.querySelector(".site-nav__services");
    var menu = document.querySelector(".site-nav__menu");
    if (services && services.open) {
      services.open = false;
      var summary = services.querySelector("summary");
      if (summary) summary.focus();
      return;
    }
    if (menu && menu.open) {
      menu.open = false;
      var toggle = menu.querySelector("summary");
      if (toggle) toggle.focus();
    }
  });
  document.addEventListener("DOMContentLoaded", function () {
    var clock = document.querySelector("[data-clock]");
    if (clock) {
      var zone = clock.getAttribute("data-clock");
      var tick = function () {
        try {
          clock.textContent = new Intl.DateTimeFormat("en-CA", {
            timeZone: zone, hour: "numeric", minute: "2-digit", timeZoneName: "short",
          }).format(new Date());
        } catch (error) { /* keep the timezone name */ }
      };
      tick();
      setInterval(tick, 60000);
    }
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    document.querySelectorAll("video.loop-film").forEach(function (video) {
      function stop() { video.pause(); }
      if (reduce.matches) {
        stop();
        video.addEventListener("play", stop);
        return;
      }
      if (!("IntersectionObserver" in window)) return;
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (reduce.matches || !entry.isIntersecting) stop();
          else video.play().catch(function () {});
        });
      }, { threshold: 0.35 });
      observer.observe(video);
    });
  });
</script>`;
}

function closeBand(compact) {
  return `<div class="site-close${compact ? " site-close--compact" : ""}">
  <p class="site-close__line">Have something to make?</p>
  <p class="site-close__actions" data-actions>
    <a class="btn btn--primary" href="/start/">Start a project</a>
    <a class="btn btn--tertiary" href="mailto:${EMAIL}">${EMAIL} <span class="btn__arrow" aria-hidden="true">→</span></a>
  </p>
</div>`;
}

export function siteFooter({ band = "full" } = {}) {
  const compact = band === "compact";
  const closing = band === "none" ? "" : `${closeBand(compact)}\n  `;
  return `<footer class="site-foot${compact ? " site-foot--compact" : ""}">
  ${closing}<p class="site-foot__word" aria-label="Abracadabra">abracadabra<span class="wm-dot">.</span></p>
  <nav class="site-foot__links" aria-label="Footer">
    ${functionFoot()}
    <a href="/services/">Services</a>
    <a href="/portfolio/">Case studies</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a href="/glossary/">Glossary</a>
    <a href="/privacy">Privacy</a>
  </nav>
  <p class="site-foot__meta">
    <span>Toronto</span>
    <span data-clock="America/Toronto">America/Toronto</span>
    <span>© ${YEAR} Abracadabra AI</span>
    <a href="/privacy">Privacy</a>
  </p>
  <script type="module" src="/assets/chat-widget.js?v=20261020a"></script>
</footer>`;
}
