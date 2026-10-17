// The story, one async script per act. Each act first puts the world into its
// own starting state (so any act can be jumped to), then plays its beats.
// Scripts await `ctx` helpers, which throw when the act is left mid-way.
// World units are brain units (≈ 2.6 cm); the brain's origin is the world origin.

import * as THREE from "three";
import { ease } from "./tween.js";
import { PATHWAYS, PLACEMENTS, PATHWAY_COLORS } from "./anatomy.js";
import {
  TASK_PHASES, ATTACK_DAY, NORMAL_DAY, VOICE_NOTE, rng, sampleTask, todaysSettings, sessionResult, resultsOverTime,
} from "./sim-data.js";
import { rhythmEnvelope } from "./ui/charts.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** Camera shots: [position, target]. */
const SHOTS = {
  checkin: [V(12, 2, 22), V(6.5, -2.2, 0)],
  tracking: [V(-15, 7, -25), V(4, -2, 14)],
  profile: [V(30, 9, 30), V(1, -2, 11)],
  before: [V(20, 1, 22), V(-4.5, -4.5, 0)],
  brainFront: [V(15, 1.5, 15), V(0, -2.2, -0.4)],
  brainBack: [V(14, 1.5, -16), V(0, -2.2, -0.6)],
  brainSide: [V(21, 6, 0), V(0, -0.5, -0.4)],
  after: [V(18, 2, 30), V(-6, -3, 0)],
  results: [V(4, 1.5, 27), V(0, -1.6, -0.4)],
};

// ---- Shared helpers ---------------------------------------------------------------------

function fly(app, ctx, [pos, target], duration = 1500) {
  const { camera, controls } = app.stage;
  return ctx.all([
    app.tweens.to(camera.position, { x: pos.x, y: pos.y, z: pos.z }, { duration, easing: ease.inOut }),
    app.tweens.to(controls.target, { x: target.x, y: target.y, z: target.z }, { duration, easing: ease.inOut }),
  ]);
}

function setMood(app, { pain = 0, calm = 0 }, duration = 900) {
  return app.tweens.to(app.head.auras.state, { pain, calm }, { duration });
}

/** Hide one layer: strands fade, highlights released, its card removed. */
function hideLayer(app, id) {
  const all = id === "device" ? Object.values(app.brain.device).flatMap((d) => [d.route, ...d.links]) : app.brain.paths[id].strands;
  for (const s of all) {
    app.tweens.to(s.state, { opacity: 0 }, { duration: 500 }).then(() => { if (s.state.opacity < 0.01) s.state.reveal = 0; });
  }
  app.brain.release(id);
  if (id === "device") app.brain.release("proposed");
  app.ui.pathways.setVisible(id, false);
  app.ui.pathways.clearSteps(id);
  app.state.layers[id] = false;
}

function hideAllLayers(app) {
  for (const id of ["device", "visual", "migraine"]) hideLayer(app, id);
}

/** Draw a layer on, lighting each step as the reveal passes it. */
export async function showLayer(app, id, { duration = 3600 } = {}) {
  const { brain, ui, tweens } = app;
  const color = PATHWAY_COLORS[id];
  const def = id === "device" ? PLACEMENTS[app.state.placement] : PATHWAYS[id];
  const strands = id === "device" ? [brain.device[app.state.placement].route] : brain.paths[id].strands;
  app.state.layers[id] = true;
  ui.pathways.setVisible(id, true);
  ui.pathways.clearSteps(id);
  for (const s of strands) { tweens.kill(s.state); Object.assign(s.state, { opacity: 1, reveal: 0, beads: 1, flow: 1 }); }
  const marks = def.marks.map((m) => ({ ...m, u: strands[0].pointU[m.at], done: false }));
  await tweens.run((t) => {
    if (!app.state.layers[id]) return;
    for (const s of strands) s.state.reveal = t;
    for (const m of marks) {
      if (m.done || t < m.u - 0.002) continue;
      m.done = true;
      brain.claim(m.site, id, color);
      ui.pathways.setStep(id, m.step);
    }
  }, { duration, easing: ease.sine });
  if (id !== "device" || !app.state.layers.device) return;
  const links = brain.device[app.state.placement].links;
  for (const l of links) { tweens.kill(l.state); Object.assign(l.state, { opacity: 1, reveal: 0, beads: 1, flow: 0 }); }
  await tweens.run((t) => { if (app.state.layers.device) for (const l of links) l.state.reveal = t; }, { duration: 1700, easing: ease.sine });
  if (!app.state.layers.device) return;
  for (const to of def.proposed.to) brain.claim(to, "proposed", "#e2d6ff");
  ui.pathways.setStep("device", def.steps.length - 1);
}

