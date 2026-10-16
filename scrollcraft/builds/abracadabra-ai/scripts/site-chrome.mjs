import { businessFunctions } from "./site-data.mjs";
import { salesPages } from "./service-sales.mjs";

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function functionLinks(fn) {
  const services = fn.services.map((slug) => (
    `<a href="/services/${slug}/">${esc(salesPages[slug].headline)}</a>`
  )).join("");
  const work = (fn.work || []).map((item) => (
    `<a href="${esc(item.href)}">${esc(item.label)}</a>`
  )).join("");
  return `${services}${work}`;
}

function functionNav() {
  return businessFunctions.map((fn) => (
    `<details class="site-nav__fn"><summary>${esc(fn.name)}</summary><div class="site-nav__panel">${functionLinks(fn)}</div></details>`
  )).join("\n    ");
}

function functionFoot() {
  return businessFunctions.map((fn) => {
    const href = fn.services.length ? `/services/#${fn.id}` : "/portfolio/";
    return `<a href="${href}">${esc(fn.name)}</a>`;
  }).join("\n    ");
}

export function siteHeader() {
  return `<a class="skip" href="#top">Skip to content</a>
<header class="site-nav">
  <a class="site-nav__mark" href="/">Abracadabra AI</a>
  <details class="site-nav__menu">
    <summary class="site-nav__toggle">Menu</summary>
  </details>
  <nav class="site-nav__links" aria-label="Site">
    ${functionNav()}
    <a href="/portfolio/">Portfolio</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a class="site-nav__cta" href="/#start">Start a project</a>
  </nav>
</header>
<script>
  document.querySelectorAll(".site-nav").forEach(function (bar) {
    var menu = bar.querySelector(".site-nav__menu");
    if (!menu) return;
    bar.addEventListener("click", function (event) {
      if (event.target.closest("a")) menu.open = false;
    });
  });
</script>`;
}

export function siteFooter() {
  return `<footer class="site-foot">
  <p class="site-foot__word">Abracadabra</p>
  <nav class="site-foot__links" aria-label="Footer">
    ${functionFoot()}
    <a href="/services/">Services</a>
    <a href="/portfolio/">Portfolio</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a href="/#start">Start a project</a>
    <a href="/privacy">Privacy</a>
  </nav>
</footer>`;
}
