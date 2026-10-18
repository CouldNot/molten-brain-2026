// Haptiq's signed-in brain view: the anatomical model, educational pathways,
// placement controls, region explanations, and the dashboard's outcome data.
import * as THREE from "three";
import { createStage } from "./brain/stage.js";
import { createTweens } from "./brain/tween.js";
import { createHead } from "./brain/head.js";
import { createBrain } from "./brain/brain.js";
import { PATHWAYS, PLACEMENTS, SITES, PATHWAY_COLORS, PROPOSED_COLOR } from "./brain/anatomy.js";

const $ = (id) => document.getElementById(id);
const order = ["device", "visual", "migraine"];
const names = { device: "Device", visual: "Visual", migraine: "Migraine pain" };
const active = { device: true, visual: false, migraine: false };
let placement = "side";
let mode = "pathways";

function sessionUser() {
  try { return JSON.parse(sessionStorage.getItem("haptiq_user") || localStorage.getItem("haptiq_user") || "null"); }
  catch { return null; }
}

function renderData(data) {
  $("sampleBanner").hidden = !data.isSample;
  const devices = data.devices || [];
  for (const item of devices) {
    const row = document.createElement("div");
    const dot = document.createElement("span");
    dot.className = `dot${item.connected ? " on" : ""}`;
    const label = document.createElement("span");
    const strong = document.createElement("strong");
    strong.textContent = item.name;
    label.append(strong, document.createElement("br"), document.createTextNode(item.connected ? "Connected" : "Not connected"));
    row.append(dot, label);
    $("deviceList").append(row);
  }
  const sessions = data.sessions || [];
  const cards = [
    ["Sessions this month", String(sessions.length)],
    ["Last session", sessions.at(-1)?.date || "No session yet"],
    ["Pain at 2 hours", sessions.length ? `${sessions.at(-1).after2h} / 10` : "—"],
  ];
  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.className = "brain-result";
    const strong = document.createElement("strong");
    strong.textContent = value;
    const span = document.createElement("span");
    span.textContent = label;
    card.append(strong, span);
    $("brainResults").append(card);
  }
}

function details() {
  const host = $("pathwayDetails");
  host.replaceChildren();
  for (const id of order.filter((key) => active[key])) {
    const def = id === "device" ? PLACEMENTS[placement] : PATHWAYS[id];
    const card = document.createElement("article");
    card.className = "brain-detail";
    const title = document.createElement("h3");
    title.textContent = id === "device" ? `Device pathway · ${def.short}` : def.title;
    const list = document.createElement("ol");
    for (const step of def.steps) {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = `${step.title}: `;
      li.append(strong, document.createTextNode(step.text));
      list.append(li);
    }
    const note = document.createElement("p");
    note.textContent = def.note;
    card.append(title, list, note);
    host.append(card);
  }
}

async function boot() {
  const data = await window.HaptiqData.load();
  renderData(data);
  const stage = createStage($("brainStage"));
  const tweens = createTweens();
  const head = createHead();
  stage.scene.add(head.root);
  const brain = await createBrain(tweens, (fraction) => {
    $("brainProgress").textContent = `${Math.round(fraction * 100)}%`;
  });
  head.headCenter.add(brain.anchor);
  $("brainLoading").hidden = true;

  function strands(id) {
    return id === "device"
      ? [brain.device[placement].route, ...brain.device[placement].links]
      : brain.paths[id].strands;
  }
  function refresh() {
    tweens.clear();
    brain.setNeutral(mode === "results", 0);
    brain.setXray(mode === "pathways", 0);
    brain.showLabels(mode === "pathways");
    head.setVisible(mode === "pathways");
    head.device.setVibrating(mode === "pathways" && active.device);
    for (const path of brain.strands) {
      path.state.reveal = 0;
      path.state.opacity = 0;
      path.state.flow = 0;
      path.state.beads = 0;
    }
    if (mode !== "pathways") return;
    for (const id of order.filter((key) => active[key])) {
      const selected = strands(id);
      selected.forEach((path, index) => {
        path.state.opacity = 1;
        const proposed = id === "device" && index > 0;
        tweens.to(path.state, { reveal: 1, flow: proposed ? 0 : 0.5, beads: proposed ? 0 : 0.65 }, {
          duration: proposed ? 1500 : 1800, delay: proposed ? 700 : 0,
        });
      });
      const def = id === "device" ? PLACEMENTS[placement] : PATHWAYS[id];
      const color = PATHWAY_COLORS[id];
      for (const mark of def.marks) brain.claim(mark.site, id, color);
      if (id === "device") for (const site of def.proposed.to) brain.claim(site, "proposed", PROPOSED_COLOR);
    }
  }

  function controls() {
    $("placementControls").replaceChildren();
    for (const [id, def] of Object.entries(PLACEMENTS)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${placement === id ? " on" : ""}`;
      button.setAttribute("aria-pressed", String(placement === id));
      button.textContent = def.short;
      button.addEventListener("click", () => {
        placement = id;
        head.setPlacement(id);
        brain.setPlacement(id);
        controls(); details(); refresh();
      });
      $("placementControls").append(button);
    }
    $("layerControls").replaceChildren();
    for (const id of order) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${active[id] ? " on" : ""}`;
      button.setAttribute("aria-pressed", String(active[id]));
      button.textContent = names[id];
      button.addEventListener("click", () => {
        active[id] = !active[id];
        controls(); details(); refresh();
      });
      $("layerControls").append(button);
    }
  }
  function setMode(next) {
    mode = next;
    for (const [id, button] of [["pathways", $("modePathways")], ["results", $("modeResults")]]) {
      const on = id === next;
      button.setAttribute("aria-selected", String(on));
      $(id === "pathways" ? "pathwayPanel" : "resultsPanel").hidden = !on;
    }
    refresh();
  }
  $("modePathways").addEventListener("click", () => setMode("pathways"));
  $("modeResults").addEventListener("click", () => setMode("results"));
  controls(); details(); refresh();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  const canvas = stage.renderer.domElement;
  canvas.addEventListener("pointerdown", (event) => { down = { x: event.clientX, y: event.clientY }; });
  canvas.addEventListener("pointerup", (event) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const rect = canvas.getBoundingClientRect();
    pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, stage.camera);
    const hit = raycaster.intersectObjects([...brain.pickables, head.device.pickable], false)[0];
    const key = hit?.object.userData.info || hit?.object.userData.site;
    const info = SITES[key];
    if (info) { $("siteName").textContent = info.name; $("siteText").textContent = info.text; }
  });
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    tweens.tick(now);
    brain.tick(now / 1000);
    head.tick(dt, now / 1000);
    stage.render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

$("logout").addEventListener("click", () => {
  try { sessionStorage.removeItem("haptiq_user"); localStorage.removeItem("haptiq_user"); } catch {}
});
if (sessionUser()) boot().catch((error) => {
  console.error(error);
  $("brainLoading").textContent = "Could not load the brain model. Refresh to try again.";
});
