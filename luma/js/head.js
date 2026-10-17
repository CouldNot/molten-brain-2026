// The hologram bust: a faint head shell and neck around the brain, the eye
// tracker and the neck wearable, mood auras and the gaze ray. The brain is the
// subject; the shell only gives the devices somewhere real to sit.
//
// Built in metres inside `rig`, which is scaled and offset so the brain's own
// coordinates ARE the world coordinates (brain origin at world 0, 1 unit ≈ 2.6 cm).

import * as THREE from "three";
import { holoMaterial, glowBasic, glowSprite } from "./materials.js";
import { ease } from "./tween.js";
import { brainToHead } from "./brain.js";
import { PLACEMENTS, BRAIN_SCALE } from "./anatomy.js";

const SHELL_COLOR = "#38d6ff";
const DEVICE_COLOR = "#b18cff";
const PAIN_COLOR = "#ff4d5e";
export const RIG_SCALE = 1 / BRAIN_SCALE;

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const Z = v(0, 0, 1);

/** Head attitudes (radians) for each beat of the story. */
export const POSES = {
  idle: [0, 0, 0],
  task: [0.02, 0, 0],
  voice: [0.06, 0, 0],
  relaxed: [-0.06, 0, 0],
  pain: [0.09, 0, 0.05],
  placeSide: [0.02, -0.35, -0.05],
  placeEar: [0, -0.3, -0.04],
  placeBack: [0.08, 0.5, 0],
};

export function createHead(tweens) {
  const rig = new THREE.Group();
  rig.name = "bust";
  rig.scale.setScalar(RIG_SCALE);

  // Front faces only: a double-sided shell doubles its glow and veils the brain.
  const shellMat = holoMaterial({ color: SHELL_COLOR, base: 0.0, rim: 0.34, power: 3.2 });
  const neckMat = holoMaterial({ color: SHELL_COLOR, base: 0.0, rim: 0.26, power: 2.8 });
  shellMat.side = THREE.FrontSide;
  neckMat.side = THREE.FrontSide;
  // No head outline: the brain is the subject. The (invisible) frame still
  // carries the eye tracker and the wearable.
  shellMat.visible = false;
  neckMat.visible = false;

  // One rigid bust pivoting at the neck base, so the neck devices and the
  // brain's nerve routes (which run down into the neck) always stay aligned.
  const NECK = 0.2;
  const headPivot = new THREE.Object3D();
  rig.add(headPivot);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.042, NECK, 40, 1, true), neckMat);
  neck.position.y = NECK / 2;
  headPivot.add(neck);
  const headCenter = new THREE.Object3D();
  headCenter.position.set(0, NECK + 0.1, 0);
  headPivot.add(headCenter);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), shellMat);
  shell.scale.set(0.094, 0.118, 0.122);
  headCenter.add(shell);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), shellMat);
    ear.scale.set(0.01, 0.026, 0.017);
    ear.position.set(s * 0.093, -0.013, -0.006);
    headCenter.add(ear);
  }
  // A suggestion of a face: nose ridge and jaw line, so it reads as a person.
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.034, 16, 1, true), shellMat);
  nose.rotation.x = Math.PI / 2 + 0.35;
  nose.position.set(0, -0.032, 0.125);
  headCenter.add(nose);
  const jaw = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.003, 8, 48, Math.PI), shellMat);
  jaw.rotation.set(Math.PI / 2, 0, Math.PI);
  jaw.position.set(0, -0.085, 0.02);
  jaw.scale.set(1, 1.15, 1);
  headCenter.add(jaw);

  // Brain origin -> world origin.
  const brainOrigin = headCenter.position.clone().add(brainToHead([0, 0, 0]));
  rig.position.copy(brainOrigin).multiplyScalar(-RIG_SCALE);

  // ---- Attitude ---------------------------------------------------------------
  const cur = v(0, 0, 0);
  const extra = { headYaw: 0 };
  function pose(name, duration = 900) {
    const [x, y, z] = POSES[name] || POSES.idle;
    return tweens.to(cur, { x, y, z }, { duration });
  }
  function snapPose(name) { cur.set(...(POSES[name] || POSES.idle)); }

  // ---- Accessories -------------------------------------------------------------
  const glasses = createGlasses();
  const glassesMount = new THREE.Object3D();
  glassesMount.position.set(0, -0.019, 0.128);
  headCenter.add(glassesMount);

  /** Mounts: the ear rides the head; neck placements ride the (still) neck. */
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
  let placement = "side";

  const auras = createAuras();
  headCenter.add(auras.group);

  function wear(obj, mount) {
    mount.add(obj);
    obj.position.set(0, 0, 0);
    obj.quaternion.identity();
    obj.scale.setScalar(1);
  }

  /** Fly an accessory from a floating spot (world) onto its mount. */
  async function flyOn(obj, mount, fromWorld, duration = 1300) {
    const scene = rig.parent;
    scene.add(obj);
    obj.visible = true;
    obj.scale.setScalar(RIG_SCALE);
    obj.position.copy(fromWorld);
    const startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, -0.8, 0.2));
    obj.quaternion.copy(startQ);
    const start = obj.position.clone();
    const end = v(0, 0, 0);
    const endQ = new THREE.Quaternion();
    await tweens.run((t) => {
      mount.getWorldPosition(end);
      mount.getWorldQuaternion(endQ);
      obj.position.lerpVectors(start, end, t);
      obj.position.y += Math.sin(t * Math.PI) * 2.5;
      obj.quaternion.slerpQuaternions(startQ, endQ, t);
    }, { duration, easing: ease.inOut });
    wear(obj, mount);
  }

  function setPlacement(id) {
    placement = id;
    device.setShape(id, mounts[id].skin);
    if (device.object.visible && device.object.parent !== rig.parent) wear(device.object, mounts[id].node);
  }
  setPlacement(placement);

  const gaze = createGaze();

  function tick(dt, time) {
    const breathe = Math.sin(time * 1.4) * 0.006;
    headPivot.rotation.set(cur.x + breathe, cur.y + extra.headYaw, cur.z);
    rig.updateMatrixWorld(true);
    glasses.tick(time);
    device.tick(dt, time);
    auras.tick(time);
    gaze.update(glasses.object, time);
  }

  return {
    root: rig, headCenter, glasses, device, auras, gaze, extra,
    mats: { shell: shellMat, neck: neckMat },
    pose, snapPose,
    get placement() { return placement; },
    async putOnGlasses(fromWorld) { await flyOn(glasses.object, glassesMount, fromWorld); },
    wearGlasses() { glasses.object.visible = true; wear(glasses.object, glassesMount); },
    removeGlasses() { glasses.object.visible = false; },
    setPlacement,
    async putOnDevice(fromWorld) { await flyOn(device.object, mounts[placement].node, fromWorld, 1500); },
    wearDevice() { device.object.visible = true; wear(device.object, mounts[placement].node); },
    removeDevice() { device.object.visible = false; device.setVibrating(false); },
    podWorld: (out = v(0, 0, 0)) => device.pod.getWorldPosition(out),
    /** Shell + neck visibility, 0..1. */
    setShell(value, duration = 900) {
      return Promise.all([
        tweens.to(shellMat.uniforms.uOpacity, { value }, { duration }),
        tweens.to(neckMat.uniforms.uOpacity, { value }, { duration }),
      ]);
    },
    tick,
  };
}

