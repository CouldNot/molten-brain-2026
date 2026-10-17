// Boot + orchestration: builds the stage, head bust, brain and UI, runs the act
// director, the render loop, tap-to-explain picking and keyboard shortcuts.

import * as THREE from "three";
import { createStage } from "./stage.js";
import { createTweens } from "./tween.js";
import { createHead } from "./head.js";
import { createBrain } from "./brain.js";
import { createTaskStage } from "./props.js";
import { SITES } from "./anatomy.js";
import { ACTS, toggleLayer, changePlacement } from "./acts.js";
import { CHECKIN_DEFAULTS, baselineMonth, signature, detectionStats } from "./sim-data.js";
import { createTooltip } from "./ui/dom.js";
import { createCheckin } from "./ui/checkin.js";
import { createHud } from "./ui/hud.js";
import { createPortfolio } from "./ui/portfolio.js";
import { createPathwayPanel } from "./ui/pathway-panel.js";
import { createResults } from "./ui/results.js";

const $ = (id) => document.getElementById(id);

async function boot() {
  const loadingFill = $("loading-fill");
  const stage = createStage($("stage"));
  const tweens = createTweens();
  const head = createHead(tweens);
  stage.scene.add(head.root);
  stage.scene.add(head.gaze.group);
  const brain = await createBrain(tweens, (f) => { loadingFill.style.width = `${Math.round(f * 100)}%`; });
  head.headCenter.add(brain.anchor);
  const task = createTaskStage(tweens);
  stage.scene.add(task.root);

  const days = baselineMonth();
  const state = {
    checkin: structuredClone(CHECKIN_DEFAULTS),
    placement: "side",
    days, sig: signature(), detection: detectionStats(days),
    layers: { device: false, visual: false, migraine: false },
    danger: false, brainView: false, session: null,
  };

  const tip = createTooltip($("tooltip"));
  const app = { stage, tweens, head, brain, task, state, autoplay: true };
  app.ui = {
    checkin: createCheckin($("intake"), state.checkin, {
      onSubmit: () => app.director.next(),
      onDanger: (flagged) => {
        state.danger = flagged;
        if (flagged) app.say("Danger sign flagged: the app tells Alex to seek urgent care, and the session is paused.");
      },
    }),
    hud: createHud($("hud"), $("events")),
    portfolio: createPortfolio($("portfolio"), tip),
    pathways: createPathwayPanel($("pathways"), { onToggle: (id, on) => toggleLayer(app, id, on) }),
    results: createResults($("results"), tip),
  };

  // ---- Panels, desktop framing, captions ------------------------------------------------
  const panelIds = { checkin: "intake", hud: "hud", events: "events", portfolio: "portfolio", pathways: "pathways", results: "results" };
  app.panels = (on = {}) => {
    for (const [key, id] of Object.entries(panelIds)) $(id).hidden = !on[key];
    tip.hide();
  };

  const stageEl = $("stage");
  app.desktop = (on) => {
    document.body.classList.toggle("desktop-mode", on);
    if (!on) {
      stageEl.style.transform = "";
      stageEl.style.clipPath = "";
      return;
    }
    const slot = app.ui.portfolio.slot();
    if (!slot) return;
    const r = slot.getBoundingClientRect();
    const W = innerWidth, H = innerHeight;
    const s = Math.max(r.width / W, r.height / H);
    const x0 = (W - r.width / s) / 2, y0 = (H - r.height / s) / 2;
    stageEl.style.transform = `translate(${r.left - s * x0}px, ${r.top - s * y0}px) scale(${s})`;
    stageEl.style.clipPath = `inset(${y0}px ${x0}px ${y0}px ${x0}px round ${14 / s}px)`;
  };
  addEventListener("resize", () => { if (document.body.classList.contains("desktop-mode")) app.desktop(true); });

  const caption = $("caption");
  app.say = (text) => {
    if (caption.textContent === text) return;
    caption.classList.add("swap");
    setTimeout(() => { caption.textContent = text; caption.classList.remove("swap"); }, 180);
  };

  // ---- Director -------------------------------------------------------------------------
  const CANCEL = Symbol("cancel");
  let index = -1;
  let ctrl = null;
  const stepEls = buildStepper((i) => go(i));

  function makeCtx(signal) {
    const check = () => { if (signal.aborted) throw CANCEL; };
    const wait = (ms) => new Promise((resolve, reject) => {
      if (signal.aborted) return reject(CANCEL);
      const t = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(CANCEL); }, { once: true });
    });
    return {
      signal, check, wait,
      async all(promises) { await Promise.all(promises); check(); },
      /** Hold for `ms` of autoplay time; paused time does not count. */
      async hold(ms) {
        for (let t = 0; t < ms;) {
          await wait(100);
          if (app.autoplay) t += 100;
        }
      },
    };
  }

  async function go(i) {
    if (i < 0 || i >= ACTS.length) return;
    if (state.danger && i > index) {
      app.say("Paused: a danger sign is flagged. Clear it in the check-in to continue the demo.");
      return;
    }
    ctrl?.abort();
    ctrl = new AbortController();
    index = i;
    stepEls.forEach((el, k) => {
      el.classList.toggle("active", k === i);
      el.classList.toggle("done", k < i);
    });
    const ctx = makeCtx(ctrl.signal);
    try {
      await ACTS[i].run(app, ctx);
      ctx.check();
      if (i < ACTS.length - 1) go(i + 1);
    } catch (err) {
      if (err !== CANCEL) console.error(err);
    }
  }
  app.director = { go, next: () => go(index + 1), prev: () => go(index - 1) };

  // ---- Transport + keyboard ------------------------------------------------------------
  const setAutoplay = (on) => {
    app.autoplay = on;
    document.body.classList.toggle("paused", !on);
  };
  $("btn-play").addEventListener("click", () => setAutoplay(!app.autoplay));
  $("btn-next").addEventListener("click", () => app.director.next());
  $("btn-prev").addEventListener("click", () => app.director.prev());
  addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if (e.key === "ArrowRight") app.director.next();
    else if (e.key === "ArrowLeft") app.director.prev();
    else if (e.key === " ") { e.preventDefault(); setAutoplay(!app.autoplay); }
  });

  // ---- Tap to explain ----------------------------------------------------------------
  const explain = $("explain");
  let explainTimer = 0;
  app.hideExplain = () => { explain.hidden = true; brain.hover(null); };
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = () => [...brain.pickables, head.device.pickable];
  function pick(e) {
    const rect = stage.renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
    const hits = raycaster.intersectObjects(pickables(), true).filter((h) => h.object.userData.info && h.object.visible !== false);
    if (!hits.length) return null;
    // Prefer what the explanation is about: a relay or the device beats the cortex in front of it.
    const lit = hits.find((h) => ["nts", "tcc", "trigeminal_nucleus", "pain_control", "thalamus", "device"].includes(h.object.userData.site));
    return (lit || hits[0]).object.userData;
  }
  let downAt = null;
  stage.renderer.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
  stage.renderer.domElement.addEventListener("pointermove", (e) => {
    if (!state.brainView || e.buttons) return;
    const hit = pick(e);
    brain.hover(hit?.site ?? null);
    stage.renderer.domElement.style.cursor = hit ? "pointer" : "";
  });
  stage.renderer.domElement.addEventListener("pointerup", (e) => {
    if (!state.brainView || !downAt) return;
    if (Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return; // a drag, not a tap
    const hit = pick(e);
    if (!hit) { app.hideExplain(); return; }
    const info = SITES[hit.info] || SITES[hit.site];
    explain.innerHTML = `<b>${info.name}</b><p>${info.text}</p>`;
    explain.hidden = false;
    const x = Math.min(e.clientX + 16, innerWidth - 300), y = Math.min(e.clientY + 16, innerHeight - 140);
    explain.style.left = `${x}px`;
    explain.style.top = `${y}px`;
    clearTimeout(explainTimer);
    explainTimer = setTimeout(app.hideExplain, 7000);
  });

  // ---- Render loop ---------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const time = now / 1000;
    tweens.tick(now);
    task.tick(dt);
    if (task.state.fade > 0.01) {
      head.extra.headYaw += (task.headYaw - head.extra.headYaw) * Math.min(1, dt * 6);
      head.gaze.state.target.lerp(task.gazeTarget, Math.min(1, dt * 10));
    } else head.extra.headYaw *= 0.9;
    head.tick(dt, time);
    brain.tick(time);
    if (state.session && !$("pathways").hidden) {
      const { rx, start } = state.session;
      const secs = Math.min(rx.min * 60, ((now - start) / 1000) * 24);
      const mm = Math.floor(secs / 60), ss = Math.floor(secs % 60);
      app.ui.pathways.setVibe(head.device.level,
        `<b>${rx.hz} Hz · ${rx.pct}% · ${rx.temp}</b><br>${mm}:${String(ss).padStart(2, "0")} of ${rx.min}:00 (sped up)`);
    }
    stage.render(time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  $("loading").classList.add("done");
  window.__luma = app; // handy for poking at the demo from the console
  const start = Number(new URLSearchParams(location.search).get("act") || 0);
  if (new URLSearchParams(location.search).get("paused")) setAutoplay(false);
  go(Math.max(0, Math.min(ACTS.length - 1, start)));
}

function buildStepper(onPick) {
  const host = $("stepper");
  const els = [];
  let group = null;
  let groupEl = null;
  ACTS.forEach((act, i) => {
    if (act.group !== group) {
      if (groupEl) host.append(Object.assign(document.createElement("span"), { className: "step-sep" }));
      group = act.group;
      groupEl = document.createElement("div");
      groupEl.className = "step-group";
      groupEl.innerHTML = `<span class="step-group-label">${group}</span>`;
      host.append(groupEl);
    } else {
      groupEl.append(Object.assign(document.createElement("span"), { className: "step-arrow", textContent: "→" }));
    }
    const b = document.createElement("button");
    b.className = "step";
    b.type = "button";
    b.innerHTML = `<span class="dot"></span>${act.label}`;
    b.addEventListener("click", () => onPick(i));
    groupEl.append(b);
    els.push(b);
  });
  return els;
}

boot().catch((err) => {
  console.error(err);
  $("loading-text").textContent = `Failed to load: ${err.message}`;
});
