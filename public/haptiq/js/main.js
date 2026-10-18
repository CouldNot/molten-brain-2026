/* Haptiq — landing page interactions */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const root = document.documentElement;

  /* ---------- 3D stat visuals ---------- */
  // 7 people standing on a tilted floor, one highlighted
  const personSvg = '<svg viewBox="0 0 24 46" aria-hidden="true"><circle cx="12" cy="7" r="6.5" fill="currentColor"/><path d="M1 46 V25 a11 11 0 0 1 22 0 V46 Z" fill="currentColor"/></svg>';
  const floor = $('[data-people]');
  if (floor) {
    floor.innerHTML = Array.from({ length: 7 }, (_, i) =>
      '<div class="p3' + (i === 6 ? ' hi' : '') + '"><span class="sh"></span><span class="fig">' + personSvg + '</span></div>').join('');
  }

  // isometric 3D bars, tallest highlighted
  const bars = $('[data-bars3d]');
  if (bars) {
    bars.innerHTML = [118, 86, 70, 56, 44, 34].map((h, i) =>
      '<div class="col' + (i === 0 ? ' hi' : '') + '" style="--h:' + h + 'px;transition-delay:' + (0.2 + i * 0.08).toFixed(2) + 's"><i class="f"></i><i class="r"></i><i class="t"></i></div>').join('');
  }

  // three identical 3D knobs, needles moving in sync
  const dials = $('[data-dials]');
  if (dials) {
    const layers = Array.from({ length: 7 }, (_, k) => '<span class="k3-l" style="transform:translateZ(' + (k * 2) + 'px)"></span>').join('');
    dials.innerHTML = Array.from({ length: 3 }, () =>
      '<div class="k3"><span class="k3-base"></span>' + layers + '<span class="k3-top"><span class="k3-needle"></span></span></div>').join('');
  }

  /* ---------- loop diagram ---------- */
  const STEPS = [
    { t: 'Track', l: 'A daily check-in, a short eye-tracking task, and a voice note.' },
    { t: 'Detect', l: 'Finds the patterns in your data around each attack.' },
    { t: 'Stimulate', l: 'An attack starts a session on the neck-worn wearable.' },
    { t: 'Measure', l: 'A pain check at 2 hours shows what helped.' },
    { t: 'Adjust', l: 'Settings shift toward what worked, inside hard safety limits.' }
  ];
  const lsegs = $('[data-lsegs]');
  if (lsegs) lsegs.innerHTML = STEPS.map(s => '<div class="lseg"><span></span>' + s.t + '</div>').join('');
  const dia = $('.dia');
  const nodes = $$('[data-node]');
  const core = $('[data-core]');
  const profileEl = $('[data-profile]');
  let profile = 1240;
  let loopIdx = -1;
  let loopPinned = false;

  // a small dot flies from the active node into "Your profile"
  function feed(i) {
    if (!dia || !nodes[i] || window.Haptiq.reduceMotion || !dia.animate) return;
    const d = document.createElement('span');
    d.className = 'feed';
    d.style.left = nodes[i].style.left;
    d.style.top = nodes[i].style.top;
    dia.appendChild(d);
    const a = d.animate([
      { left: nodes[i].style.left, top: nodes[i].style.top, opacity: 1, transform: 'scale(1)' },
      { left: '50%', top: '50%', opacity: 0, transform: 'scale(.4)' }
    ], { duration: 1100, easing: 'cubic-bezier(.16,.84,.3,1)' });
    a.onfinish = () => {
      d.remove();
      profile += 6 + Math.floor(Math.random() * 30);
      if (profileEl) profileEl.textContent = profile.toLocaleString();
      if (core) { core.classList.add('bump'); setTimeout(() => core.classList.remove('bump'), 500); }
    };
  }

  function setLoop(i) {
    if (i === loopIdx) return;
    loopIdx = i;
    nodes.forEach((n, k) => n.classList.toggle('on', k === i));
    $$('.lseg').forEach((n, k) => n.classList.toggle('on', k <= i));
    $$('[data-loop-num]').forEach(n => { n.textContent = '0' + (i + 1); });
    $$('[data-loop-name]').forEach(n => { n.textContent = STEPS[i].t; });
    $$('[data-loop-line]').forEach(n => { n.textContent = STEPS[i].l; });
    feed(i);
  }
  setLoop(0);
  // advance in step with the orbiting dot (14 s per lap / 5 nodes) unless scroll is driving it
  setInterval(() => { if (!loopPinned) setLoop((loopIdx + 1) % 5); }, 2800);

  /* ---------- devices ---------- */
  const DEVICES = [
    {
      name: 'Pupil Labs Neon', role: 'Eye tracking',
      line: 'Eye-tracking glasses for the daily task. Cameras near the nose watch both eyes.',
      specs: [['Gaze', 'Where you look'], ['Pupil size', 'Each eye'], ['Blinks', 'Rate per minute'], ['Head movement', 'Built-in motion sensor']]
    },
    {
      name: 'DataFeel Gen 10 DevKit', role: 'Haptic wearable',
      line: 'Four small haptic disks and a controller. We mount the disks at the back of the neck.',
      specs: [['Vibration', 'Tuned per person'], ['Heat and cold', 'Being tested'], ['Light', 'Status cue'], ['Safety limits', 'Hard caps']]
    },
    {
      name: 'Apple Vision Pro', role: 'Brain view · optional',
      line: 'Shows the targeted nerve pathway in 3D and your progress over time. An illustration, not a scan.',
      specs: [['3D brain', 'Target pathway'], ['Progress', 'Month by month'], ['Optional', 'Phone works too'], ['Illustration', 'Not a brain scan']]
    }
  ];
  const tabs = $$('.dtab');
  const devBody = $('[data-dev-body]');
  const devSpecs = $('[data-dev-specs]');
  let devIdx = 0;
  let devAuto = true;
  let devTimer = null;

  function paintDevice(i) {
    const d = DEVICES[i];
    $('[data-dev-role]').textContent = d.role;
    $('[data-dev-name]').textContent = d.name;
    $('[data-dev-line]').textContent = d.line;
    devSpecs.innerHTML = d.specs.map(s => '<div><strong>' + s[0] + '</strong>' + s[1] + '</div>').join('');
  }
  function selectDevice(i, user) {
    if (user) { devAuto = false; tabs.forEach(t => t.classList.remove('auto')); }
    devIdx = i;
    tabs.forEach((t, k) => {
      t.setAttribute('aria-selected', k === i ? 'true' : 'false');
      t.classList.remove('auto');
      if (k === i && devAuto) { void t.offsetWidth; t.classList.add('auto'); }
    });
    [devBody, devSpecs].forEach(el => el && el.classList.add('out'));
    setTimeout(() => { paintDevice(i); [devBody, devSpecs].forEach(el => el && el.classList.remove('out')); }, 250);
    (window.Haptiq3D = window.Haptiq3D || {}).devIndex = i;
  }
  if (tabs.length) {
    paintDevice(0);
    tabs.forEach((t, k) => t.addEventListener('click', () => selectDevice(k, true)));
    selectDevice(0, false);
    devTimer = setInterval(() => { if (devAuto) selectDevice((devIdx + 1) % DEVICES.length, false); }, 7000);
  }

  /* ---------- scroll-driven effects ---------- */
  const nav = $('#nav');
  const loopEl = $('[data-loop]');
  const layers = $$('[data-layer]');
  const blocks = $$('[data-pb]');
  const tl = $('[data-tl]');
  const stops = $$('[data-stop]');
  const dev = $('[data-par-dev]');
  let phoneIdx = 0;
  let ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; measure(); });
  }

  function measure() {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const y = window.scrollY;

    nav && nav.classList.toggle('small', y > 40);
    root.style.setProperty('--py', Math.min(140, y * 0.15).toFixed(1) + 'px');

    if (dev) {
      const r = dev.getBoundingClientRect();
      const d = r.top + r.height / 2 - vh / 2;
      root.style.setProperty('--dy', Math.max(-40, Math.min(40, -d * 0.06)).toFixed(1) + 'px');
    }

    if (loopEl) {
      const r = loopEl.getBoundingClientRect();
      const span = r.height - vh;
      if (span > vh * 0.5 && r.top <= 0 && r.bottom >= vh) {
        loopPinned = true;
        setLoop(Math.min(4, Math.max(0, Math.floor((-r.top / span) * 5))));
      } else {
        loopPinned = false;
      }
    }

    if (blocks.length) {
      let idx = 0;
      blocks.forEach((b, i) => { if (b.getBoundingClientRect().top < vh * 0.5) idx = i; });
      if (idx !== phoneIdx) {
        phoneIdx = idx;
        layers.forEach((l, i) => l.classList.toggle('on', i === idx));
        blocks.forEach((b, i) => b.classList.toggle('on', i === idx));
      }
    }

    if (tl) {
      const r = tl.getBoundingClientRect();
      const mobile = vw <= 900;
      let p = mobile ? (vh * 0.65 - r.top) / r.height : (vh * 0.85 - r.top) / (vh * 0.5);
      p = Math.max(0, Math.min(1, p));
      root.style.setProperty('--tl', p.toFixed(3));
      const lit = p <= 0.001 ? -1 : Math.min(3, mobile ? Math.floor(p * 4) : Math.floor((p + 0.02) * 3));
      stops.forEach((s, i) => s.classList.toggle('on', i <= lit));
    }
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  measure();

  /* ---------- simulation ----------
     A made-up "sample person" whose best response is near 115 Hz / 55% intensity.
     This is a demo model, not clinical data. */
  const fIn = $('#simFreq'), iIn = $('#simInt'), lIn = $('#simLen');
  if (!fIn) return;
  const out = { f: $('#freqOut'), i: $('#intOut'), l: $('#lenOut') };
  const el = {
    ghost: $('#simGhost'), area: $('#simArea'), path: $('#simPath'), tip: $('#simTip'), tipGlow: $('#simTipGlow'),
    empty: $('#simEmpty'), k2: $('#roK2'), p2: $('#roP2'), chg: $('#roChg'), t: $('#roT'),
    btn: $('#runBtn'), label: $('#runLabel'), count: $('#runCount'), hist: $('#hist'),
    bestGrid: $('#bestGrid'), bestEmpty: $('#bestEmpty'), bF: $('#bF'), bI: $('#bI'), bL: $('#bL'), bN: $('#bN'), bP: $('#bP')
  };
  const X = t => 48 + (t / 120) * 560;
  const Y = v => 20 + (10 - v) * 24;
  const runs = [];
  let lastCurve = null;
  let running = false;

  function syncSliders() {
    out.f.textContent = fIn.value + ' Hz';
    out.i.textContent = iIn.value + '%';
    out.l.textContent = lIn.value + ' min';
    [fIn, iIn, lIn].forEach(inp => {
      const pct = ((inp.value - inp.min) / (inp.max - inp.min)) * 100;
      inp.style.setProperty('--v', pct.toFixed(1) + '%');
    });
  }
  [fIn, iIn, lIn].forEach(inp => inp.addEventListener('input', syncSliders));
  syncSliders();

  function curve(f, i, L, seed) {
    const g = (x, m, w) => Math.exp(-Math.pow((x - m) / w, 2));
    const noise = Math.abs((Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.06 - 0.03;
    const eff = Math.max(0, 0.74 * g(f, 115, 70) * g(i, 55, 26) * (1 - Math.exp(-L / 9)) + noise);
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const t = k * 2;
      const v = 7 - 7 * eff * (1 - Math.exp(-t / 30)) - 0.6 * (t / 120);
      pts.push([t, Math.max(0, Math.min(10, v))]);
    }
    return pts;
  }
  const pathOf = (pts, n) => pts.slice(0, n + 1).map((p, k) => (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');

  function draw(pts, n) {
    const tip = pts[n];
    const d = pathOf(pts, n);
    el.path.setAttribute('d', d);
    el.area.setAttribute('d', d + ' L' + X(tip[0]).toFixed(1) + ' 260 L48 260 Z');
    [el.tip, el.tipGlow].forEach(c => { c.setAttribute('cx', X(tip[0]).toFixed(1)); c.setAttribute('cy', Y(tip[1]).toFixed(1)); });
    el.p2.textContent = tip[1].toFixed(1);
    el.chg.textContent = '−' + Math.max(0, 7 - tip[1]).toFixed(1);
    el.t.textContent = tip[0] + ' min';
  }

  function updateBest() {
    const best = runs.reduce((b, r) => (!b || r.p2 < b.p2 ? r : b), null);
    el.count.textContent = runs.length === 1 ? '1 run' : runs.length + ' runs';
    if (!best) return;
    el.bestGrid.hidden = false;
    el.bestEmpty.hidden = true;
    el.bF.textContent = best.f + ' Hz';
    el.bI.textContent = best.i + '%';
    el.bL.textContent = best.L + ' min';
    el.bN.textContent = 'Run ' + best.n;
    el.bP.textContent = best.p2.toFixed(1);
    el.hist.innerHTML = runs.slice(-14).map(r => {
      const h = Math.max(6, Math.round(((7 - r.p2) / 7) * 100));
      return '<span class="hb' + (r.n === best.n ? ' best' : '') + '" style="height:' + h + '%"></span>';
    }).join('');
  }

  el.btn.addEventListener('click', () => {
    if (running) return;
    running = true;
    el.btn.disabled = true;
    el.label.textContent = 'Running…';
    el.k2.textContent = 'Pain now';
    el.empty.hidden = true;
    const f = +fIn.value, i = +iIn.value, L = +lIn.value;
    const pts = curve(f, i, L, runs.length + 1);
    if (lastCurve) { el.ghost.setAttribute('d', pathOf(lastCurve, 60)); el.ghost.setAttribute('opacity', '.8'); }
    [el.path, el.area, el.tip, el.tipGlow].forEach(n => n.setAttribute('opacity', '1'));
    const t0 = performance.now();
    const dur = window.Haptiq.reduceMotion ? 1 : 2000;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      draw(pts, Math.max(1, Math.round(k * 60)));
      if (k < 1) { requestAnimationFrame(step); return; }
      runs.push({ n: runs.length + 1, f, i, L, p2: pts[60][1] });
      lastCurve = pts;
      running = false;
      el.btn.disabled = false;
      el.label.textContent = 'Run again';
      el.k2.textContent = 'Pain at 2 h';
      updateBest();
    };
    requestAnimationFrame(step);
  });
})();
