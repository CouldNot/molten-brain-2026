// Shared hologram look: additive fresnel shells (no depth write, so overlapping
// transparent parts never need sorting) plus a soft glow sprite texture.

import * as THREE from "three";

const HOLO_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const HOLO_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uBase;
  uniform float uRim;
  uniform float uPower;
  uniform float uTime;
  uniform float uScan;
  uniform float uPulse;
  uniform float uHover;
  varying vec3 vNormal;
  varying vec3 vView;
  varying vec3 vWorld;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), uPower);
    // A thin scanline band sweeping upward, the classic hologram tell.
    float band = (1.0 - smoothstep(0.0, 0.025, abs(fract(vWorld.y * 2.0 - uTime * 0.3) - 0.5))) * uScan;
    float a = uBase + uRim * f + band * 0.5 + uHover * (0.1 + 0.6 * f);
    a *= 1.0 + uPulse * (0.6 + 0.4 * sin(uTime * 6.0));
    gl_FragColor = vec4(uColor * a * uOpacity, 1.0);
  }
`;

/** Additive fresnel hologram material. All knobs are uniforms so they tween. */
export function holoMaterial({ color = "#38d6ff", opacity = 1, base = 0.05, rim = 1.0, power = 2.2, scan = 0.0 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uBase: { value: base },
      uRim: { value: rim },
      uPower: { value: power },
      uTime: { value: 0 },
      uScan: { value: scan },
      uPulse: { value: 0 },
      uHover: { value: 0 },
    },
    vertexShader: HOLO_VERT,
    fragmentShader: HOLO_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  mat.userData.holo = true;
  return mat;
}

/** Plain additive colour, for cores, lines and glints. */
export function glowBasic(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
}

let glowTex = null;
/** Radial falloff texture shared by every glow sprite. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color: new THREE.Color(color), transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(size);
  return s;
}

/** Advance `uTime` on every hologram material under `root`. */
export function tickHolo(root, time) {
  root.traverse((o) => {
    const m = o.material;
    if (m?.userData?.holo) m.uniforms.uTime.value = time;
  });
}
