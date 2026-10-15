export function siteHeader() {
  return `<header class="site-nav">
  <a class="site-nav__mark" href="/">Abracadabra AI</a>
  <nav class="site-nav__links" aria-label="Site">
    <a href="/services/">Services</a>
    <a href="/portfolio/">Portfolio</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a class="site-nav__cta" href="/#brief">Start a brief</a>
  </nav>
</header>`;
}

export function siteFooter() {
  return `<footer class="site-foot">
  <a href="/services/">Services</a>
  <a href="/portfolio/">Portfolio</a>
  <a href="/products/">Products</a>
  <a href="/course/llm-leverage/">Course</a>
  <a href="/blog">Blog</a>
  <a href="/#brief">Start a brief</a>
  <a href="/privacy">Privacy</a>
</footer>`;
}
