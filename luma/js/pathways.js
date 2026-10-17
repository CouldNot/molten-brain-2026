// Glowing nerve tubes that draw themselves on, carry travelling pulses and beads,
// and report when the reveal passes a marked point (so the matching region and
// explanation can light up in sync).

import * as THREE from "three";
import { glowSprite } from "./materials.js";

const TUBE_VERT = /* glsl */ `
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vU = uv.x;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const TUBE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uReveal;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uFlow;
  uniform float uLen;
  uniform float uDash;
  varying float vU;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    if (vU > uReveal) discard;
    if (uDash > 0.5 && fract(vU * uLen * 2.5 - uTime * 0.6) > 0.5) discard;
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.4);
    float lead = smoothstep(0.06, 0.0, uReveal - vU) * step(uReveal, 0.999);
    float wave = pow(0.5 + 0.5 * sin((vU * uLen * 3.0 - uTime * 2.4) * 6.2832), 10.0) * uFlow;
    float a = 0.7 + 0.8 * f + lead * 2.2 + wave * 1.6;
    gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
  }
`;

/**
 * @param {object} o
 * @param {THREE.Vector3[]} o.points   in `parent` space
 * @param {string} o.color
 * @param {number} o.radius             in `parent` units
 * @param {number} o.unit               parent units per "nerve length" unit, so the
 *                                      pulse spacing reads the same at any scale
 */
export function createPathway({ points, color, radius, parent, unit = 1, beads = 5, beadSize = radius * 9, dashed = false }) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal", 0.5);
  const length = curve.getLength();
  const segs = Math.max(64, Math.round(points.length * 28));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uReveal: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uLen: { value: length / unit },
      uDash: { value: dashed ? 1 : 0 },
    },
    vertexShader: TUBE_VERT,
    fragmentShader: TUBE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, 10, false), mat);
  const group = new THREE.Group();
  group.add(tube);
  parent.add(group);

  // Arc-length fraction of each control point (CatmullRom maps point i to t = i/(n-1)).
  const lengths = curve.getLengths(600);
  const pointU = points.map((_, i) => {
    const t = i / (points.length - 1);
    return lengths[Math.round(t * 600)] / length;
  });

  const beadSprites = [];
  for (let i = 0; i < beads; i++) {
    const s = glowSprite(color, beadSize, 0);
    s.userData.offset = i / beads;
    group.add(s);
    beadSprites.push(s);
  }
  const headGlow = glowSprite(color, beadSize * 1.8, 0);
  group.add(headGlow);

  const state = { reveal: 0, opacity: 1, flow: 0, beads: 0 };
  const tmp = new THREE.Vector3();

  return {
    group, curve, tube, state, pointU,
    pointAt(i) { return points[i]; },
    tick(time) {
      mat.uniforms.uReveal.value = state.reveal;
      mat.uniforms.uOpacity.value = state.opacity;
      mat.uniforms.uFlow.value = state.flow;
      mat.uniforms.uTime.value = time;
      group.visible = state.opacity > 0.002 && state.reveal > 0.001;
      const drawing = state.reveal > 0.001 && state.reveal < 0.999;
      headGlow.visible = drawing;
      if (drawing) {
        curve.getPointAt(state.reveal, tmp);
        headGlow.position.copy(tmp);
        headGlow.material.opacity = state.opacity;
      }
      for (const s of beadSprites) {
        const u = ((time * 0.28) / Math.max(0.4, length / unit) + s.userData.offset) % 1;
        const vis = u < state.reveal;
        s.visible = vis && state.beads > 0.01;
        if (!s.visible) continue;
        curve.getPointAt(u, tmp);
        s.position.copy(tmp);
        s.material.opacity = state.beads * state.opacity * Math.min(1, u * 8, (1 - u) * 8);
      }
    },
    dispose() {
      parent.remove(group);
      tube.geometry.dispose();
      mat.dispose();
    },
  };
}
