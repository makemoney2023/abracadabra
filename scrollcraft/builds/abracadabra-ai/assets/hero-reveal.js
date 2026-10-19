/* Hero logo reveal: dust, a spark at the dot, glyph-sampled light streaks
 * that settle into the wordmark, then a cross-fade to the real text.
 * Single canvas, no libraries. Reduced motion never runs this (CSS fade). */
(() => {
  const R = document.documentElement, st = document.querySelector('[data-hero-stage]');
  if (!st || !R.classList.contains('wm-js')) return;
  const wm = st.querySelector('.hero__wm'), txt = wm.querySelector('.wm-txt'), dotEl = wm.querySelector('.wm-dot');
  const done = () => R.classList.add('wm-on', 'wm-dot-on');
  let quick = false;
  try { quick = sessionStorage.getItem('abra-wm') === '1'; sessionStorage.setItem('abra-wm', '1'); } catch (e) {}
  if (/[?&]wm-full/.test(location.search)) quick = false;
  const cv = document.createElement('canvas'); cv.className = 'hero__canvas'; cv.setAttribute('aria-hidden', 'true');
  st.prepend(cv);
  const g = cv.getContext('2d');
  if (!g) return done();
  const mob = matchMedia('(max-width: 768px)').matches, N = mob ? 2500 : 6000;
  const cl = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const eo = (t) => 1 - Math.pow(1 - cl(t), 3);
  const eq = (t) => 1 - Math.pow(1 - cl(t), 5);
  const ss = (a, b, v) => { const t = cl((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  // Glow sprites: a hot core with a soft halo, drawn additively.
  const sprite = (c) => { const s = document.createElement('canvas'); s.width = s.height = 32; const x = s.getContext('2d'), r = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, `rgba(${c},1)`); r.addColorStop(0.18, `rgba(${c},0.85)`); r.addColorStop(0.45, `rgba(${c},0.18)`); r.addColorStop(1, `rgba(${c},0)`); x.fillStyle = r; x.fillRect(0, 0, 32, 32); return s; };
  const SW = sprite('255,255,255'), SO = sprite('255,92,48');
  let W, H, P = [], dust = [], sparks = [], dot = { x: 0, y: 0, r: 4 }, cx0 = 0, cy0 = 0, t0 = 0, mx = -1e4, my = -1e4, hov = 0, ac = null, snd = false;
  let raf = 0, vis = true, pausedAt = 0;

  function size() {
    const r = st.getBoundingClientRect(), dpr = devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  function sample() {
    const sr = size(), cs = getComputedStyle(wm), fs = parseFloat(cs.fontSize);
    const tr = txt.getBoundingClientRect(), dr = dotEl.getBoundingClientRect();
    const o = document.createElement('canvas'); o.width = Math.ceil(W); o.height = Math.ceil(H);
    const c = o.getContext('2d', { willReadFrequently: true });
    c.font = `600 ${fs}px "Inter Tight"`; c.letterSpacing = cs.letterSpacing;
    const m = c.measureText('a'), A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
    const by = tr.top - sr.top + (tr.height - (A + D)) / 2 + A, dl = dr.left - sr.left;
    c.fillText('abracadabra', tr.left - sr.left, by); c.fillText('.', dl, by);
    const d = c.getImageData(0, 0, o.width, o.height).data, pts = [];
    for (let y = 0; y < o.height; y += 1) for (let x = 0; x < o.width; x += 1) if (d[(y * o.width + x) * 4 + 3] > 140) pts.push([x, y, x >= dl ? 1 : 0]);
    const dp = pts.filter((p) => p[2]);
    if (dp.length) { let sx = 0, sy = 0; dp.forEach((p) => { sx += p[0]; sy += p[1]; }); dot = { x: sx / dp.length, y: sy / dp.length, r: Math.sqrt(dp.length / Math.PI) }; }
    const x0 = tr.left - sr.left, x1 = dr.right - sr.left; cx0 = (x0 + x1) / 2; cy0 = by - fs * 0.35;
    const far = Math.max(W, H) * (mob ? 0.9 : 0.62);
    P = [];
    for (let i = 0; i < N && pts.length; i += 1) {
      // Spawn on a soft ring well outside the letters; brightness ramps with distance so there is no hard edge.
      const p = pts[Math.floor(Math.random() * pts.length)], a = Math.random() * 6.283, rr = far * (0.75 + Math.random() * 0.6);
      const z = Math.random();
      P.push({ tx: p[0] + Math.random() - 0.5, ty: p[1] + Math.random() - 0.5, sx: cx0 + Math.cos(a) * rr, sy: cy0 + Math.sin(a) * rr * 0.55,
        o: p[2], dl: p[2] ? 0.86 + Math.random() * 0.06 : ((p[0] - x0) / (x1 - x0)) * 0.55 + Math.random() * 0.1,
        z: 0.35 + z * z * 1.3, b: 0.45 + Math.random() * 0.55, s: Math.random(), cx: 0, cy: 0 });
    }
    dust = Array.from({ length: mob ? 34 : 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random(), a: Math.random() * 6.283 }));
    P.far = far;
  }
  const swirl = (p, e, T) => { const k = Math.pow(1 - e, 2.4), a = p.sx * 0.004 + p.sy * 0.006 + T * 0.9; return [Math.sin(a) * 110 * k, Math.cos(a * 1.15) * 60 * k]; };

  function tone(f0, f1, dur, vol, type) {
    if (!snd || !ac) return;
    const o = ac.createOscillator(), v = ac.createGain(), n = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + dur);
    v.gain.setValueAtTime(0.0001, n); v.gain.exponentialRampToValueAtTime(vol, n + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.connect(v).connect(ac.destination); o.start(n); o.stop(n + dur + 0.05);
  }
  let fired = {};
  const once = (k, f) => { if (!fired[k]) { fired[k] = 1; f(); } };
  const glow = (s, x, y, r, a) => { g.globalAlpha = a; g.drawImage(s, x - r, y - r, r * 2, r * 2); };

  function frame(now) {
    raf = 0;
    if (!t0) { t0 = now; window.__wmStart = now; }
    let T = (now - t0) / 1000; if (quick) T = 0.9 + T * 2.25;
    // Motion trails: fade the previous frame instead of clearing it.
    g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 1;
    g.fillStyle = `rgba(0,0,0,${T > 0.9 && T < 2.3 ? 0.24 : 0.5})`; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'lighter';
    R.classList.toggle('wm-grid', T < 2.6);
    const amb = 1 - eo((T - 2.4) / 0.9);
    for (const d of dust) {
      d.a += 0.003 * d.z; d.x += Math.cos(d.a) * 0.12 * d.z; d.y -= 0.1 * d.z; if (d.y < -4) d.y = H + 4;
      glow(SW, d.x, d.y, 1.6 * d.z, (0.1 + 0.12 * Math.sin(now / 900 + d.a * 7) ** 2) * d.z * (0.35 + 0.65 * amb));
    }
    // Spark at the dot: one soft pulse, low bloom.
    const ig = cl((T - 0.4) / 0.5);
    if (ig > 0 && T < 2.6) {
      once('s', () => tone(1800, 2600, 1.4, 0.03, 'sine'));
      const pulse = Math.sin(Math.PI * eo(ig)), fade = 1 - ss(1.4, 2.4, T);
      glow(SO, dot.x, dot.y, dot.r * (5 + pulse * 7), 0.5 * fade);
      glow(SW, dot.x, dot.y, dot.r * (1.2 + pulse), 0.8 * fade);
    }
    const xf = 1 - ss(2.2, 2.75, T);
    if (T >= 2.2) R.classList.add('wm-on');
    if (T >= 2.32) R.classList.add('wm-sweep');
    if (T >= 2.5) { R.classList.add('wm-dot-on'); once('t', () => tone(180, 70, 0.35, 0.12, 'triangle')); }
    if (T > 0.9 && xf > 0) {
      // In flight, each particle is a short streak from its last position, batched by colour and brightness.
      const far = P.far, B = [[], [], [], [], [], [], [], []];
      for (const p of P) {
        const lt = (T - 0.9 - p.dl * 0.62) / 0.82; if (lt <= 0) { p.px = undefined; continue; }
        const e = eq(lt), [ox, oy] = swirl(p, e, T);
        const x = p.sx + (p.tx - p.sx) * e + ox, y = p.sy + (p.ty - p.sy) * e + oy;
        const dd = Math.hypot(x - cx0, (y - cy0) * 1.6), near = 1 - ss(far * 0.3, far * 0.95, dd);
        const land = ss(0.7, 1, lt), a = near * p.b * xf;
        if (p.px !== undefined && land < 1) { let qx = p.px - x, qy = p.py - y; const L = Math.hypot(qx, qy), M = 7 + 16 * p.z; if (L > M) { qx *= M / L; qy *= M / L; } B[p.o * 4 + Math.min(3, a * 4 | 0)].push(x + qx, y + qy, x, y); }
        if (land > 0) glow(p.o ? SO : SW, x, y, p.z * 1.5 * (mob ? 1.1 : 1), a * (0.35 + 0.65 * land));
        p.px = x; p.py = y;
      }
      g.lineCap = 'round'; g.lineWidth = mob ? 1.1 : 0.9;
      B.forEach((s, i) => { if (!s.length) return; g.globalAlpha = ((i % 4) + 0.5) * 0.06; g.strokeStyle = i > 3 ? 'rgb(255,92,48)' : '#fff'; g.beginPath();
        for (let k = 0; k < s.length; k += 4) { g.moveTo(s[k], s[k + 1]); g.lineTo(s[k + 2], s[k + 3]); } g.stroke(); });
    }
    // Shockwave when the dot lands.
    const sk = (T - 2.55) / 0.7;
    if (sk > 0 && sk < 1) {
      g.globalAlpha = (1 - eo(sk)) * 0.55; g.strokeStyle = 'rgb(255,92,48)'; g.lineWidth = 1.5 * (1 - sk) + 0.4;
      g.beginPath(); g.arc(dot.x, dot.y, dot.r * 1.5 + eq(sk) * dot.r * 14, 0, 6.283); g.stroke();
    }
    if (T > 2.9 && Math.random() < 0.02) sparks.push({ x: dot.x, y: dot.y, vx: (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1), vy: -0.7 - Math.random() * 0.8, l: 1 });
    sparks = sparks.filter((s) => (s.l -= 0.016) > 0);
    for (const s of sparks) { s.x += s.vx; s.y += s.vy; s.vy += 0.022; s.vx *= 0.985; glow(SO, s.x, s.y, 3 * s.l + 1, s.l * 0.9); }
    if (T > 2.75) {
      hov += ((mx > -1e3 ? 1 : 0) - hov) * 0.12;
      if (hov > 0.01) for (const p of P) {
        const dx = p.tx - mx, dy = p.ty - my, d = Math.hypot(dx, dy), f = d < 90 ? 1 - d / 90 : 0;
        const gx = f ? (dx / (d || 1)) * 14 * f + Math.sin(now / 300 + p.s * 9) * 4 * f : 0, gy = f ? (dy / (d || 1)) * 14 * f + Math.cos(now / 340 + p.s * 7) * 4 * f : 0;
        p.cx += (gx - p.cx) * 0.18; p.cy += (gy - p.cy) * 0.18;
        const a = Math.min(1, Math.hypot(p.cx, p.cy) / 6) * hov; if (a > 0.03) glow(p.o ? SO : SW, p.tx + p.cx, p.ty + p.cy, 1.6 * p.z, a * p.b);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    kick();
  }
  // Run only while the hero is on screen and the tab is visible; resume on the same timeline.
  const kick = () => { if (!raf && vis && !document.hidden && P.length) { if (pausedAt && t0) t0 += performance.now() - pausedAt; pausedAt = 0; raf = requestAnimationFrame(frame); } };
  const halt = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (!pausedAt) pausedAt = performance.now(); };
  window.__wmRunning = () => raf !== 0;
  const start = () => {
    try { sample(); } catch (e) { return done(); }
    if (!P.length) return done();
    new IntersectionObserver((es) => { vis = es.some((x) => x.isIntersecting); vis ? kick() : halt(); }).observe(st);
    document.addEventListener('visibilitychange', () => (document.hidden ? halt() : kick()));
    kick();
  };
  (document.fonts ? document.fonts.load('600 64px "Inter Tight"').then(() => document.fonts.ready) : Promise.resolve()).then(start, start);
  addEventListener('resize', () => { if (R.classList.contains('wm-dot-on')) sample(); });
  st.addEventListener('pointermove', (e) => { const r = st.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
  st.addEventListener('pointerleave', () => { mx = my = -1e4; });
  const sb = st.querySelector('.hero__sound');
  if (sb && window.AudioContext) {
    sb.hidden = false;
    sb.addEventListener('click', () => {
      snd = !snd; sb.setAttribute('aria-pressed', snd); sb.textContent = snd ? 'Sound on' : 'Sound off';
      if (snd) { ac = ac || new AudioContext(); ac.resume(); fired = {}; quick = false; t0 = 0; R.classList.remove('wm-on', 'wm-sweep', 'wm-dot-on'); kick(); }
    });
  }
})();
