/**
 * Homepage hero: particles gather into the Abra-ca-dabra wordmark, hold,
 * then swirl into the wireframe orb. Three.js loads only for a first visit
 * that can play motion. Reduced motion, a replay in this tab, and a missing
 * WebGL context leave the still images in place.
 */
const stage = document.querySelector('[data-hero-stage]');
const root = document.documentElement;
const SESSION_KEY = 'abra-hero-reveal';
const DURATION = 3400;

function prefersReduced() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function alreadyPlayed() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markPlayed() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* private mode can reject storage; the in-memory flag still ends the play */
  }
}

function smoothstep(edge0, edge1, value) {
  const span = edge1 - edge0;
  const t = span === 0 ? 1 : Math.min(1, Math.max(0, (value - edge0) / span));
  return t * t * (3 - 2 * t);
}

function showSettled() {
  root.classList.add('hero-settled');
  root.classList.remove('hero-playing');
}

if (!stage || prefersReduced() || alreadyPlayed() || root.classList.contains('hero-settled')) {
  if (stage) showSettled();
} else {
  const session = { finished: false, dispose: null, disarm: () => {} };

  const skip = () => {
    if (session.finished) return;
    session.finished = true;
    session.disarm();
    markPlayed();
    if (session.dispose) session.dispose();
    stage.querySelector('.hero__canvas')?.remove();
    root.classList.remove('hero-playing', 'hero-live');
    root.classList.add('hero-settled');
  };

  const onStageClick = (event) => {
    if (event.target.closest('a, button')) return;
    skip();
  };
  const onScroll = () => {
    if (window.scrollY > 40) skip();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') skip();
  };
  const skipButton = stage.querySelector('.hero__skip');
  skipButton?.addEventListener('click', skip);
  stage.addEventListener('click', onStageClick);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('keydown', onKey);
  session.disarm = () => {
    skipButton?.removeEventListener('click', skip);
    stage.removeEventListener('click', onStageClick);
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('keydown', onKey);
  };

  root.classList.add('hero-playing');

  import('./vendor/hero-three.js')
    .then((three) => play(three, session))
    .catch(() => {
      if (session.finished) return;
      session.finished = true;
      session.disarm();
      if (session.dispose) session.dispose();
      stage.querySelector('.hero__canvas')?.remove();
      root.classList.remove('hero-playing', 'hero-live');
      root.classList.add('hero-static');
    });
}

