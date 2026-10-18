// The hidden head frame that carries the Neon eye tracker and the DataFeel
// wearable. Nothing of the head itself is drawn: the brain is the subject, and
// the frame only gives the devices somewhere real to sit.
//
// Built in metres inside `rig`, which is scaled and offset so the brain's own
// coordinates ARE the world coordinates (brain origin at world 0, 1 unit ≈ 2.6 cm).

import * as THREE from "three";
import { glowSprite } from "./materials.js";
import { brainToHead } from "./brain.js";
import { PLACEMENTS, BRAIN_SCALE } from "./anatomy.js";
import { HAPTIQ } from "./palette.js";

export const RIG_SCALE = 1 / BRAIN_SCALE;

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const Z = v(0, 0, 1);

/** Solid, lit device material in a brand colour; `opacity` lets it step back. */
function deviceMaterial(color, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(color), roughness: 0.45, metalness: 0.1,
    emissive: new THREE.Color(color), emissiveIntensity: 0.18,
    transparent: opacity < 1, opacity,
  });
}

export function createHead() {
  const rig = new THREE.Group();
  rig.name = "head-frame";
  rig.scale.setScalar(RIG_SCALE);

  // One rigid frame pivoting at the neck base, so the neck devices and the
  // brain's nerve routes (which run down into the neck) always stay aligned.
  const NECK = 0.2;
  const headPivot = new THREE.Object3D();
  rig.add(headPivot);
  const headCenter = new THREE.Object3D();
  headCenter.position.set(0, NECK + 0.1, 0);
  headPivot.add(headCenter);

  // Brain origin -> world origin.
  const brainOrigin = headCenter.position.clone().add(brainToHead([0, 0, 0]));
  rig.position.copy(brainOrigin).multiplyScalar(-RIG_SCALE);

  const glasses = createGlasses();
  glasses.object.position.set(0, -0.019, 0.128);
  headCenter.add(glasses.object);

  /** Mounts: the ear rides the head; neck placements ride the neck. */
  const mounts = {};
  for (const [id, pl] of Object.entries(PLACEMENTS)) {
    const skin = brainToHead(pl.route[0]); // headCenter frame
    const node = new THREE.Object3D();
    if (id === "ear") {
      node.position.copy(skin);
      headCenter.add(node);
    } else {
      node.position.set(0, headCenter.position.y + skin.y, 0);
      headPivot.add(node);
    }
    mounts[id] = { node, skin };
  }
  const device = createDevice();

  function setPlacement(id) {
    device.setShape(id, mounts[id].skin);
    mounts[id].node.add(device.object);
  }
  setPlacement("side");

  return {
    root: rig, headCenter, glasses, device, setPlacement,
    /** Show or hide both devices (the results view is deliberately bare). */
    setVisible(on) { glasses.object.visible = on; device.object.visible = on; },
    tick(dt, time) {
      glasses.tick(time);
      device.tick(dt, time);
    },
  };
}

// ---- Neon eye tracker ----------------------------------------------------------------

function createGlasses() {
  const g = new THREE.Group();
  g.name = "neon";
  // Dimmed so the frame never hides the eyes and visual pathway behind it.
  const frame = deviceMaterial(HAPTIQ.cream, 0.45);
  const lensTint = new THREE.MeshBasicMaterial({
    color: new THREE.Color(HAPTIQ.taupe), transparent: true, opacity: 0.08,
    depthWrite: false, side: THREE.DoubleSide,
  });
  for (const s of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0028, 8, 40), frame);
    rim.scale.set(1.15, 0.82, 1);
    rim.position.set(s * 0.035, 0, 0);
    g.add(rim);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.025, 32), lensTint);
    lens.scale.set(1.15, 0.82, 1);
    lens.position.copy(rim.position);
    g.add(lens);
    const temple = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.0045, 0.13), frame);
    temple.position.set(s * 0.093, 0.006, -0.064);
    g.add(temple);
    const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0035, 0.0035), frame);
    hinge.position.set(s * 0.078, 0.006, 0.0);
    g.add(hinge);
    // Neon's eye cameras sit under each lens.
    const cam = glowSprite(HAPTIQ.cream, 0.018, 0.6);
    cam.position.set(s * 0.05, -0.02, 0.004);
    g.add(cam);
  }
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 16, Math.PI), frame);
  bridge.position.set(0, 0.006, 0);
  g.add(bridge);
  const led = glowSprite(HAPTIQ.taupe, 0.03, 0.8);
  led.position.set(-0.098, 0.01, -0.03);
  g.add(led);
  return {
    object: g,
    tick(time) { led.material.opacity = 0.4 + 0.4 * Math.sin(time * 4.0) ** 2; },
  };
}

// ---- DataFeel wearable --------------------------------------------------------------------

let ringTex = null;
function ringTexture() {
  if (ringTex) return ringTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "white";
  g.lineWidth = 5;
  g.shadowColor = "white";
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  ringTex = new THREE.CanvasTexture(c);
  ringTex.colorSpace = THREE.SRGBColorSpace;
  return ringTex;
}

function createDevice() {
  const g = new THREE.Group();
  g.name = "datafeel";
  const bandMat = deviceMaterial(HAPTIQ.slate);
  const podMat = deviceMaterial(HAPTIQ.cream);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.004, 10, 56, Math.PI * 1.6), bandMat);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 32, Math.PI * 1.2), bandMat);
  hook.rotation.y = Math.PI / 2;
  g.add(hook);

  const pod = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.02, 4, 12), podMat);
  body.userData.site = "device";
  body.userData.info = "device";
  pod.add(body);
  g.add(pod);
  const glow = glowSprite(HAPTIQ.cream, 0.06, 0);
  pod.add(glow);
  // Vibration ripples spreading over the skin from the pod.
  const ripples = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTexture(), color: new THREE.Color(HAPTIQ.cream), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.userData.phase = i / 3;
    pod.add(s);
    ripples.push(s);
  }

  let level = 0;
  let target = 0;

  return {
    object: g, pod, pickable: body,
    setShape(id, skin) {
      collar.visible = id !== "ear";
      hook.visible = id === "ear";
      if (id === "ear") {
        pod.position.set(0.006, 0, 0);
        pod.quaternion.setFromUnitVectors(Z, v(1, 0, 0));
        hook.position.set(0.002, 0.01, -0.004);
        return;
      }
      collar.rotation.z = id === "back" ? Math.PI * 0.7 : -Math.PI * 0.3;
      const out = v(skin.x, 0, skin.z).normalize();
      pod.position.copy(out).multiplyScalar(0.041);
      pod.quaternion.setFromUnitVectors(Z, out);
    },
    setVibrating(on) { target = on ? 1 : 0; },
    tick(dt, time) {
      level += (target - level) * Math.min(1, dt * 4);
      // A slow on/off rhythm, so it reads as a pattern rather than a constant buzz.
      const env = level * (0.55 + 0.45 * Math.sin(time * 2.2) ** 2);
      glow.material.opacity = env * 0.8;
      for (const r of ripples) {
        const k = (time * 0.9 + r.userData.phase) % 1;
        r.scale.setScalar(0.03 + k * 0.16);
        r.material.opacity = env * (1 - k) * 0.6;
      }
    },
  };
}
