/* =========================================================
   Haptiq — 3D scenes (Three.js r128)
   Any element with data-gl="neckband | brain | devices" gets a live
   3D canvas. If WebGL isn't available, its .gl-fallback child stays visible.
   Models are stylized illustrations, not CAD files.
   ========================================================= */
(function () {
  'use strict';
  if (!window.THREE) return;
  const T = window.THREE;
  const C = { navy: 0x192136, navy2: 0x1F2840, slate: 0x3B465E, muted: 0x7B7C90, taupe: 0xAE9E91, cream: 0xE8D7BC };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.Haptiq3D = window.Haptiq3D || {};

  function hasGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  /* ---------- helpers ---------- */
  const mat = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, metalness: 0.35, roughness: 0.4 }, o || {}));
  const basic = (color, o) => new T.MeshBasicMaterial(Object.assign({ color }, o || {}));

  let GLOW = null;
  function glowTex() {
    if (GLOW) return GLOW;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,.5)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    GLOW = new T.CanvasTexture(c);
    return GLOW;
  }
  function glow(color, size, opacity) {
    const s = new T.Sprite(new T.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: opacity == null ? 1 : opacity, blending: T.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }
  function rbox(w, h, d, r) {
    const b = Math.min(r * 0.5, d * 0.3);
    const W = w - 2 * b, H = h - 2 * b, R = Math.max(0.001, Math.min(r - b, W / 2, H / 2));
    const s = new T.Shape();
    const x = -W / 2, y = -H / 2;
    s.moveTo(x + R, y);
    s.lineTo(x + W - R, y); s.quadraticCurveTo(x + W, y, x + W, y + R);
    s.lineTo(x + W, y + H - R); s.quadraticCurveTo(x + W, y + H, x + W - R, y + H);
    s.lineTo(x + R, y + H); s.quadraticCurveTo(x, y + H, x, y + H - R);
    s.lineTo(x, y + R); s.quadraticCurveTo(x, y, x + R, y);
    const g = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 5, curveSegments: 10 });
    g.center();
    return g;
  }

  /* ---------- a canvas + camera + lights + render loop ---------- */
  function stage(el, opts) {
    const o = Object.assign({ fov: 32, z: 5, y: 0, lookY: 0 }, opts || {});
    const renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(o.fov, 1, 0.1, 100);
    camera.position.set(0, o.y, o.z);
    camera.lookAt(0, o.lookY, 0);

    scene.add(new T.HemisphereLight(C.cream, C.navy, 0.65));
    const key = new T.DirectionalLight(C.cream, 1.1); key.position.set(3, 5, 4); scene.add(key);
    const rim = new T.PointLight(C.taupe, 1.6, 20); rim.position.set(-4, 1.5, -3); scene.add(rim);
    const rim2 = new T.PointLight(C.cream, 0.8, 20); rim2.position.set(4, -1, -2); scene.add(rim2);
    const fill = new T.PointLight(C.cream, 0.5, 20); fill.position.set(0, -3, 4); scene.add(fill);

    function size() {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(el); else window.addEventListener('resize', size);

    let visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(e => { visible = e[0].isIntersecting; }).observe(el);

    // pointer: hover parallax + drag to rotate
    const m = { x: 0, y: 0, dragX: 0 };
    let dragging = false, lastX = 0;
    const cv = renderer.domElement;
    cv.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect();
      m.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      m.y = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (dragging) { m.dragX += (e.clientX - lastX) * 0.008; lastX = e.clientX; }
    });
    cv.addEventListener('pointerdown', e => { dragging = true; lastX = e.clientX; });
    window.addEventListener('pointerup', () => { dragging = false; });
    cv.addEventListener('pointerleave', () => { m.x = 0; m.y = 0; });

    const ticks = [];
    const clock = new T.Clock();
    const sm = { x: 0, y: 0, dragX: 0 }; // smoothed pointer
    (function loop() {
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      if (!visible) return;
      const t = reduce ? 0 : clock.elapsedTime;
      sm.x += (m.x - sm.x) * 0.06; sm.y += (m.y - sm.y) * 0.06; sm.dragX += (m.dragX - sm.dragX) * 0.12;
      ticks.forEach(f => f(t, sm, dt));
      renderer.render(scene, camera);
    })();

    return { scene, camera, renderer, onTick: f => ticks.push(f) };
  }

  /* =========================================================
     MODELS
     ========================================================= */

  /* Neck-worn wearable with four haptic disks at the nape */
  function neckband() {
    const g = new T.Group();
    const pts = [[-0.95, 0, 0.8], [-1.28, 0, 0.15], [-1.05, 0, -0.62], [-0.45, 0, -1.05], [0, 0, -1.12], [0.45, 0, -1.05], [1.05, 0, -0.62], [1.28, 0, 0.15], [0.95, 0, 0.8]].map(p => new T.Vector3(p[0], p[1], p[2]));
    const curve = new T.CatmullRomCurve3(pts);

    const band = new T.Mesh(new T.TubeGeometry(curve, 180, 0.17, 32, false), mat(C.slate, { metalness: 0.6, roughness: 0.28 }));
    band.scale.y = 1.25;
    g.add(band);

    // thin accent line around the outside
    const stripePts = curve.getPoints(90).map(p => {
      const n = new T.Vector3(p.x, 0, p.z).normalize();
      return p.clone().addScaledVector(n, 0.168).setY(0.02);
    });
    g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(stripePts), 160, 0.012, 8, false), basic(C.taupe, { transparent: true, opacity: 0.75 })));

    // end pods with status lights
    const leds = [];
    [0, 1].forEach(t => {
      const p = curve.getPointAt(t);
      const dir = curve.getTangentAt(t);
      if (t === 0) dir.negate();
      const pod = new T.Mesh(new T.SphereGeometry(0.3, 40, 32), mat(C.navy2, { metalness: 0.7, roughness: 0.25 }));
      pod.scale.set(0.95, 0.85, 1.5);
      pod.position.copy(p).addScaledVector(dir, 0.12);
      pod.lookAt(pod.position.clone().add(dir));
      g.add(pod);
      const led = new T.Mesh(new T.SphereGeometry(0.035, 16, 16), basic(C.cream));
      led.position.copy(pod.position).add(new T.Vector3(0, 0.24, 0)).addScaledVector(dir, 0.15);
      g.add(led);
      const lg = glow(C.cream, 0.45, 0.8);
      lg.position.copy(led.position);
      g.add(lg);
      leds.push(lg);
    });

    // four haptic disks on the inside of the band, at the nape
    const dots = [0.38, 0.46, 0.54, 0.62].map(t => {
      const p = curve.getPointAt(t);
      const n = new T.Vector3(-p.x, 0, -p.z).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), n);
      const disc = new T.Mesh(new T.CylinderGeometry(0.14, 0.14, 0.05, 40), mat(C.muted, { metalness: 0.5, roughness: 0.3 }));
      disc.quaternion.copy(q);
      disc.position.copy(p).addScaledVector(n, 0.17);
      g.add(disc);
      const ring = new T.Mesh(new T.TorusGeometry(0.1, 0.014, 10, 40), basic(C.cream, { transparent: true }));
      ring.quaternion.copy(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), n));
      ring.position.copy(p).addScaledVector(n, 0.2);
      g.add(ring);
      const gl = glow(C.cream, 0.55, 0.6);
      gl.position.copy(ring.position);
      g.add(gl);
      return { ring, gl };
    });

    // soft rings radiating out
    const rings = [0, 1, 2].map(() => {
      const r = new T.Mesh(new T.RingGeometry(1.0, 1.012, 128), basic(C.taupe, { transparent: true, opacity: 0, side: T.DoubleSide, depthWrite: false }));
      r.rotation.x = -Math.PI / 2;
      r.position.set(0, 0, -0.15);
      g.add(r);
      return r;
    });

    return {
      group: g,
      tick(t, m) {
        g.rotation.y = Math.sin(t * 0.25) * 0.55 + m.x * 0.35 + m.dragX;
        g.rotation.x = 0.42 + m.y * 0.12;
        g.position.y = Math.sin(t * 0.7) * 0.06;
        dots.forEach((d, i) => {
          const k = 0.5 + 0.5 * Math.sin(t * 3 - i * 0.9);
          d.ring.material.opacity = 0.35 + 0.65 * k;
          d.gl.material.opacity = 0.2 + 0.6 * k;
        });
        rings.forEach((r, i) => {
          const s = (t * 0.22 + i / 3) % 1;
          r.scale.setScalar(1.1 + s * 1.4);
          r.material.opacity = (1 - s) * 0.45 * Math.min(1, s * 5);
        });
        leds.forEach((l, i) => { l.material.opacity = 0.5 + 0.4 * Math.sin(t * 2 + i); });
      }
    };
  }

  /* Eye-tracking glasses (stylized, in the spirit of Pupil Labs Neon) */
  function neonGlasses() {
    const g = new T.Group();
    const frameM = mat(C.navy2, { metalness: 0.25, roughness: 0.55 });
    const accent = mat(C.slate, { metalness: 0.5, roughness: 0.35 });
    const eyeCams = [];
    [-1, 1].forEach(s => {
      const rim = new T.Mesh(new T.TorusGeometry(0.52, 0.065, 18, 64), frameM);
      rim.scale.set(1.08, 0.82, 1);
      rim.position.set(s * 0.66, 0, 0);
      g.add(rim);
      const lens = new T.Mesh(new T.CircleGeometry(0.52, 48), new T.MeshStandardMaterial({ color: C.cream, transparent: true, opacity: 0.1, metalness: 0.9, roughness: 0.05, side: T.DoubleSide }));
      lens.scale.copy(rim.scale);
      lens.position.copy(rim.position);
      g.add(lens);
      const temple = new T.Mesh(new T.BoxGeometry(0.07, 0.1, 2.0), frameM);
      temple.position.set(s * 1.22, 0.12, -1.0);
      g.add(temple);
      const tip = new T.Mesh(new T.BoxGeometry(0.07, 0.1, 0.5), frameM);
      tip.position.set(s * 1.22, -0.06, -2.1);
      tip.rotation.x = -0.6;
      g.add(tip);
      const hinge = new T.Mesh(new T.BoxGeometry(0.16, 0.14, 0.14), accent);
      hinge.position.set(s * 1.18, 0.12, 0);
      g.add(hinge);
      // eye cameras sit low, near the nose
      const cam = new T.Mesh(new T.CylinderGeometry(0.035, 0.035, 0.05, 20), basic(C.taupe));
      cam.rotation.x = Math.PI / 2;
      cam.position.set(s * 0.17, -0.2, -0.08);
      g.add(cam);
      const cg = glow(C.taupe, 0.28, 0.7);
      cg.position.copy(cam.position);
      g.add(cg);
      eyeCams.push(cg);
    });
    // center module with the forward camera
    const mod = new T.Mesh(rbox(0.44, 0.3, 0.26, 0.09), accent);
    mod.position.set(0, 0.06, 0.02);
    g.add(mod);
    const lensF = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 0.04, 24), mat(C.navy, { metalness: 0.9, roughness: 0.1 }));
    lensF.rotation.x = Math.PI / 2;
    lensF.position.set(0, 0.1, 0.17);
    g.add(lensF);
    const sRing = new T.Mesh(new T.TorusGeometry(0.075, 0.012, 10, 32), basic(C.cream));
    sRing.position.set(0, 0.1, 0.19);
    g.add(sRing);

    // gaze rays to a moving target
    const target = glow(C.cream, 0.4, 1);
    const core = new T.Mesh(new T.SphereGeometry(0.045, 16, 16), basic(C.cream));
    g.add(target, core);
    const lg = new T.BufferGeometry();
    lg.setAttribute('position', new T.BufferAttribute(new Float32Array(12), 3));
    const lines = new T.LineSegments(lg, new T.LineBasicMaterial({ color: C.taupe, transparent: true, opacity: 0.55 }));
    g.add(lines);

    return {
      group: g,
      tick(t, m) {
        g.rotation.y = -0.55 + Math.sin(t * 0.25) * 0.35 + m.x * 0.3 + m.dragX;
        g.rotation.x = 0.12 + m.y * 0.1;
        const tx = Math.sin(t * 0.7) * 1.1, ty = Math.cos(t * 0.9) * 0.45 + 0.05, tz = 2.4;
        target.position.set(tx, ty, tz);
        core.position.set(tx, ty, tz);
        const a = lg.attributes.position.array;
        a.set([-0.66, 0, -0.25, tx, ty, tz, 0.66, 0, -0.25, tx, ty, tz]);
        lg.attributes.position.needsUpdate = true;
        eyeCams.forEach((c, i) => { c.material.opacity = 0.45 + 0.35 * Math.sin(t * 4 + i); });
      }
    };
  }

  /* Haptic dev kit: four disks + a wearable controller (stylized, DataFeel Gen 10 style) */
  function hapticKit() {
    const g = new T.Group();
    const ctrl = new T.Mesh(rbox(1.0, 0.56, 0.26, 0.12), mat(C.slate, { metalness: 0.55, roughness: 0.3 }));
    ctrl.position.set(0, -0.8, 0);
    g.add(ctrl);
    const statusLeds = [-0.2, 0, 0.2].map(x => {
      const l = new T.Mesh(new T.SphereGeometry(0.025, 12, 12), basic(C.cream, { transparent: true }));
      l.position.set(x, -0.8, 0.15);
      g.add(l);
      return l;
    });
    const spots = [[-1.65, 0.3, -0.3], [-0.58, 0.82, 0], [0.58, 0.82, 0], [1.65, 0.3, -0.3]];
    const dots = spots.map((p, i) => {
      const d = new T.Group();
      d.position.set(p[0], p[1], p[2]);
      const bodyG = new T.CylinderGeometry(0.42, 0.42, 0.09, 64); bodyG.rotateX(Math.PI / 2);
      const body = new T.Mesh(bodyG, mat(C.navy2, { metalness: 0.45, roughness: 0.3 }));
      d.add(body);
      const faceG = new T.CylinderGeometry(0.36, 0.36, 0.02, 64); faceG.rotateX(Math.PI / 2);
      const face = new T.Mesh(faceG, mat(C.slate, { metalness: 0.3, roughness: 0.45 }));
      face.position.z = 0.05;
      d.add(face);
      const ring = new T.Mesh(new T.TorusGeometry(0.39, 0.022, 10, 64), basic(i % 2 ? C.taupe : C.cream, { transparent: true }));
      ring.position.z = 0.05;
      d.add(ring);
      const actG = new T.CylinderGeometry(0.14, 0.14, 0.03, 32); actG.rotateX(Math.PI / 2);
      const act = new T.Mesh(actG, mat(C.taupe, { metalness: 0.6, roughness: 0.3 }));
      act.position.z = 0.065;
      d.add(act);
      const gl = glow(i % 2 ? C.taupe : C.cream, 1.4, 0.4);
      gl.position.z = 0.12;
      d.add(gl);
      d.lookAt(0, 0.2, 5);
      g.add(d);
      // cable from controller to disk
      const start = new T.Vector3(p[0] * 0.25, -0.55, 0);
      const end = new T.Vector3(p[0], p[1], p[2] - 0.05);
      const mid = new T.Vector3((start.x + end.x) / 2, (start.y + end.y) / 2 - 0.35, -0.25);
      g.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3([start, mid, end]), 40, 0.022, 8, false), mat(C.muted, { roughness: 0.7 })));
      return { d, ring, gl, body };
    });
    return {
      group: g,
      tick(t, m) {
        g.rotation.y = Math.sin(t * 0.25) * 0.35 + m.x * 0.3 + m.dragX;
        g.rotation.x = -0.08 + m.y * 0.1;
        dots.forEach((o, i) => {
          const k = 0.5 + 0.5 * Math.sin(t * 2.4 - i * 1.1);
          o.ring.material.opacity = 0.35 + 0.65 * k;
          o.gl.material.opacity = 0.12 + 0.5 * k;
          o.body.position.x = reduce ? 0 : Math.sin(t * 70 + i) * 0.006 * k; // vibration
        });
        statusLeds.forEach((l, i) => { l.material.opacity = 0.4 + 0.6 * (Math.sin(t * 3 + i * 1.3) > 0 ? 1 : 0.3); });
      }
    };
  }

  /* Point-cloud brain with a glowing pathway (illustration, not a scan) */
  function brain() {
    const g = new T.Group();
    const pos = [], col = [];
    const cM = new T.Color(C.muted), cT = new T.Color(C.taupe);
    const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c.r, c.g, c.b); };
    for (let i = 0; i < 2800; i++) {
      const side = i % 2 ? 1 : -1;
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const dx = Math.abs(s * Math.cos(th)) * side, dy = u, dz = s * Math.sin(th);
      const fold = 1 + 0.07 * Math.sin(9 * th) * Math.sin(21 * u);
      const r = (0.88 + 0.12 * Math.random()) * fold;
      let y = dy * 0.95 * r;
      if (y < -0.5) y = -0.5 + (y + 0.5) * 0.3;
      push(dx * 0.62 * r + side * 0.04, y, dz * 1.35 * r, Math.random() < 0.12 ? cT : cM);
    }
    for (let i = 0; i < 450; i++) { // cerebellum
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u), r = 0.85 + 0.15 * Math.random();
      push(s * Math.cos(th) * 0.55 * r, -0.62 + u * 0.3 * r, -0.85 + s * Math.sin(th) * 0.4 * r, cM);
    }
    for (let i = 0; i < 220; i++) { // brainstem
      const k = Math.random(), a = Math.random() * Math.PI * 2, r = 0.16 * Math.sqrt(Math.random());
      push(Math.cos(a) * r, -0.55 - k * 1.0, -0.35 - k * 0.25 + Math.sin(a) * r, cM);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.add(new T.Points(geo, new T.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })));

    const path = new T.CatmullRomCurve3([[0, -2.1, -1.0], [0, -1.5, -0.62], [0, -0.9, -0.45], [0.12, -0.35, -0.1], [0.3, 0.05, 0.55], [0.42, 0.25, 1.15]].map(p => new T.Vector3(p[0], p[1], p[2])));
    g.add(new T.Mesh(new T.TubeGeometry(path, 120, 0.075, 12, false), basic(C.taupe, { transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false })));
    g.add(new T.Mesh(new T.TubeGeometry(path, 120, 0.022, 8, false), basic(C.cream)));
    const site = glow(C.cream, 0.8, 0.9);
    site.position.copy(path.getPointAt(0));
    g.add(site);
    const siteCore = new T.Mesh(new T.SphereGeometry(0.07, 16, 16), basic(C.cream));
    siteCore.position.copy(site.position);
    g.add(siteCore);
    const pulse = glow(C.cream, 0.6, 1);
    g.add(pulse);
    return {
      group: g,
      tick(t) {
        pulse.position.copy(path.getPointAt((t * 0.3) % 1));
        site.material.opacity = 0.55 + 0.4 * Math.sin(t * 2.5);
      }
    };
  }

  /* Headset (stylized, in the spirit of Apple Vision Pro) with a floating brain view */
  function headset() {
    const g = new T.Group();
    g.add(new T.Mesh(rbox(2.1, 0.95, 0.55, 0.38), mat(C.muted, { metalness: 0.75, roughness: 0.28 })));
    const visor = new T.Mesh(new T.SphereGeometry(1, 96, 48), mat(C.navy2, { metalness: 0.45, roughness: 0.12 }));
    visor.scale.set(1.02, 0.44, 0.34);
    visor.position.z = 0.1;
    g.add(visor);
    const streak = new T.Mesh(new T.TorusGeometry(0.85, 0.008, 6, 96, 1.6), basic(C.cream, { transparent: true, opacity: 0.35 }));
    streak.scale.set(1, 0.42, 1);
    streak.rotation.z = Math.PI / 2 - 0.8;
    streak.position.set(0, 0.04, 0.42);
    g.add(streak);
    const seal = new T.Mesh(rbox(1.9, 0.78, 0.3, 0.3), mat(C.slate, { metalness: 0.05, roughness: 0.95 }));
    seal.position.z = -0.38;
    g.add(seal);
    const band = new T.Mesh(new T.TorusGeometry(1.08, 0.1, 16, 80, Math.PI), mat(C.taupe, { metalness: 0.05, roughness: 0.9 }));
    band.rotation.x = -Math.PI / 2;
    band.position.z = -0.45;
    band.scale.set(1, 1.25, 1);
    g.add(band);
    const crownG = new T.CylinderGeometry(0.07, 0.07, 0.06, 24);
    const crown = new T.Mesh(crownG, mat(C.cream, { metalness: 0.8, roughness: 0.2 }));
    crown.position.set(0.82, 0.5, 0.02);
    g.add(crown);

    const holo = brain();
    holo.group.scale.setScalar(0.34);
    holo.group.position.set(0, 1.25, 0.2);
    g.add(holo.group);
    const holoGlow = glow(C.cream, 1.6, 0.18);
    holoGlow.position.copy(holo.group.position);
    g.add(holoGlow);

    return {
      group: g,
      tick(t, m) {
        g.rotation.y = -0.35 + Math.sin(t * 0.25) * 0.5 + m.x * 0.35 + m.dragX;
        g.rotation.x = 0.12 + m.y * 0.1;
        holo.group.rotation.y = t * 0.5;
        holo.group.position.y = 1.25 + Math.sin(t * 0.9) * 0.05;
        holo.tick(t);
        streak.material.opacity = 0.25 + 0.15 * Math.sin(t * 0.8);
      }
    };
  }

  /* =========================================================
     MOUNTS
     ========================================================= */
  const builders = {
    neckband(el) {
      const s = stage(el, { z: 6.4, y: 1.5, lookY: -0.15 });
      const m = neckband();
      s.scene.add(m.group);
      s.onTick(m.tick);
    },
    brain(el) {
      const s = stage(el, { z: 5.6, y: 0.3, fov: 30 });
      const b = brain();
      b.group.position.y = 0.3;
      s.scene.add(b.group);
      s.onTick((t, m) => {
        b.group.rotation.y = -1.25 + Math.sin(t * 0.2) * 0.45 + m.x * 0.4 + m.dragX;
        b.group.rotation.x = 0.08 + m.y * 0.08;
        b.tick(t);
      });
    },
    devices(el) {
      const s = stage(el, { z: 6.2, y: 0.6, lookY: 0.15, fov: 32 });
      const items = [neonGlasses(), hapticKit(), headset()].map(it => {
        const holder = new T.Group();
        holder.add(it.group);
        s.scene.add(holder);
        return { it, holder, vis: 0 };
      });
      // the selected device lives in Haptiq3D.devIndex (set by main.js), so clicks before mount still apply
      const H = window.Haptiq3D;
      items[H.devIndex || 0].vis = 1;
      s.onTick((t, m, dt) => {
        const sel = H.devIndex || 0;
        items.forEach((o, i) => {
          const target = i === sel ? 1 : 0;
          o.vis += (target - o.vis) * Math.min(1, dt * 7);
          if (Math.abs(target - o.vis) < 0.02) o.vis = target;
          const e = o.vis * o.vis * (3 - 2 * o.vis);
          o.holder.visible = e > 0.03;
          o.holder.scale.setScalar(0.35 + 0.65 * e);
          o.holder.position.y = (1 - e) * -0.4;
          o.holder.rotation.y = (1 - e) * (i < sel ? -1 : 1) * 0.8;
          if (o.holder.visible) o.it.tick(t, m);
        });
      });
    }
  };

  function mountAll() {
    if (!hasGL()) return;
    const els = Array.from(document.querySelectorAll('[data-gl]'));
    const mount = el => {
      if (el.dataset.glMounted) return;
      el.dataset.glMounted = '1';
      const b = builders[el.dataset.gl];
      if (!b) return;
      try { b(el); el.classList.add('gl-on'); } catch (e) { console.warn('3D scene failed', e); }
    };
    if (!('IntersectionObserver' in window)) { els.forEach(mount); return; }
    const io = new IntersectionObserver(entries => {
      entries.forEach(en => { if (en.isIntersecting) { mount(en.target); io.unobserve(en.target); } });
    }, { rootMargin: '400px 0px' });
    els.forEach(el => io.observe(el));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();
})();