async function play(three, session) {
  if (session.finished) return;
  const word = await sampleWordmark();
  if (session.finished) return;
  if (word.length < 8) throw new Error('wordmark sample was empty');

  const mobile = window.matchMedia('(max-width: 800px)').matches;
  const budget = mobile ? 2600 : 5600;
  const chosen = stride(word, budget);
  const count = chosen.length;
  const scatter = new Float32Array(count * 3);
  const wordPos = new Float32Array(count * 3);
  const orbPos = new Float32Array(count * 3);
  const accent = new Float32Array(count);
  const seed = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const point = chosen[i];
    const orb = orbCoordinate(i, count);
    const spread = point.accent ? 0.008 : 0.0065;
    scatter[i * 3] = (Math.random() - 0.5) * 4.4;
    scatter[i * 3 + 1] = (Math.random() - 0.5) * 2.6;
    scatter[i * 3 + 2] = (Math.random() - 0.5) * 1.8;
    wordPos[i * 3] = point.x + (Math.random() - 0.5) * spread;
    wordPos[i * 3 + 1] = point.y + (Math.random() - 0.5) * spread;
    wordPos[i * 3 + 2] = (Math.random() - 0.5) * 0.012;
    orbPos[i * 3] = orb[0];
    orbPos[i * 3 + 1] = orb[1];
    orbPos[i * 3 + 2] = orb[2];
    accent[i] = point.accent;
    seed[i] = Math.random();
  }

  const {
    AdditiveBlending,
    BufferGeometry,
    Color,
    Float32BufferAttribute,
    Group,
    LineBasicMaterial,
    LineSegments,
    PerspectiveCamera,
    Points,
    Scene,
    ShaderMaterial,
    WebGLRenderer,
  } = three;

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(wordPos, 3));
  geometry.setAttribute('aScatter', new Float32BufferAttribute(scatter, 3));
  geometry.setAttribute('aWord', new Float32BufferAttribute(wordPos, 3));
  geometry.setAttribute('aOrb', new Float32BufferAttribute(orbPos, 3));
  geometry.setAttribute('aAccent', new Float32BufferAttribute(accent, 1));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));

  const material = new ShaderMaterial({
    uniforms: {
      uT: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: mobile ? 2.6 : 2.2 },
      uFit: { value: 2.2 },
      uInk: { value: new Color('#F5F1E8') },
      uAccent: { value: new Color('#FF4B24') },
      uOptic: { value: new Color('#8DEBF2') },
    },
    vertexShader: `
      attribute vec3 aScatter;
      attribute vec3 aWord;
      attribute vec3 aOrb;
      attribute float aAccent;
      attribute float aSeed;
      uniform float uT;
      uniform float uTime;
      uniform float uSize;
      uniform float uFit;
      uniform vec3 uInk;
      uniform vec3 uAccent;
      uniform vec3 uOptic;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        float toWord = smoothstep(0.16, 0.40, uT);
        float hold = smoothstep(0.40, 0.46, uT) * (1.0 - smoothstep(0.56, 0.64, uT));
        float toOrb = smoothstep(0.60, 0.94, uT);
        vec3 word = vec3(aWord.xy * uFit, aWord.z);
        vec3 formed = mix(word, aOrb, toOrb);
        vec3 pos = mix(aScatter, formed, toWord);
        float drift = (1.0 - toWord) * 0.16;
        pos.x += sin(uTime * 1.6 + aSeed * 12.0) * drift;
        pos.y += cos(uTime * 1.25 + aSeed * 9.0) * drift;
        pos.z += sin(uTime * 0.8 + aSeed * 6.0) * drift * 0.65;
        float spark = 0.5 + 0.5 * sin(uTime * 10.0 + aSeed * 40.0);
        float shimmer = 0.5 + 0.5 * sin(uTime * 5.5 + aSeed * 22.0);
        pos.xy += vec2(
          sin(uTime * 3.2 + aSeed * 18.0),
          cos(uTime * 2.6 + aSeed * 14.0)
        ) * hold * aAccent * (0.02 + 0.018 * spark);
        float swirl = sin(toOrb * 3.14159265);
        float ang = swirl * (0.55 + aSeed * 0.9) * 2.4;
        float c = cos(ang);
        float s = sin(ang);
        pos.xy = mat2(c, -s, s, c) * pos.xy;
        pos.z += swirl * (aSeed - 0.5) * 0.45;
        vec4 view = modelViewMatrix * vec4(pos, 1.0);
        gl_Position = projectionMatrix * view;
        float formedScale = 0.72 + 0.55 * max(toWord * (1.0 - toOrb), toOrb * 0.85);
        float starScale = 1.0 + aAccent * hold * (1.8 + spark * 1.4);
        gl_PointSize = uSize * formedScale * starScale * (1.0 + hold * shimmer * 0.12) * (3.15 / max(0.35, -view.z));
        vec3 ink = mix(uInk, uAccent, clamp(aAccent * (1.0 - toOrb) * (0.85 + 0.35 * spark), 0.0, 1.0));
        vColor = mix(ink, uOptic, toOrb);
        vAlpha = 0.62 + 0.38 * max(toWord, toOrb);
        vAlpha += aAccent * hold * spark * 0.35;
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float dist = length(uv);
        if (dist > 0.5) discard;
        float glow = smoothstep(0.5, 0.0, dist);
        glow = pow(glow, 0.65);
        gl_FragColor = vec4(vColor, glow * vAlpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  });

  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(0, 0.12, 3.15);
  camera.lookAt(0, 0, 0);
  const group = new Group();
  group.add(new Points(geometry, material));

  const linePositions = lineRingPositions();
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
  const lineMaterial = new LineBasicMaterial({
    color: 0x8debf2,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  group.add(new LineSegments(lineGeometry, lineMaterial));
  scene.add(group);

  const captureFrames = new URLSearchParams(window.location.search).has('hero-frames');
  const shots = captureFrames ? (window.__heroShots = []) : null;
  const shotMarks = [0.08, 0.3, 0.5, 0.78, 1];
  const renderer = new WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: captureFrames,
  });
  if (!renderer.getContext()) throw new Error('webgl');
  const canvas = renderer.domElement;
  canvas.className = 'hero__canvas';
  canvas.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  stage.appendChild(canvas);

  let raf = 0;
  let alive = true;
  let startedAt = 0;
  let elapsedBase = 0;
  let settled = false;
  let onScreen = true;

  const resize = () => {
    const rect = stage.getBoundingClientRect();
    const dprCap = mobile ? 1.25 : 1.5;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    renderer.setPixelRatio(dpr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    material.uniforms.uSize.value = (mobile ? 2.6 : 2.2) * dpr;
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * camera.position.z;
    const halfW = halfH * camera.aspect;
    material.uniforms.uFit.value = Math.min(halfW * 1.72, halfH * 6.4);
  };

  const frame = (now) => {
    raf = 0;
    if (!alive) return;
    if (document.hidden || !onScreen) {
      if (startedAt) {
        elapsedBase += now - startedAt;
        startedAt = 0;
      }
      return;
    }
    if (!startedAt) startedAt = now;
    const t = Math.min(1, (elapsedBase + (now - startedAt)) / DURATION);
    material.uniforms.uT.value = t;
    material.uniforms.uTime.value = now * 0.001;
    lineMaterial.opacity = smoothstep(0.66, 0.92, t);
    if (t >= 1 && !settled) {
      settled = true;
      session.finished = true;
      session.disarm();
      markPlayed();
      root.classList.add('hero-settled', 'hero-live');
      root.classList.remove('hero-playing');
    }
    if (settled) group.rotation.y += 0.0025;
    renderer.render(scene, camera);
    if (shots) {
      for (const mark of shotMarks) {
        if (t >= mark && !shots.some((shot) => shot.mark === mark)) {
          shots.push({ mark, url: canvas.toDataURL('image/jpeg', 0.72) });
        }
      }
    }
    raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!alive || raf) return;
    raf = requestAnimationFrame(frame);
  };

  const onVisible = () => kick();
  const observer = new IntersectionObserver((entries) => {
    onScreen = entries.some((entry) => entry.isIntersecting);
    if (onScreen) kick();
  }, { threshold: 0.05 });

  session.dispose = () => {
    alive = false;
    if (raf) cancelAnimationFrame(raf);
    observer.disconnect();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('resize', resize);
    geometry.dispose();
    material.dispose();
    lineGeometry.dispose();
    lineMaterial.dispose();
    renderer.dispose();
    canvas.remove();
  };

  if (session.finished) {
    session.dispose();
    return;
  }

  observer.observe(stage);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('resize', resize);
  resize();
  kick();
}

function stride(points, budget) {
  if (points.length <= budget) return points;
  const chosen = [];
  for (let i = 0; i < budget; i += 1) {
    chosen.push(points[Math.floor((i * points.length) / budget)]);
  }
  return chosen;
}

async function sampleWordmark() {
  const url = new URL('./wordmark/abra-ca-dabra-samples.json', import.meta.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error('wordmark sample fetch failed');
  const payload = await response.json();
  if (!Array.isArray(payload.points)) throw new Error('wordmark sample was empty');
  return payload.points.map((point) => ({
    x: point[0],
    y: point[1],
    accent: point[2],
  }));
}

function orbCoordinate(index, count) {
  const radius = 0.74;
  const latBands = 5;
  const meridians = 8;
  const rings = latBands + meridians;
  const slot = index % rings;
  const steps = Math.max(1, Math.floor(count / rings));
  const along = (Math.floor(index / rings) + 0.5) / steps;
  const angle = along * Math.PI * 2;
  if (slot < latBands) {
    const y = -0.58 + (slot / (latBands - 1)) * 1.16;
    const ring = Math.sqrt(Math.max(0, radius * radius - y * y));
    return [Math.cos(angle) * ring, y, Math.sin(angle) * ring];
  }
  const meridian = ((slot - latBands) / meridians) * Math.PI;
  const cos = Math.cos(meridian);
  const sin = Math.sin(meridian);
  return [
    Math.sin(angle) * cos * radius,
    Math.cos(angle) * radius,
    Math.sin(angle) * sin * radius,
  ];
}

function lineRingPositions() {
  const radius = 0.74;
  const values = [];
  const pushRing = (pts) => {
    for (let i = 0; i < pts.length; i += 1) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      values.push(a[0], a[1], a[2], b[0], b[1], b[2]);
    }
  };
  for (const y of [-0.55, -0.28, 0, 0.28, 0.55]) {
    const ring = Math.sqrt(Math.max(0, radius * radius - y * y));
    const pts = [];
    for (let step = 0; step < 48; step += 1) {
      const angle = (step / 48) * Math.PI * 2;
      pts.push([Math.cos(angle) * ring, y, Math.sin(angle) * ring]);
    }
    pushRing(pts);
  }
  for (let meridian = 0; meridian < 8; meridian += 1) {
    const angle = (meridian / 8) * Math.PI;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const pts = [];
    for (let step = 0; step < 48; step += 1) {
      const theta = (step / 48) * Math.PI * 2;
      pts.push([
        Math.sin(theta) * cos * radius,
        Math.cos(theta) * radius,
        Math.sin(theta) * sin * radius,
      ]);
    }
    pushRing(pts);
  }
  const horizon = [];
  for (let step = 0; step < 48; step += 1) {
    const angle = (step / 48) * Math.PI * 2;
    horizon.push([Math.cos(angle) * 0.98, -0.62, Math.sin(angle) * 0.16]);
  }
  pushRing(horizon);
  return new Float32Array(values);
}
