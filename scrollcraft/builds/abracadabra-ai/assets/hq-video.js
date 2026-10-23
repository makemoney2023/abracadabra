/* Homepage #hq-video: loads late, plays muted only while at least half the section is in view,
 * pauses when it leaves, and never autoplays under reduced motion or Save-Data (poster plus Play button).
 * The video has no src in the HTML, so nothing downloads until the section is near the screen. */
(() => {
  const sec = document.getElementById('hq-video');
  if (!sec) return;
  const v = sec.querySelector('video');
  const btn = sec.querySelector('[data-hq-video-toggle]');
  const label = btn && btn.querySelector('.hq-video__toggle-text');
  if (!v || !btn) return;
  const portrait = matchMedia('(max-aspect-ratio: 1/1)');
  const conn = navigator.connection || {};
  const manual = matchMedia('(prefers-reduced-motion: reduce)').matches || conn.saveData === true;
  let loaded = '';
  let inView = false;
  let userPaused = false;
  let userStarted = false;
  const pick = () => {
    const p = portrait.matches;
    return { src: p ? v.dataset.srcPortrait : v.dataset.srcLandscape, poster: p ? v.dataset.posterPortrait : v.dataset.posterLandscape };
  };
  const play = () => {
    const r = v.play();
    if (r && r.catch) r.catch(() => {});
  };
  const load = () => {
    const { src, poster } = pick();
    if (!src || loaded === src) return;
    const resume = loaded && !v.paused;
    loaded = src;
    v.poster = poster;
    v.preload = 'metadata';
    v.src = src;
    v.load();
    if (resume) play();
  };
  const want = () => inView && !userPaused && !document.hidden && (!manual || userStarted);
  const sync = () => {
    if (want()) { load(); if (v.paused) play(); } else if (!v.paused) v.pause();
  };
  const paint = () => {
    const playing = !v.paused && !v.ended;
    sec.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Pause the HQ product video' : 'Play the HQ product video');
    if (label) label.textContent = playing ? 'Pause' : 'Play';
  };
  v.addEventListener('play', paint);
  v.addEventListener('pause', paint);
  v.addEventListener('playing', () => { sec.classList.add('is-ready'); paint(); });
  v.addEventListener('emptied', paint);
  btn.addEventListener('click', () => {
    if (v.paused) {
      userPaused = false;
      userStarted = true;
      load();
      play();
    } else {
      userPaused = true;
      v.pause();
    }
  });
  document.addEventListener('visibilitychange', sync);
  portrait.addEventListener('change', () => { if (loaded) load(); });
  if (!('IntersectionObserver' in window)) return;
  // Fetch the metadata when the section is about a screen away (not at all in manual mode).
  if (!manual) {
    const near = new IntersectionObserver((es) => {
      if (es.some((e) => e.isIntersecting)) { load(); near.disconnect(); }
    }, { rootMargin: '100% 0px' });
    near.observe(sec);
  }
  new IntersectionObserver((es) => {
    inView = es.some((e) => e.intersectionRatio >= 0.5);
    sync();
  }, { threshold: [0, 0.5, 1] }).observe(sec);
  paint();
})();