// ---- Eye tracker + clip-on motion sensor --------------------------------------------

function createGlasses() {
  const g = new THREE.Group();
  g.name = "eye-tracker";
  const frame = glowBasic("#bfefff", 0.5);
  const lensTint = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#2fd0ff"), transparent: true, opacity: 0.16,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
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
    const cam = glowSprite("#56f0ff", 0.022, 0.9);
    cam.position.set(s * 0.05, -0.02, 0.004);
    g.add(cam);
  }
  const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.009, 0.0022, 6, 16, Math.PI), frame);
  bridge.position.set(0, 0.006, 0);
  g.add(bridge);
  const imuMat = glowBasic("#ffd28a", 0.6);
  const imu = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.016, 0.03), imuMat);
  imu.position.set(-0.098, 0.004, -0.04);
  g.add(imu);
  const led = glowSprite("#ffc35a", 0.04, 0.9);
  led.position.set(-0.104, 0.01, -0.03);
  g.add(led);
  g.visible = false;
  return {
    object: g,
    /** Dim the frame so it never hides the brain behind it. */
    setOpacity(v) { frame.opacity = 0.5 * v; lensTint.opacity = 0.16 * v; imuMat.opacity = 0.6 * v; },
    tick(time) { led.material.opacity = 0.5 + 0.5 * Math.sin(time * 4.0) ** 2; },
  };
}

// ---- Neck wearable ----------------------------------------------------------------------

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
  return ringTex;
}

