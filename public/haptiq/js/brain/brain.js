// The brain: molten-brain's baked region meshes, eyes, spinal cord, brainstem
// relay nodes, the pathways and the tap-to-explain sites.
//
// Highlights here are EXPLANATORY (they follow a pathway walkthrough); nothing in
// this module models a measured response.

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { decodeMesh } from "./mesh-codec.js";
import { glowSprite } from "./materials.js";
import { createPathway } from "./pathways.js";
import { HAPTIQ } from "./palette.js";
import {
  REGIONS, EYES, SPINAL_CORD, NODES, SITES, LABEL_AT, PATHWAYS, PLACEMENTS, PATHWAY_COLORS, PROPOSED_COLOR,
  BRAIN_SCALE, BRAIN_CENTER,
} from "./anatomy.js";

/** Results view: every region one calm brand tone, so nothing reads as activity. */
const NEUTRAL = HAPTIQ.taupe;

/** molten-brain's own structure colours, so the model looks like the original viewer. */
const ORIGINAL = {
  frontal: "#c58c9a", parietal: "#c69597", temporal: "#c79a8e", occipital: "#bf8da6", insula: "#ae7aa3",
  caudate: "#ff9da7", putamen: "#f28e2b", globus_pallidus: "#76b7b2", thalamus: "#bab0ac",
  subthalamic_nucleus: "#d37295", substantia_nigra: "#3d3d3d", accumbens: "#e0997e", claustrum: "#8d97ab",
  hippocampus: "#b3823e", amygdala: "#9b7bb0", cingulate: "#6fa39c", olfactory_bulb: "#9aa86f",
  septal_nuclei: "#7f9cc0", hypothalamus: "#c98ac9", locus_coeruleus: "#4a7fae", pituitary: "#d2a06e",
  cerebellum: "#b07aa1", midbrain: "#9c755f", pons: "#8c6a58", medulla: "#7d5f4e", raphe: "#b98ac9",
};

/** Solid, lit material; the outer shell (cortex) can go see-through to reveal pathways. */
function solidMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.62, metalness: 0.04,
    transparent: true, opacity: 1, side: THREE.DoubleSide,
  });
}
const NODE_IDLE = HAPTIQ.taupe;

export const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

/** Brain coordinates -> the head-centre frame the brain anchor lives in. */
export function brainToHead(p) {
  return new THREE.Vector3(
    (p[0] - BRAIN_CENTER[0]) * BRAIN_SCALE,
    (p[1] - BRAIN_CENTER[1]) * BRAIN_SCALE + 0.004,
    (p[2] - BRAIN_CENTER[2]) * BRAIN_SCALE,
  );
}

