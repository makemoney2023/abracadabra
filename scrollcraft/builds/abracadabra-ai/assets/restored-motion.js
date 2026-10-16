/* Restored homepage motion.
   Parallel-agent sweep runs from markup (400c6e63). This file drives the
   compiler, both calendars (528d879b setTimeState), and the range canvas. */
(function () {
  var reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function far(el) {
    if (!el) return true;
    var rect = el.getBoundingClientRect();
    return rect.bottom < -400 || rect.top > innerHeight + 400;
  }

  var requests = [
    {
      request: 'Show up when someone asks an AI for what you do.',
      result: 'A page an answer engine can check, with the question and the evidence beside it.',
      href: '/services/ai-visibility/'
    },
    {
      request: 'Ship on-brand images, video, and voice, and research you can open.',
      result: 'Media and cited research, ready to publish.',
      href: '/services/ai-media/'
    },
    {
      request: 'Post in your voice, on the channels you already use.',
      result: 'Social posts written, scheduled, and ready to go out.',
      href: '/services/ai-media/'
    },
    {
      request: 'Keep the conversation and finish the request in the tools you already use.',
      result: 'An assistant that stays in the thread and completes the next step.',
      href: '/services/ai-assistants-and-agents/'
    },
    {
      request: 'Answer callers from your records, and hand off when a person is needed.',
      result: 'The call is answered from your records. A person takes the ones that need one.',
      href: '/services/voice-and-realtime-agents/'
    },
    {
      request: 'Take the repetitive web work off your plate.',
      result: 'The repeated steps run on their own. You see what happened.',
      href: '/services/web-automation/'
    },
    {
      request: 'Make the screens follow the way you already work.',
      result: 'An interface shaped around your steps, not a generic template.',
      href: '/portfolio/'
    },
    {
      request: 'Run the apps on one bill, and let them grow without a rebuild.',
      result: 'The same apps, from the first user onward, fast and available.',
      href: '/services/any-model-one-bill/'
    }
  ];

  var compiler = document.querySelector('#compiler .compiler');
  var compilerButtons = compiler ? Array.prototype.slice.call(compiler.querySelectorAll('[data-compiler-state]')) : [];
  var compilerStatus = compiler ? compiler.querySelector('[data-compiler-status]') : null;
  var compilerStates = ['describe', 'engineer', 'build', 'run'];
  var compilerStatuses = {
    describe: 'Listening',
    engineer: 'Intent and context engineered',
    build: 'Agents building in parallel',
    run: 'System live'
  };
  var compilerWasChosen = false;
  var requestIndex = 0;
  var requestTimer = 0;
  var compilerVisible = false;
  var requestNode = compiler ? compiler.querySelector('[data-compiler-request]') : null;
  var resultNode = compiler ? compiler.querySelector('[data-compiler-result]') : null;
  var resultLink = compiler ? compiler.querySelector('[data-compiler-result-link]') : null;

  function showRequest(index) {
    requestIndex = index;
    var item = requests[index];
    if (requestNode) requestNode.textContent = item.request;
    if (resultNode) resultNode.textContent = item.result;
    if (resultLink) resultLink.setAttribute('href', item.href);
  }

  function armRequests() {
    if (requestTimer) {
      clearInterval(requestTimer);
      requestTimer = 0;
    }
    if (reduceMotion || !compilerVisible || document.hidden) return;
    requestTimer = setInterval(function () {
      showRequest((requestIndex + 1) % requests.length);
    }, 3200);
  }

  function setCompilerState(state, chosen) {
    if (!compiler || compilerStates.indexOf(state) < 0) return;
    if (chosen) compilerWasChosen = true;
    if (compiler.getAttribute('data-active-state') === state) return;
    compiler.setAttribute('data-active-state', state);
    compilerButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-compiler-state') === state ? 'true' : 'false');
    });
    if (compilerStatus) compilerStatus.textContent = compilerStatuses[state];
  }

  compilerButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setCompilerState(button.getAttribute('data-compiler-state'), true);
    });
  });
  var compilerSkip = compiler ? compiler.querySelector('[data-compiler-skip]') : null;
  if (compilerSkip) compilerSkip.addEventListener('click', function () { setCompilerState('run', true); });

  if (compiler && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      compilerVisible = entries[0].isIntersecting;
      armRequests();
    }).observe(compiler);
  } else if (compiler) {
    compilerVisible = true;
    armRequests();
  }
  document.addEventListener('visibilitychange', armRequests);
  showRequest(0);

  function resolveCompilerFromScroll() {
    if (!compiler || reduceMotion || compilerWasChosen || innerWidth <= 1100) return;
    var act = document.getElementById('compiler');
    if (far(act)) return;
    var travel = Math.max(1, act.offsetHeight - innerHeight);
    var progress = Math.min(1, Math.max(0, -act.getBoundingClientRect().top / travel));
    setCompilerState(
      progress < 0.24 ? 'describe' : progress < 0.49 ? 'engineer' : progress < 0.74 ? 'build' : 'run',
      false
    );
  }

  function bindCalendar(section) {
    if (!section) return function () {};
    var engine = section.querySelector('.time-engine');
    var buttons = Array.prototype.slice.call(section.querySelectorAll('[data-time-state]'));
    var status = section.querySelector('[data-time-status]');
    var states = ['conventional', 'engineer', 'parallel', 'arrive'];
    var statuses = {
      conventional: 'Serial calendar',
      engineer: 'Front-loaded',
      parallel: 'Workstreams overlapping',
      arrive: 'Arrived early'
    };
    var chosen = false;

    function setState(state, userChose) {
      if (!engine || states.indexOf(state) === -1) return;
      if (userChose) chosen = true;
      if (engine.getAttribute('data-active-state') === state) return;
      engine.setAttribute('data-active-state', state);
      buttons.forEach(function (button) {
        button.setAttribute('aria-pressed', button.getAttribute('data-time-state') === state ? 'true' : 'false');
      });
      if (status) status.textContent = statuses[state];
    }

    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        setState(button.getAttribute('data-time-state'), true);
      });
    });

    if (reduceMotion) setState('arrive', false);

    return function resolve() {
      if (!engine || reduceMotion || chosen || innerWidth <= 1100) return;
      if (far(section)) return;
      var travel = Math.max(1, section.offsetHeight - innerHeight);
      var progress = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel));
      setState(
        progress < 0.22 ? 'conventional' : progress < 0.47 ? 'engineer' : progress < 0.72 ? 'parallel' : 'arrive',
        false
      );
    };
  }

  var resolveGantt = bindCalendar(document.getElementById('gantt'));
  var resolveTime = bindCalendar(document.getElementById('time'));

  var rangeEngine = document.querySelector('#range .range-engine');
  var rangeButtons = rangeEngine ? Array.prototype.slice.call(rangeEngine.querySelectorAll('[data-range-state]')) : [];
  var rangeStatus = rangeEngine ? rangeEngine.querySelector('[data-range-status]') : null;
  var rangeStates = ['search', 'marketing', 'social', 'sales', 'service', 'operations', 'design', 'platform'];
  var rangeStatuses = {
    search: 'Show up in answers',
    marketing: 'Media you can check',
    social: 'Posts in your voice',
    sales: 'The request finishes',
    service: 'Calls answered from your records',
    operations: 'Repetitive steps, automated',
    design: 'Screens that fit',
    platform: 'One bill, and room to grow'
  };
  var rangeWasChosen = false;

  var rangeBg = (function () {
    var canvas = document.querySelector('#range .range-bg');
    if (!canvas || !canvas.getContext) return null;
    var ctx = canvas.getContext('2d');
    var SIGNAL = '255,75,36';
    var OPTIC = '141,235,242';
    var FADE = 600;
    var state = canvas.getAttribute('data-bg-state') || 'search';
    var prev = null;
    var fadeStart = 0;
    var progress = 0.5;
    var w = 0;
    var h = 0;
    var density = 1;
    var visible = false;
    var frame = 0;
    var lastDraw = 0;
    var startedAt = performance.now();

    function seeded(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
    function rgba(rgb, alpha) { return 'rgba(' + rgb + ',' + Math.max(0, alpha).toFixed(3) + ')'; }
    function dot(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

    function market(t, p, a) {
      var cx = w * 0.7, cy = h * 0.5, max = Math.hypot(w, h) * 0.55;
      var rings = Math.round(7 * density) + 2;
      ctx.lineWidth = 1;
      for (var i = 0; i < rings; i++) {
        var f = (t * 0.06 + i / rings + p * 0.25) % 1;
        ctx.strokeStyle = rgba(SIGNAL, a * (1 - f) * 0.85);
        ctx.beginPath(); ctx.arc(cx, cy, f * max, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = rgba(OPTIC, a * (1 - f) * 0.9);
        var angle = seeded(i + 7) * Math.PI * 2 + t * 0.05;
        dot(cx + Math.cos(angle) * f * max, cy + Math.sin(angle) * f * max, 1.8);
      }
    }

    function product(t, p, a) {
      var size = density < 1 ? 56 : 44;
      var cols = Math.ceil(w / size), rows = Math.ceil(h / size);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(OPTIC, a * 0.2);
      ctx.beginPath();
      for (var x = 0; x <= cols; x++) { ctx.moveTo(x * size + 0.5, 0); ctx.lineTo(x * size + 0.5, h); }
      for (var y = 0; y <= rows; y++) { ctx.moveTo(0, y * size + 0.5); ctx.lineTo(w, y * size + 0.5); }
      ctx.stroke();
      var fill = 0.06 + p * 0.16;
      for (var c = 0; c < cols; c++) {
        for (var r = 0; r < rows; r++) {
          var s = seeded(c * 97 + r * 13 + 1);
          if (s > fill) continue;
          var pulse = 0.5 + 0.5 * Math.sin(t * 0.8 + s * 40);
          var inset = 4 + (1 - pulse) * 6;
          ctx.fillStyle = rgba(SIGNAL, a * (0.14 + 0.32 * pulse));
          ctx.fillRect(c * size + inset, r * size + inset, size - inset * 2, size - inset * 2);
        }
      }
    }

    function model(t, p, a) {
      var n = Math.round(46 * density), pts = [];
      var link = Math.min(w, h) * 0.2 * (0.8 + p * 0.5);
      for (var i = 0; i < n; i++) {
        var speed = 0.5 + seeded(i * 3 + 3);
        pts.push([
          (seeded(i * 3 + 1) + 0.03 * Math.sin(t * 0.3 * speed + i)) * w,
          (seeded(i * 3 + 2) + 0.03 * Math.cos(t * 0.25 * speed + i)) * h
        ]);
      }
      ctx.lineWidth = 1;
      for (i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
          if (d >= link) continue;
          ctx.strokeStyle = rgba(OPTIC, a * 0.4 * (1 - d / link));
          ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(SIGNAL, a * 0.7);
      for (i = 0; i < n; i++) dot(pts[i][0], pts[i][1], 1.7);
    }

    function quad(x0, y0, cx, cy, x1, y1, f) {
      var g = 1 - f;
      return [g * g * x0 + 2 * g * f * cx + f * f * x1, g * g * y0 + 2 * g * f * cy + f * f * y1];
    }

    function record(t, p, a) {
      var rowH = 18, total = Math.round(10 * density) + 4;
      var filled = 3 + Math.round(p * (total - 3));
      var x0 = 24, ledgerW = Math.max(w - 48, 0);
      var top = h * 0.5 - total * rowH / 2;
      ctx.lineWidth = 1;
      for (var r = 0; r < total; r++) {
        var on = r < filled, ry = top + r * rowH;
        ctx.strokeStyle = rgba(OPTIC, a * (on ? 0.6 : 0.22));
        ctx.strokeRect(x0 + 0.5, ry + 0.5, ledgerW, rowH - 6);
        if (on) {
          ctx.fillStyle = rgba(SIGNAL, a * 0.65);
          ctx.fillRect(x0 + 4, ry + 4, 6, rowH - 14);
          ctx.fillRect(x0 + ledgerW - 10, ry + 4, 6, rowH - 14);
        }
      }
      var streams = Math.round(14 * density);
      for (var s = 0; s < streams; s++) {
        var fromTop = s % 2 === 0, rightSide = s % 4 < 2;
        var sx = rightSide ? w * (0.72 + 0.26 * seeded(s + 50)) : w * 0.28 * seeded(s + 50);
        var sy = fromTop ? 0 : h;
        var ex = rightSide ? x0 + ledgerW - 14 : x0 + 14, ey = top + (s % filled) * rowH + (rowH - 6) / 2;
        var cx = sx, cy = (sy + ey) / 2;
        ctx.strokeStyle = rgba(OPTIC, a * 0.18);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
        var head = quad(sx, sy, cx, cy, ex, ey, (t * 0.12 + seeded(s + 80)) % 1);
        ctx.fillStyle = rgba(SIGNAL, a * 0.7);
        dot(head[0], head[1], 1.8);
      }
    }

    function cubic(p0, p1, p2, p3, f) {
      var g = 1 - f;
      return g * g * g * p0 + 3 * g * g * f * p1 + 3 * g * f * f * p2 + f * f * f * p3;
    }

    function commerce(t, p, a) {
      var ex = w * 0.78, ey = h * 0.52;
      var paths = Math.round(5 * density) + 1;
      ctx.lineWidth = 1;
      for (var k = 0; k < paths; k++) {
        var sx = w * (0.05 + seeded(k + 200) * 0.25), sy = h * (0.15 + 0.7 * seeded(k + 210));
        var c1x = w * 0.4, c2x = w * 0.58;
        ctx.strokeStyle = rgba(OPTIC, a * 0.22);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(c1x, sy, c2x, ey, ex, ey); ctx.stroke();
        var f = (t * 0.1 + k / paths) % 1;
        ctx.fillStyle = rgba(SIGNAL, a * 0.75);
        dot(cubic(sx, c1x, c2x, ex, f), cubic(sy, sy, ey, ey, f), 2);
      }
      for (var i = 0; i < 3; i++) {
        var beat = (t * 0.45 + i / 3) % 1;
        ctx.strokeStyle = rgba(SIGNAL, a * (1 - beat) * 0.55);
        ctx.beginPath(); ctx.arc(ex, ey, 6 + beat * 48 * (1 + p), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.fillStyle = rgba(SIGNAL, a * 0.55);
      ctx.fillRect(ex - 5, ey - 5, 10, 10);
    }

    var motifs = {
      market: market,
      product: product,
      model: model,
      record: record,
      commerce: commerce,
      search: market,
      marketing: market,
      social: product,
      sales: commerce,
      service: model,
      operations: record,
      design: product,
      platform: model
    };

    function resize() {
      var dpr = Math.min(1.5, devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      density = innerWidth <= 1100 ? 0.5 : 1;
    }

    function render(now) {
      var t = (now - startedAt) / 1000;
      var mix = prev ? Math.min(1, (now - fadeStart) / FADE) : 1;
      ctx.clearRect(0, 0, w, h);
      if (prev && mix < 1 && motifs[prev]) motifs[prev](t, progress, 1 - mix);
      else prev = null;
      if (motifs[state]) motifs[state](t, progress, mix);
    }

    function running() { return visible && !document.hidden && !reduceMotion; }

    function loop(now) {
      if (!running()) { frame = 0; canvas.setAttribute('data-bg-running', 'false'); return; }
      frame = requestAnimationFrame(loop);
      if (now - lastDraw < 33) return;
      lastDraw = now;
      render(now);
    }

    function kick() {
      canvas.setAttribute('data-bg-running', running() ? 'true' : 'false');
      if (running() && !frame) frame = requestAnimationFrame(loop);
    }

    function redrawStill() {
      prev = null;
      render(reduceMotion ? startedAt + 12000 : performance.now());
    }

    if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); if (!running()) redrawStill(); }).observe(canvas);
    else addEventListener('resize', function () { resize(); if (!running()) redrawStill(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) { visible = entries[0].isIntersecting; kick(); }).observe(canvas);
    } else {
      visible = true;
    }
    document.addEventListener('visibilitychange', kick);
    resize();
    redrawStill();
    kick();

    return {
      setState: function (next) {
        if (next === state || !motifs[next]) return;
        prev = state;
        fadeStart = performance.now();
        state = next;
        canvas.setAttribute('data-bg-state', next);
        if (!running()) redrawStill();
      },
      setProgress: function (value) { progress = Math.min(1, Math.max(0, value)); }
    };
  })();

  function setRangeState(state, chosen) {
    if (!rangeEngine || rangeStates.indexOf(state) < 0) return;
    if (chosen) rangeWasChosen = true;
    if (rangeEngine.getAttribute('data-active-state') === state && !chosen) return;
    rangeEngine.setAttribute('data-active-state', state);
    if (rangeBg) rangeBg.setState(state);
    rangeButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', button.getAttribute('data-range-state') === state ? 'true' : 'false');
    });
    if (rangeStatus) rangeStatus.textContent = rangeStatuses[state];
  }

  rangeButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      setRangeState(button.getAttribute('data-range-state'), true);
    });
  });

  function resolveRangeFromScroll() {
    if (!rangeEngine || reduceMotion || rangeWasChosen || innerWidth <= 1100) return;
    var act = document.getElementById('range');
    if (far(act)) return;
    var travel = Math.max(1, act.offsetHeight - innerHeight);
    var progress = Math.min(1, Math.max(0, -act.getBoundingClientRect().top / travel));
    var cuts = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.86, 1];
    var index = 0;
    while (index < 7 && progress >= cuts[index]) index++;
    var from = index ? cuts[index - 1] : 0;
    if (rangeBg) rangeBg.setProgress((progress - from) / (cuts[index] - from));
    setRangeState(rangeStates[index], false);
  }

  function updateScrollStates() {
    resolveCompilerFromScroll();
    resolveGantt();
    resolveTime();
    resolveRangeFromScroll();
  }

  updateScrollStates();
  addEventListener('scroll', updateScrollStates, { passive: true });
  addEventListener('resize', updateScrollStates);
})();