/** Toggle from the panel: redraw on, fade off. */
export function toggleLayer(app, id, on) {
  if (on) showLayer(app, id, { duration: 2400 });
  else hideLayer(app, id);
}

/** Switch placement wherever we are: the device moves, the device layer redraws. */
export function changePlacement(app, id) {
  const wasShown = app.state.layers.device;
  if (wasShown) hideLayer(app, "device");
  app.state.placement = id;
  app.head.setPlacement(id);
  app.brain.setPlacement(id);
  app.ui.pathways.setPlacement(id);
  if (wasShown) setTimeout(() => showLayer(app, "device", { duration: 2400 }), 350);
}

/** Pathway mode: the shell fades back so the brain and routes take over. */
function setBrainView(app, on, duration = 1000) {
  app.state.brainView = on;
  app.brain.showLabels(on);
  app.head.setShell(on ? 0.22 : 1, duration);
  app.head.glasses.setOpacity(on ? 0.3 : 1);
  app.brain.setXray(on, duration);
}

/**
 * Put the world into an act's starting state. Anything the act animates itself
 * (putting on the eye tracker, the wearable) starts "off" here.
 */
function setScene(app, s) {
  const { head, brain, task, stage } = app;
  app.panels(s.panels);
  app.desktop(!!s.desktop);
  if (s.glasses) head.wearGlasses(); else head.removeGlasses();
  if (s.device) head.wearDevice(); else head.removeDevice();
  head.device.setVibrating(false);
  head.auras.state.voice = 0;
  head.pose(s.pose || "idle", 900);
  setMood(app, s.mood || {});
  task.show(!!s.task);
  if (!s.task) app.tweens.to(head.gaze.state, { opacity: 0 }, { duration: 400 });
  stage.controls.autoRotate = false;
  app.state.session = null;
  hideAllLayers(app);
  brain.setNeutral(!!s.neutral);
  setBrainView(app, !!s.brainView);
  app.hideExplain();
}

