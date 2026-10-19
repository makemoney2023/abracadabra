/* "The name" read-along: a pinned act whose progress (--sc-p, scroll-craft
 * convention) scrubs each word from ghost to ink, label first, then the
 * headline, then the body, with the orange "avra kadavra" glowing last.
 * Reduced motion and no-JS keep every word at full ink. */
(() => {
  const sec = document.querySelector('[data-name-reveal]');
  if (!sec || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
            const s = document.createElement('span'); s.className = 'nw'; s.textContent = t; frag.append(s); out.push(s);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      }
    };
    walk(el);
    return out;
  };
  const label = sec.querySelector('.sc-label'), h = sec.querySelector('h2'), body = sec.querySelector('.sc-body');
  const groups = [[label, 0.0, 0.1], [h, 0.06, 0.5], [body, 0.46, 0.86]].map(([el, a, b]) => ({ units: split(el), a, b }));
  const em = sec.querySelector('em');
  h.setAttribute('aria-label', h.textContent.trim());
  R.classList.add('name-live');
  const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  let last = -1, raf = 0;
  const paint = () => {
    raf = 0;
    const r = sec.getBoundingClientRect(), vh = innerHeight, travel = Math.max(1, r.height - vh);
    // Start a little before the pin engages so the first words are already moving as it arrives.
    const p = cl((vh * 0.35 - r.top) / (travel + vh * 0.35));
    if (Math.abs(p - last) < 0.0005) return;
    last = p;
    sec.style.setProperty('--sc-p', p.toFixed(4));
    for (const g of groups) {
      const n = g.units.length, span = g.b - g.a, win = Math.min(span, (span / n) * 3.2);
      g.units.forEach((u, i) => {
        const s = g.a + ((span - win) * i) / Math.max(1, n - 1);
        u.style.setProperty('--w', ease(cl((p - s) / win)).toFixed(3));
      });
    }
    if (em) em.style.setProperty('--glow', (Math.sin(Math.PI * cl((p - 0.7) / 0.3)) * 1).toFixed(3));
  };
  const req = () => { if (!raf) raf = requestAnimationFrame(paint); };
  addEventListener('scroll', req, { passive: true });
  addEventListener('resize', () => { last = -1; req(); });
  paint();
})();