async function loadMesh(name) {
  const res = await fetch(`data/meshes/${name}.bin`);
  if (!res.ok) throw new Error(`mesh ${name}: HTTP ${res.status}`);
  const { positions, indices } = decodeMesh(await res.arrayBuffer());
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

function mirrorX(geometry) {
  const g = geometry.clone();
  g.scale(-1, 1, 1);
  const idx = g.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export async function createBrain(tweens, onProgress = () => {}) {
  /** Anchor sits in the head centre; children use brain coordinates. */
  const anchor = new THREE.Group();
  anchor.name = "brain";
  anchor.scale.setScalar(BRAIN_SCALE);
  anchor.position.copy(brainToHead([0, 0, 0]));

  const names = [...new Set(REGIONS.map((r) => r.mesh))];
  let loaded = 0;
  const geoms = new Map(await Promise.all(names.map(async (n) => {
    const g = await loadMesh(n);
    onProgress(++loaded / names.length);
    return [n, g];
  })));

  const regions = []; // { mesh, site, look }
  const addRegion = (mesh, site, look, info = site) => {
    mesh.userData.site = site;
    mesh.userData.info = info;
    anchor.add(mesh);
    regions.push({ mesh, site, look });
  };
  for (const r of REGIONS) {
    const place = (geometry, pos) => {
      const mesh = new THREE.Mesh(geometry, solidMaterial(ORIGINAL[r.mesh]));
      mesh.position.copy(pos);
      addRegion(mesh, r.site || r.mesh, { color: ORIGINAL[r.mesh], shell: r.group === "cortex" }, r.mesh);
    };
    place(geoms.get(r.mesh), v3(r.pos));
    if (r.bilateral) place(mirrorX(geoms.get(r.mesh)), v3([-r.pos[0], r.pos[1], r.pos[2]]));
  }

  const eyeLook = { color: "#e9e4da" };
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(EYES.radius, 32, 20), solidMaterial(eyeLook.color));
    eye.position.set(s * EYES.pos[0], EYES.pos[1], EYES.pos[2]);
    addRegion(eye, "eyes", eyeLook);
  }

  const cordLook = { color: "#d9d2c4" };
  const cordCurve = new THREE.CatmullRomCurve3(SPINAL_CORD.map(v3));
  addRegion(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 48, 0.2, 14, false), solidMaterial(cordLook.color)), "spinal_cord", cordLook);

  // Brainstem relays: glowing nodes with an invisible, generous tap target.
  const nodes = new Map();
  const pickProxyMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  for (const [site, pos] of Object.entries(NODES)) {
    const glow = glowSprite(NODE_IDLE, 0.7, 0.35);
    glow.position.copy(v3(pos));
    anchor.add(glow);
    const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), pickProxyMat);
    proxy.position.copy(glow.position);
    proxy.userData.site = site;
    proxy.userData.info = site;
    anchor.add(proxy);
    nodes.set(site, { glow, proxy, level: 0.35, color: new THREE.Color(NODE_IDLE) });
  }

  // ---- Pathways ---------------------------------------------------------------------
  const strand = (pts, color, opts = {}) =>
    createPathway({ points: pts.map(v3), color, radius: 0.13, parent: anchor, unit: 1.6, beads: 6, beadSize: 1.1, ...opts });
  const paths = {
    visual: { def: PATHWAYS.visual, strands: PATHWAYS.visual.strands.map((s) => strand(s, PATHWAYS.visual.color)) },
    migraine: { def: PATHWAYS.migraine, strands: PATHWAYS.migraine.strands.map((s) => strand(s, PATHWAYS.migraine.color)) },
  };
  for (const s of paths.migraine.strands) s.tube.userData.site = "trigeminal";
  /** One device route + its dashed proposed links per placement. */
  const device = {};
  for (const [id, pl] of Object.entries(PLACEMENTS)) {
    const route = strand(pl.route, PATHWAY_COLORS.device);
    const from = v3(NODES[pl.proposed.from]);
    const links = pl.proposed.to.map((to) => {
      const b = v3(NODES[to]);
      const bow = to === "pain_control" ? new THREE.Vector3(-0.6, 0, -0.35) : new THREE.Vector3(0.45, 0, 0.3);
      const mid = from.clone().lerp(b, 0.5).add(bow);
      return createPathway({
        points: [from.clone(), mid, b], color: PROPOSED_COLOR, radius: 0.08, parent: anchor, unit: 0.8,
        beads: 2, beadSize: 0.7, dashed: true,
      });
    });
    device[id] = { def: pl, route, links };
  }

  // ---- Explanatory highlights ----------------------------------------------------
  // A site can be claimed by several pathways at once (the thalamus sits on two);
  // the newest claim's colour shows, and releasing it falls back.
  const claims = new Map(); // site -> [{ key, color }]
  let neutral = false;
  let labelsOn = false;

  const labels = new Map();
  for (const [site, pos] of Object.entries(LABEL_AT)) {
    const el = document.createElement("div");
    el.className = "brain-label";
    el.innerHTML = `<i></i>${SITES[site].name}`;
    const obj = new CSS2DObject(el);
    obj.position.copy(v3(pos));
    anchor.add(obj);
    labels.set(site, { obj, el });
  }

  /** Base colour + an emissive tint for explanatory highlights. */
  function lookTween(r, { color, emissive = "#000000", glow = 0 }, duration) {
    const m = r.mesh.material;
    const c = new THREE.Color(color), e = new THREE.Color(emissive);
    tweens.to(m.color, { r: c.r, g: c.g, b: c.b }, { duration });
    tweens.to(m.emissive, { r: e.r, g: e.g, b: e.b }, { duration });
    tweens.to(m, { emissiveIntensity: glow }, { duration });
  }

  function restingLook(r) {
    return { color: neutral ? NEUTRAL : r.look.color };
  }

  function apply(site, duration = 600) {
    const top = claims.get(site)?.at(-1);
    for (const r of regions) {
      if (r.site !== site) continue;
      // An explanatory tint, deliberately soft: it marks a step, not "activity".
      lookTween(r, top ? { color: neutral ? NEUTRAL : r.look.color, emissive: top.color, glow: 0.55 } : restingLook(r), duration);
    }
    const node = nodes.get(site);
    if (node) {
      const { r: cr, g: cg, b: cb } = new THREE.Color(top ? top.color : neutral ? NEUTRAL : NODE_IDLE);
      tweens.to(node.color, { r: cr, g: cg, b: cb }, { duration });
      tweens.to(node, { level: top ? 1 : 0.35 }, { duration });
    }
    const label = labels.get(site);
    if (label) {
      label.el.classList.toggle("on", !!top && labelsOn);
      if (top) label.el.style.setProperty("--c", top.color);
    }
  }

  function claim(site, key, color) {
    const list = (claims.get(site) || []).filter((c) => c.key !== key);
    list.push({ key, color });
    claims.set(site, list);
    apply(site);
  }

  function release(key) {
    for (const [site, list] of claims) {
      const next = list.filter((c) => c.key !== key);
      if (next.length === list.length) continue;
      claims.set(site, next);
      apply(site);
    }
  }

  /** Mode 2 (true): every region the same calm neutral, no highlights. */
  function setNeutral(on, duration = 900) {
    neutral = on;
    claims.clear();
    for (const r of regions) lookTween(r, restingLook(r), duration);
    for (const site of nodes.keys()) apply(site, duration);
    for (const l of labels.values()) l.el.classList.remove("on");
  }

  /** The wearable's tag follows the placement (its route starts at the skin). */
  const deviceLabel = (() => {
    const el = document.createElement("div");
    el.className = "brain-label";
    el.innerHTML = `<i></i>${SITES.device.name}`;
    const obj = new CSS2DObject(el);
    anchor.add(obj);
    labels.set("device", { obj, el });
    return obj;
  })();
  function setPlacement(id) {
    const p = PLACEMENTS[id].route[0];
    deviceLabel.position.set(p[0] + (id === "ear" ? 1.4 : 2.0), p[1] - 0.9, p[2] + (id === "back" ? -0.8 : 0.8));
  }
  setPlacement("side");

  function showLabels(on) {
    labelsOn = on;
    for (const [site, l] of labels) l.el.classList.toggle("on", on && !!claims.get(site)?.length);
  }

  const opacity = { value: 1 };
  /** X-ray: the outer shell goes see-through so the deep relays and routes show. */
  function setXray(on, duration = 800) {
    for (const r of regions) {
      if (!r.look.shell) continue;
      r.mesh.material.depthWrite = !on;
      tweens.to(r.mesh.material, { opacity: on ? 0.22 : 1 }, { duration });
    }
  }

  /** Hover feedback: lift every mesh of a site (null clears). */
  function hover(site) {
    for (const r of regions) {
      const m = r.mesh.material;
      if (site && r.site === site && m.emissiveIntensity < 0.2) { m.emissive.set("#ffffff"); m.emissiveIntensity = 0.12; }
      else if (m.emissiveIntensity === 0.12) m.emissiveIntensity = 0;
    }
  }

  const strands = [
    ...paths.visual.strands, ...paths.migraine.strands,
    ...Object.values(device).flatMap((d) => [d.route, ...d.links]),
  ];

  function tick(time) {
    for (const s of strands) s.tick(time);
    for (const n of nodes.values()) {
      const pulse = n.level > 0.5 ? 0.85 + 0.15 * Math.sin(time * 5) : 1;
      n.glow.material.color.copy(n.color);
      n.glow.material.opacity = n.level * opacity.value * pulse;
      n.glow.scale.setScalar(0.5 + n.level * 0.6);
    }
  }

  const pickables = [...regions.map((r) => r.mesh), ...[...nodes.values()].map((n) => n.proxy)];

  return {
    anchor, regions, nodes, paths, device, strands, pickables,
    claim, release, setNeutral, showLabels, setXray, hover, setPlacement, tick,
  };
}
