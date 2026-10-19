/* "The name" read-along: a pinned act whose progress (--sc-p, scroll-craft
 * convention) scrubs each word from ghost to ink, label first, then the
 * headline, then the body, with the orange "avra kadavra" glowing last.
 * Styles are written inline so a stale cached stylesheet cannot hide the effect.
 * Reduced motion keeps a gentler version: opacity only, no pin, blur or lift. */
(() => {
  const sec = document.querySelector('[data-name-reveal]');
  if (!sec) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = document.documentElement;
  const split = (el) => {
    const out = [];
    const walk = (node) => {
      for (const n of Array.from(node.childNodes)) {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.append(t); return; }
            const s = document.createElement('span'); s.className = 'nw'; s.textContent = t;
            s.style.display = 'inline-block'; frag.append(s); out.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(el);
    return out;
  };
  const label = sec.querySelector('.sc-label'), h = sec.querySelector('h2'), body = sec.querySelector('.sc-body');
  const stage = sec.querySelector('.name-stage'), em = sec.querySelector('em');
  h.setAttribute('aria-label', h.textContent.trim());
  const groups = [[label, 0.0, 0.1], [h, 0.06, 0.5], [body, 0.46, 0.88]].map(([el, a, b]) => ({ units: split(el), a, b }));
  if (!reduce) R.classList.add('name-live');
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let last = -1, raf = 0;
  const set = (u, w) => {
    u.style.opacity = (0.14 + 0.86 * w).toFixed(3);
    if (!reduce) {
      u.style.filter = w > 0.995 ? '' : `blur(${((1 - w) * 6).toFixed(2)}px)`;
      u.style.transform = w > 0.995 ? '' : `translate3d(0, ${((1 - w) * 0.32).toFixed(3)}em, 0)`;
    }
  };
  const paint = () => {
    raf = 0;
    const r = sec.getBoundingClientRect(), vh = innerHeight;
    const pinTop = parseFloat(getComputedStyle(stage).top) || 0;
    const travel = reduce ? vh * 0.6 : Math.max(1, r.height - stage.offsetHeight);
    // Begin as the section enters the lower part of the screen; finish just before the stage unpins.
    const start = vh * 0.85, p = cl((start - r.top) / (start - pinTop + travel * 0.92));
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    sec.style.setProperty('--sc-p', p.toFixed(4));
    for (const g of groups) {
      const n = g.units.length, span = g.b - g.a, win = Math.min(span, (span / n) * 3.2);
      g.units.forEach((u, i) => set(u, ease(cl((p - (g.a + ((span - win) * i) / Math.max(1, n - 1))) / win))));
    }
    if (em) {
      const glow = Math.sin(Math.PI * cl((p - 0.72) / 0.28));
      em.querySelectorAll('.nw').forEach((u) => { u.style.textShadow = glow > 0.01 ? `0 0 ${(glow * 22).toFixed(1)}px rgba(255,75,36,0.55)` : ''; });
    }
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(paint); };
  // Listen on window and document (some Android browsers dispatch scroll on the document only),
  // and re-measure when the address bar resizes the visual viewport.
  addEventListener('scroll', req, { passive: true });
  document.addEventListener('scroll', req, { passive: true, capture: true });
  addEventListener('resize', () => { last = -1; req(); });
  if (window.visualViewport) visualViewport.addEventListener('resize', () => { last = -1; req(); });
  addEventListener('pageshow', () => { last = -1; req(); });
  paint();
})();
