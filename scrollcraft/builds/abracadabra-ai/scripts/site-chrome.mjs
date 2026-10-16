export function siteHeader() {
  return `<a class="skip" href="#top">Skip to content</a>
<header class="site-nav">
  <a class="site-nav__mark" href="/">Abracadabra AI</a>
  <details class="site-nav__menu">
    <summary class="site-nav__toggle">Menu</summary>
  </details>
  <nav class="site-nav__links" aria-label="Site">
    <a href="/services/">Services</a>
    <a href="/portfolio/">Portfolio</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a class="site-nav__cta" href="/#brief">Start a project</a>
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
  <p class="site-foot__brand">Abracadabra AI</p>
  <nav class="site-foot__links" aria-label="Footer">
    <a href="/services/">Services</a>
    <a href="/portfolio/">Portfolio</a>
    <a href="/products/">Products</a>
    <a href="/course/llm-leverage/">Course</a>
    <a href="/blog">Blog</a>
    <a href="/#brief">Start a project</a>
    <a href="/privacy">Privacy</a>
  </nav>
</footer>`;
}