function createDevice() {
  const g = new THREE.Group();
  g.name = "wearable";
  const bandMat = holoMaterial({ color: DEVICE_COLOR, base: 0.07, rim: 0.85, power: 1.6 });
  const puckMat = glowBasic("#d9c7ff", 0.55);

  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.005, 10, 56, Math.PI * 1.6), bandMat);
  collar.rotation.x = Math.PI / 2;
  g.add(collar);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.003, 8, 32, Math.PI * 1.2), bandMat);
  hook.rotation.y = Math.PI / 2;
  g.add(hook);

  const pod = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.02, 4, 12), bandMat);
  body.userData.site = "device";
  body.userData.info = "device";
  pod.add(body);
  const pucks = [-1, 1].map((s) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 20), puckMat);
    p.rotation.x = Math.PI / 2;
    p.position.set(0, s * 0.011, -0.006);
    pod.add(p);
    return p;
  });
  g.add(pod);
  const glow = glowSprite(DEVICE_COLOR, 0.07, 0);
  pod.add(glow);
  const ripples = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: ringTexture(), color: new THREE.Color(DEVICE_COLOR), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    s.userData.phase = i / 4;
    pod.add(s);
    ripples.push(s);
  }

  let level = 0;
  let target = 0;
  let pattern = () => 1;
  g.visible = false;

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
    setPattern(fn) { pattern = fn; },
    get level() { return level * pattern(performance.now() / 1000); },
    tick(dt, time) {
      level += (target - level) * Math.min(1, dt * 4);
      const env = level * pattern(time);
      glow.material.opacity = env * 0.9;
      for (const p of pucks) p.position.z = -0.006 + env * Math.sin(time * 90) * 0.0008;
      for (const r of ripples) {
        const k = (time * 0.9 + r.userData.phase) % 1;
        r.scale.setScalar(0.03 + k * 0.2);
        r.material.opacity = env * (1 - k) * 0.8;
      }
    },
  };
}

// ---- Mood auras + voice rings ----------------------------------------------------------

function createAuras() {
  const group = new THREE.Group();
  // Pain: rings pulsing out from behind the right eye, where the persona hurts.
  const TEMPLE = v(0.062, 0.0, 0.086);
  const temple = glowSprite(PAIN_COLOR, 0.09, 0);
  temple.position.copy(TEMPLE);
  group.add(temple);
  const painRings = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: new THREE.Color(PAIN_COLOR), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.copy(TEMPLE);
    s.userData.phase = i / 3;
    group.add(s);
    return s;
  });
  const calmMat = new THREE.SpriteMaterial({ map: ringTexture(), color: new THREE.Color("#5ff2c8"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Sprite(calmMat);
  group.add(halo);
  const voice = [0, 1, 2].map((i) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ringTexture(), color: new THREE.Color("#4fe3ff"), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.position.set(0, -0.07, 0.14);
    s.userData.phase = i / 3;
    group.add(s);
    return s;
  });

  const state = { pain: 0, calm: 0, voice: 0 };
  return {
    group, state,
    tick(time) {
      const throb = 0.5 + 0.5 * Math.max(0, Math.sin(time * 4.2)) ** 3;
      temple.material.opacity = state.pain * throb * 0.85;
      for (const s of painRings) {
        const k = (time * 0.7 + s.userData.phase) % 1;
        s.scale.setScalar(0.03 + k * 0.13);
        s.material.opacity = state.pain * (1 - k) * 0.55;
      }
      const breath = 0.5 + 0.5 * Math.sin(time * 1.1);
      halo.scale.setScalar(0.27 + breath * 0.02);
      calmMat.opacity = state.calm * (0.08 + 0.1 * breath);
      for (const s of voice) {
        const k = (time * 0.8 + s.userData.phase) % 1;
        s.scale.setScalar(0.03 + k * 0.1);
        s.material.opacity = state.voice * (1 - k) * 0.7;
      }
    },
  };
}

// ---- Gaze ray (world units) -----------------------------------------------------------

function createGaze() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#56f0ff"), transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 32, 1, true), mat);
  cone.geometry.translate(0, -0.5, 0);
  cone.geometry.rotateX(-Math.PI / 2);
  group.add(cone);
  const dot = glowSprite("#9ff6ff", 2.2, 0);
  group.add(dot);
  const state = { opacity: 0, target: v(0, -1, 30) };
  const from = v(0, 0, 0);
  return {
    group, state,
    update(glasses, time) {
      const on = state.opacity > 0.001 && glasses.visible;
      cone.visible = dot.visible = on;
      if (!on) return;
      glasses.getWorldPosition(from);
      const len = from.distanceTo(state.target);
      cone.position.copy(from);
      cone.lookAt(state.target);
      cone.scale.set(len * 0.1, len * 0.1, len);
      mat.opacity = state.opacity * (0.07 + 0.03 * Math.sin(time * 3));
      dot.position.copy(state.target);
      dot.material.opacity = state.opacity * 0.9;
    },
  };
}
