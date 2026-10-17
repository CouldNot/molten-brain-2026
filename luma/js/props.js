// The daily tracking task's stage: a floating display that runs the fixed
// 4-minute routine (follow the dot, head turns, brightness steps, free viewing)
// plus the two head-turn targets. Same lighting every day, so days compare.

import * as THREE from "three";
import { holoMaterial, glowSprite } from "./materials.js";

const W = 512, H = 320;
// World units are brain units (≈ 2.6 cm), see js/head.js.
const PANEL = { pos: new THREE.Vector3(0, -1.2, 28), w: 22, h: 13.8 };

export function createTaskStage(tweens) {
  const root = new THREE.Group();
  root.visible = false;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d");
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(PANEL.w, PANEL.h), screenMat);
  screen.position.copy(PANEL.pos);
  screen.rotation.y = Math.PI; // faces the head
  root.add(screen);
  const frameMat = holoMaterial({ color: "#5fb8ff", base: 0.08, rim: 0.9, power: 1.4 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(PANEL.w + 1, PANEL.h + 1, 0.4), frameMat);
  frame.position.copy(PANEL.pos).add(new THREE.Vector3(0, 0, 0.3));
  root.add(frame);
  const glow = glowSprite("#bfe6ff", 40, 0.25);
  glow.position.copy(PANEL.pos);
  root.add(glow);

  const targets = [-1, 1].map((s) => {
    const t = glowSprite("#4fe3ff", 6, 0);
    t.position.set(s * 30, -1.2, 18);
    root.add(t);
    return t;
  });

  const state = { fade: 0, phase: "pursuit", t: 0, brightness: 0.25 };
  /** Where the eyes should be looking right now (world space). */
  const gazeTarget = new THREE.Vector3().copy(PANEL.pos);
  let headYaw = 0;

  function draw() {
    const { phase, t } = state;
    const b = phase === "light" ? 0.15 + 0.85 * stepRamp(t) : phase === "scene" ? 0.5 : 0.12;
    state.brightness = b;
    const base = Math.round(14 + b * 220);
    g.fillStyle = `rgb(${base},${base + 6},${base + 14})`;
    g.fillRect(0, 0, W, H);
    if (phase === "pursuit") {
      const x = W / 2 + Math.sin(t * 1.3) * W * 0.36;
      const y = H / 2 + Math.sin(t * 2.1) * H * 0.3;
      dot(x, y);
      gazeTarget.set(PANEL.pos.x - ((x - W / 2) / W) * PANEL.w, PANEL.pos.y - ((y - H / 2) / H) * PANEL.h, PANEL.pos.z);
    } else if (phase === "turns") {
      const side = Math.sin(t * 1.4);
      g.fillStyle = "rgba(79,227,255,0.85)";
      g.font = "600 34px system-ui, sans-serif";
      g.textAlign = "center";
      g.fillText(side > 0 ? "◀  turn" : "turn  ▶", W / 2, H / 2 + 12);
      gazeTarget.copy(targets[side > 0 ? 1 : 0].position);
    } else if (phase === "light") {
      dot(W / 2, H / 2);
      gazeTarget.copy(PANEL.pos);
    } else {
      // Free viewing: a bright "window" on the right, a dim room on the left.
      g.fillStyle = "#0d1626";
      g.fillRect(0, 0, W * 0.55, H);
      const grad = g.createLinearGradient(W * 0.55, 0, W, 0);
      grad.addColorStop(0, "#9fc9ff");
      grad.addColorStop(1, "#ffffff");
      g.fillStyle = grad;
      g.fillRect(W * 0.55, 0, W * 0.45, H);
      const lookBright = Math.sin(t * 0.8) > 0.55; // attack days: mostly avoids the bright side
      gazeTarget.set(PANEL.pos.x + (lookBright ? -6 : 6), PANEL.pos.y - 1.5, PANEL.pos.z);
    }
    tex.needsUpdate = true;
    headYaw = phase === "turns" ? Math.sin(t * 1.4) * 0.55 : 0;
  }

  function dot(x, y) {
    const r = g.createRadialGradient(x, y, 0, x, y, 26);
    r.addColorStop(0, "rgba(255,255,255,1)");
    r.addColorStop(0.35, "rgba(79,227,255,0.9)");
    r.addColorStop(1, "rgba(79,227,255,0)");
    g.fillStyle = r;
    g.beginPath();
    g.arc(x, y, 26, 0, Math.PI * 2);
    g.fill();
  }

  function setFade(v) {
    state.fade = v;
    root.visible = v > 0.002;
    screenMat.opacity = v;
    frameMat.uniforms.uOpacity.value = v;
  }

  return {
    root, state, gazeTarget,
    get headYaw() { return headYaw; },
    show(on, duration = 700) {
      const from = state.fade;
      return tweens.run((k) => setFade(from + ((on ? 1 : 0) - from) * k), { duration });
    },
    setPhase(id) { state.phase = id; state.t = 0; },
    tick(dt) {
      if (!root.visible) return;
      state.t += dt;
      draw();
      glow.material.opacity = state.fade * (0.12 + state.brightness * 0.5);
      for (const tg of targets) tg.material.opacity = state.phase === "turns" ? state.fade * (0.6 + 0.4 * Math.sin(state.t * 6)) : 0;
    },
  };
}

/** 50 -> 400 nits in four even steps across the phase. */
function stepRamp(t) {
  return Math.min(3, Math.floor(t / 1.6)) / 3;
}