function stamp(seconds) {
  const s = Math.round(seconds);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// ---- Acts ------------------------------------------------------------------------------

async function checkinAct(app, ctx) {
  setScene(app, { panels: { checkin: true }, pose: "pain", mood: { pain: 0.8 } });
  app.say("Day 64. Alex wakes up with a migraine and opens the daily check-in.");
  await fly(app, ctx, SHOTS.checkin, 1600);
  if (app.autoplay) await app.ui.checkin.autofill(ctx.wait);
  if (app.state.danger) return;
  app.say("Saved. No danger signs, so today's tracking task comes next.");
  await ctx.hold(2200);
}

async function trackingAct(app, ctx) {
  const { head, task, ui } = app;
  setScene(app, { panels: { hud: true, events: true }, pose: "pain", mood: { pain: 0.55 } });
  ui.hud.reset();
  ui.hud.setRecording(false, "Connecting");
  ui.hud.setActivity("Put on the eye tracker", "Eye tracker with a clip-on motion sensor");
  app.say("The daily tracking task: the same 4 minutes, in the same lighting, every day.");
  await fly(app, ctx, SHOTS.tracking, 1600);

  head.pose("task", 900);
  await head.putOnGlasses(V(9, 4, 14));
  ctx.check();
  task.show(true);
  app.tweens.to(head.gaze.state, { opacity: 1 }, { duration: 600 });
  ui.hud.setRecording(true);
  ui.hud.event("Eye tracker and motion sensor connected", "00:00");

  const rand = rng(11);
  const total = TASK_PHASES.length * 3.4;
  let elapsed = 0;
  const notes = {
    pursuit: "Smooth pursuit steady; blink rate up 40% vs normal days",
    turns: `Head turn range ${ATTACK_DAY.head_range}°, about 38% less than on normal days`,
    light: "Squinting began at the second brightness step",
    scene: "Gaze avoided the bright side most of the time",
  };
  for (const [i, phase] of TASK_PHASES.entries()) {
    task.setPhase(phase.id);
    ui.hud.setActivity(phase.label, phase.detail);
    app.say(`Task ${i + 1} of ${TASK_PHASES.length}: ${phase.label.toLowerCase()}.`);
    for (let t = 0; t < 3.4; t += 0.1) {
      ui.hud.push(sampleTask(phase.id, elapsed * 3, rand, ATTACK_DAY));
      elapsed += 0.1;
      ui.hud.setProgress(elapsed / total);
      ui.hud.setFoot("Task progress (sped up)", `${Math.round((elapsed / total) * 240)} of 240 s`);
      if (Math.abs(t - 1.6) < 0.05) ui.hud.event(notes[phase.id], stamp((elapsed / total) * 240));
      await ctx.wait(100);
    }
  }
  task.show(false);
  app.tweens.to(head.gaze.state, { opacity: 0 }, { duration: 400 });

  app.say("Then a short voice note, in Alex's own words.");
  ui.hud.setActivity("Voice note", "30 to 60 s · how you feel today");
  ui.hud.setVoice(true);
  head.pose("voice", 800);
  app.tweens.to(head.auras.state, { voice: 1 }, { duration: 400 });
  const words = VOICE_NOTE.transcript.split(" ");
  for (let i = 0; i < words.length; i++) {
    ui.hud.voiceWords(words.slice(0, i + 1).join(" "));
    for (let k = 0; k < 3; k++) {
      ui.hud.voiceLevel(0.25 + Math.random() * 0.7);
      await ctx.wait(45);
    }
  }
  for (let k = 0; k < 10; k++) { ui.hud.voiceLevel(0.04); await ctx.wait(30); }
  app.tweens.to(head.auras.state, { voice: 0 }, { duration: 400 });
  ui.hud.voiceStats([
    { value: `${VOICE_NOTE.speech_rate} wpm`, label: `Speech rate (normal ${NORMAL_DAY.speech_rate})` },
    { value: VOICE_NOTE.pitch_var.toFixed(2), label: "Pitch variation (normal 1.00)" },
  ]);
  head.pose("pain", 900);
  ui.hud.setRecording(false, "Done");
  ui.hud.setProgress(0.88);
  ui.hud.setFoot("Matches your attack pattern", "88%");
  ui.hud.event("Attack likely (88%), and it agrees with the check-in", stamp(240));
  app.say("Today's readings match Alex's attack pattern, and agree with the check-in.");
  await ctx.hold(2600);
}

async function profileAct(app, ctx) {
  const { ui, state } = app;
  setScene(app, { panels: { portfolio: true }, glasses: true, pose: "task", mood: { pain: 0.5 }, task: true });
  app.task.setPhase("pursuit");
  app.tweens.to(app.head.gaze.state, { opacity: 1 }, { duration: 600 });
  ui.portfolio.render({
    days: state.days, sig: state.sig, detection: state.detection, placement: state.placement,
    onPlacement: (id) => changePlacement(app, id),
    onStart: () => app.director.next(),
  });
  await ctx.wait(60);
  app.desktop(true);
  app.say("Alex's profile: the baseline month, their attack signature, and what each session did. The tuner picks today's settings.");
  await fly(app, ctx, SHOTS.profile, 1400);
  await ctx.hold(10000);
}

async function beforeAct(app, ctx) {
  const { ui, head, state } = app;
  setScene(app, { panels: { hud: true }, glasses: true, pose: "pain", mood: { pain: 1 } });
  const rx = todaysSettings(state.placement);
  const pl = PLACEMENTS[state.placement];
  ui.hud.reset();
  ui.hud.setTitle("Stimulation session");
  ui.hud.showMetrics(false);
  ui.hud.setRecording(false, "Session");
  ui.hud.setActivity("Before stimulation", `Wearable on the ${pl.short.toLowerCase()}`);
  ui.hud.setBig([{ value: `${state.checkin.pain}/10`, label: "Pain now" }, { value: "1 h", label: "Since onset" }]);
  ui.hud.setFoot("Today's settings", `${rx.hz} Hz · ${rx.pct}% · ${rx.min} min`);
  app.say(`Before: pain ${state.checkin.pain}/10. Alex puts the wearable on the ${pl.short.toLowerCase()}.`);
  await fly(app, ctx, SHOTS.before, 1500);
  await ctx.wait(400);
  head.pose({ side: "placeSide", ear: "placeEar", back: "placeBack" }[state.placement], 1000);
  await head.putOnDevice(V(12, -9, 12));
  ctx.check();
  head.pose("pain", 900);
  app.say("Wearable on. Safety limits are locked; today's settings come from the tuner.");
  await ctx.hold(2000);
}

async function vibrationAct(app, ctx) {
  const { head, state } = app;
  setScene(app, { panels: { pathways: true }, glasses: true, device: true, pose: "idle", mood: { pain: 0.6 } });
  const rx = todaysSettings(state.placement);
  head.device.setPattern(rhythmEnvelope);
  head.device.setVibrating(true);
  state.session = { start: performance.now(), rx };
  app.say(`Stimulation on: ${rx.hz} Hz, ${rx.pct}%, ${rx.min} min, ${rx.temp.toLowerCase()}.`);
  const pod = head.podWorld();
  await fly(app, ctx, [pod.clone().add(V(9, 2, 10)), pod], 1400);
  await ctx.wait(1300);

  setBrainView(app, true, 1200);
  app.tweens.to(head.auras.state, { pain: 0.2 }, { duration: 1200 });
  await fly(app, ctx, state.placement === "back" ? SHOTS.brainBack : SHOTS.brainFront, 1800);
  app.say("Mode 1. The device pathway: skin to brainstem relay, then the proposed link being tested.");
  await showLayer(app, "device");
  ctx.check();
  await ctx.wait(1400);

  app.say("For context: the visual pathway, which the eye tracker's readings relate to.");
  fly(app, ctx, SHOTS.brainSide, 2200);
  await showLayer(app, "visual");
  ctx.check();
  await ctx.wait(1200);

  app.say("Optional: the migraine pain pathway. The device is not shown activating it.");
  fly(app, ctx, SHOTS.brainFront, 2000);
  await showLayer(app, "migraine");
  ctx.check();
  app.say("Rotate or zoom the brain, tap any region to learn more, or toggle layers on the left.");
  await ctx.hold(5000);
}

async function afterAct(app, ctx) {
  const { ui, state } = app;
  setScene(app, { panels: { hud: true }, glasses: true, device: true, pose: "relaxed", mood: { pain: 0, calm: 1 } });
  const r = sessionResult(state.checkin);
  ui.hud.reset();
  ui.hud.setTitle("Stimulation session");
  ui.hud.setRecording(true, "2-hour check");
  ui.hud.setActivity("2 hours later", "Pain check + a short tracking task");
  ui.hud.setBig([{ value: `${r.pain2}/10`, label: "Pain at 2 hours" }, { value: `−${r.pain0 - r.pain2}`, label: "Change from start" }]);
  app.say(`Two hours later: pain ${r.pain2}/10, down from ${r.pain0}.`);
  await fly(app, ctx, SHOTS.after, 1700);
  const rand = rng(5);
  const better = { ...ATTACK_DAY, head_range: 63, head_speed: 108, blink: 17, squint: 0.3, bright_gaze: 33, pupil: 3.7 };
  for (let t = 0; t < 3.2; t += 0.1) {
    ui.hud.push(sampleTask(t < 1.6 ? "turns" : "light", t * 3, rand, better));
    ui.hud.setProgress(t / 3.2);
    await ctx.wait(100);
  }
  ui.hud.setRecording(false, "Logged");
  ui.hud.setFoot("Sent to the tuner", "keep · 1 small change next");
  ui.hud.setProgress(1);
  app.say("Logged. The tuner keeps what worked and will try one small change next time, always inside the safety limits.");
  await ctx.hold(3500);
}

async function resultsAct(app, ctx) {
  const { state } = app;
  // Mode 2 is deliberately bare: no devices, no highlights, just the neutral brain.
  setScene(app, { panels: { results: true }, pose: "relaxed", brainView: true, neutral: true });
  app.ui.results.render(resultsOverTime(state.checkin, state.detection));
  app.say("Mode 2: Alex's own results beside a neutral brain. Simulated data.");
  await fly(app, ctx, SHOTS.results, 1800);
  app.stage.controls.autoRotate = true;
  app.stage.controls.autoRotateSpeed = 0.7;
  await ctx.hold(Infinity);
}

export const ACTS = [
  { id: "checkin", group: "Track", label: "Check-in", run: checkinAct },
  { id: "tracking", group: "Track", label: "Tracking", run: trackingAct },
  { id: "profile", group: "Track", label: "Profile", run: profileAct },
  { id: "before", group: "Session", label: "Before", run: beforeAct },
  { id: "vibration", group: "Session", label: "Vibration", run: vibrationAct },
  { id: "after", group: "Session", label: "After", run: afterAct },
  { id: "results", group: "Session", label: "Results", run: resultsAct },
];
