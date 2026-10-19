/* Hero logo reveal: dust, a spark at the dot, glyph-sampled particles that
 * spring into the wordmark, then a cross-fade to the real text. Single canvas,
 * no libraries. Reduced motion never reaches here (CSS fade only). */
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
  const mob = matchMedia('(max-width: 800px)').matches, N = mob ? 2500 : 6000;
  const OR = [255, 75, 36];
  const cl = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
  const eo = (t) => 1 - Math.pow(1 - cl(t), 3);
  // Travel on an ease-in-out, then a damped spring overshoot as it lands.
  const sp = (t) => { t = cl(t); const a = t < 0.7 ? t / 0.7 : 1, e = a < 0.5 ? 4 * a * a * a : 1 - Math.pow(-2 * a + 2, 3) / 2; return t < 0.7 ? e * 1.04 : 1 + 0.04 * Math.exp(-9 * (t - 0.7)) * Math.cos(16 * (t - 0.7)); };
  let W, H, dpr, P = [], dust = [], sparks = [], dot = { x: 0, y: 0, r: 4 }, t0 = 0, mx = -1e4, my = -1e4, hov = 0, ac = null, snd = false;

  function size() {
    const r = st.getBoundingClientRect();
    dpr = devicePixelRatio || 1; W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  }
  function sample() {
    const sr = size(), cs = getComputedStyle(wm), fs = parseFloat(cs.fontSize);
    const tr = txt.getBoundingClientRect(), dr = dotEl.getBoundingClientRect();
    const o = document.createElement('canvas'); o.width = Math.ceil(W); o.height = Math.ceil(H);
    const c = o.getContext('2d');
    c.font = `600 ${fs}px "Inter Tight"`; c.letterSpacing = cs.letterSpacing;
    const m = c.measureText('a'), A = m.fontBoundingBoxAscent, D = m.fontBoundingBoxDescent;
    const by = tr.top - sr.top + (tr.height - (A + D)) / 2 + A;
    c.fillText('abracadabra', tr.left - sr.left, by);
    c.fillText('.', dr.left - sr.left, by);
    const d = c.getImageData(0, 0, o.width, o.height).data, pts = [];
    const dl = dr.left - sr.left;
    for (let y = 0; y < o.height; y += 1) for (let x = 0; x < o.width; x += 1) if (d[(y * o.width + x) * 4 + 3] > 140) pts.push([x, y, x >= dl ? 1 : 0]);
    const dp = pts.filter((p) => p[2]);
    if (dp.length) { let sx = 0, sy = 0; dp.forEach((p) => { sx += p[0]; sy += p[1]; }); dot = { x: sx / dp.length, y: sy / dp.length, r: Math.sqrt(dp.length / Math.PI) }; }
    const x0 = tr.left - sr.left, x1 = dr.right - sr.left;
    P = [];
    for (let i = 0; i < N && pts.length; i += 1) {
      const p = pts[Math.floor(Math.random() * pts.length)], q = Math.random() * 2 * (W + H), ex = q < W ? q : q < W + H ? W : q < 2 * W + H ? 2 * W + H - q : 0, ey = q < W ? 0 : q < W + H ? q - W : q < 2 * W + H ? H : 2 * (W + H) - q;
      P.push({ tx: p[0] + Math.random() - 0.5, ty: p[1] + Math.random() - 0.5, sx: ex, sy: ey,
        o: p[2], dl: p[2] ? 0.62 + Math.random() * 0.06 : ((p[0] - x0) / (x1 - x0)) * 0.42 + Math.random() * 0.08, s: Math.random(), hx: 0, hy: 0, cx: 0, cy: 0 });
    }
    dust = Array.from({ length: mob ? 40 : 90 }, () => ({ x: Math.random() * W, y: Math.random() * H, v: 0.1 + Math.random() * 0.25, a: Math.random() * 6.283 }));
  }
  // Curl-like swirl: a smooth rotational offset that dies out as the particle lands.
  const curl = (p, e, T) => { const k = (1 - e) * (1 - e) * (1 - e), a = p.sx * 0.006 + p.sy * 0.009 + T * 1.4; return [Math.sin(a) * 120 * k, Math.cos(a * 1.2) * 80 * k]; };

  function tone(f0, f1, dur, vol, type) {
    if (!snd || !ac) return;
    const o = ac.createOscillator(), v = ac.createGain(), n = ac.currentTime;
    o.type = type; o.frequency.setValueAtTime(f0, n); o.frequency.exponentialRampToValueAtTime(f1, n + dur);
    v.gain.setValueAtTime(0.0001, n); v.gain.exponentialRampToValueAtTime(vol, n + 0.03); v.gain.exponentialRampToValueAtTime(0.0001, n + dur);
    o.connect(v).connect(ac.destination); o.start(n); o.stop(n + dur + 0.05);
  }
  let fired = {};
  const once = (k, f) => { if (!fired[k]) { fired[k] = 1; f(); } };

  function frame(now) {
    if (!t0) { t0 = now; window.__wmStart = now; }
    // Quick replay maps 0.8s onto beats 3-4 (0.9s to 2.7s).
    let T = (now - t0) / 1000; if (quick) T = 0.9 + T * 2.25;
    g.clearRect(0, 0, W, H);
    // Beat 1: grid and dust, fading out after the logo lands.
    const amb = 1 - eo((T - 2.4) / 0.8);
    if (amb > 0) {
      g.strokeStyle = `rgba(255,255,255,${0.045 * amb})`; g.lineWidth = 1; g.beginPath();
      for (let x = (W / 2) % 48; x < W; x += 48) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
      for (let y = (H / 2) % 48; y < H; y += 48) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
      g.stroke();
      g.fillStyle = `rgba(255,255,255,${0.28 * amb})`;
      dust.forEach((d) => { d.a += 0.004; d.x += Math.cos(d.a) * d.v; d.y -= d.v * 0.5; if (d.y < 0) d.y = H; g.fillRect(d.x, d.y, 1.2, 1.2); });
    }
    // Beat 2: spark ignites at the dot, one pulse with a low bloom.
    const ig = cl((T - 0.4) / 0.5);
    if (ig > 0 && T < 2.5) {
      once('s', () => tone(1800, 2600, 1.4, 0.03, 'sine'));
      const pulse = Math.sin(Math.PI * eo(ig)), fade = 1 - eo((T - 1.6) / 0.8), rr = dot.r * (2 + pulse * 3.5);
      const gr = g.createRadialGradient(dot.x, dot.y, 0, dot.x, dot.y, rr);
      gr.addColorStop(0, `rgba(255,190,150,${0.9 * fade})`); gr.addColorStop(0.25, `rgba(255,75,36,${0.45 * fade})`); gr.addColorStop(1, 'rgba(255,75,36,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(dot.x, dot.y, rr, 0, 6.283); g.fill();
    }
    // Beat 3: particles swirl in and spring into the letters, left to right.
    const xf = 1 - eo((T - 2.2) / 0.5);
    if (T >= 2.2) R.classList.add('wm-on');
    if (T >= 2.3) R.classList.add('wm-sweep');
    if (T >= 2.5) { R.classList.add('wm-dot-on'); once('t', () => tone(180, 70, 0.35, 0.12, 'triangle')); }
    if (T > 0.9 && xf > 0) {
      const ps = mob ? 1.6 : 1.4;
      for (let k = 0; k < 2; k += 1) {
        g.fillStyle = k ? 'rgb(255,75,36)' : '#fff';
        for (const p of P) {
          if (p.o !== k) continue;
          const lt = (T - 0.9 - p.dl * 1.4) / 0.62; if (lt <= 0) continue;
          const e = sp(lt), [cx, cy] = curl(p, eo(lt), T);
          const x = p.sx + (p.tx - p.sx) * e + cx, y = p.sy + (p.ty - p.sy) * e + cy;
          g.globalAlpha = cl(lt * 3) * xf * (0.55 + 0.45 * eo(lt));
          g.fillRect(x - ps / 2, y - ps / 2, ps, ps);
        }
      }
      g.globalAlpha = 1;
    }
    // Beat 5: occasional sparks off the dot, and hover loosening.
    if (T > 2.9 && Math.random() < 0.025) sparks.push({ x: dot.x, y: dot.y, vx: (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? -1 : 1), vy: -0.8 - Math.random(), l: 1 });
    sparks = sparks.filter((s) => (s.l -= 0.018) > 0);
    sparks.forEach((s) => { s.x += s.vx; s.y += s.vy; s.vy += 0.025; s.vx *= 0.985; g.fillStyle = `rgba(255,${75 + 120 * s.l | 0},36,${s.l})`; g.fillRect(s.x - 1, s.y - 1, 2, 2); });
    if (T > 2.7) {
      hov += ((mx > -1e3 ? 1 : 0) - hov) * 0.12;
      if (hov > 0.01) {
        for (const p of P) {
          const dx = p.tx - mx, dy = p.ty - my, d = Math.hypot(dx, dy), f = d < 90 ? (1 - d / 90) : 0;
          const gx = f ? (dx / (d || 1)) * 14 * f + Math.sin(now / 300 + p.s * 9) * 4 * f : 0, gy = f ? (dy / (d || 1)) * 14 * f + Math.cos(now / 340 + p.s * 7) * 4 * f : 0;
          p.cx += (gx - p.cx) * 0.18; p.cy += (gy - p.cy) * 0.18; // spring back toward the glyph
          const a = Math.min(1, Math.hypot(p.cx, p.cy) / 6) * hov; if (a < 0.03) continue;
          g.globalAlpha = a; g.fillStyle = p.o ? 'rgb(255,75,36)' : '#fff'; g.fillRect(p.tx + p.cx - 0.7, p.ty + p.cy - 0.7, 1.4, 1.4);
        }
        g.globalAlpha = 1;
      }
    }
    requestAnimationFrame(frame);
  }
  const start = () => { try { sample(); } catch (e) { return done(); } if (!P.length) return done(); requestAnimationFrame(frame); };
  (document.fonts ? document.fonts.load('600 64px "Inter Tight"').then(() => document.fonts.ready) : Promise.resolve()).then(start, start);
  addEventListener('resize', () => { if (R.classList.contains('wm-dot-on')) sample(); });
  st.addEventListener('pointermove', (e) => { const r = st.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; });
  st.addEventListener('pointerleave', () => { mx = my = -1e4; });
  const sb = st.querySelector('.hero__sound');
  if (sb && window.AudioContext) {
    sb.hidden = false;
    sb.addEventListener('click', () => {
      snd = !snd; sb.setAttribute('aria-pressed', snd); sb.textContent = snd ? 'Sound on' : 'Sound off';
      if (snd) { ac = ac || new AudioContext(); ac.resume(); fired = {}; quick = false; t0 = 0; R.classList.remove('wm-on', 'wm-sweep', 'wm-dot-on'); }
    });
  }
})();
