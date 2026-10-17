// Renderer, camera, bloom, controls and the ambient environment (grid floor,
// drifting dust). Everything else adds itself to `stage.scene`.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const BG = new THREE.Color("#02060d");
export const FLOOR_Y = -12.0;

export function createStage(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  host.appendChild(renderer.domElement);

  const labels = new CSS2DRenderer();
  labels.domElement.className = "label-layer";
  host.appendChild(labels.domElement);

  const scene = new THREE.Scene();
  scene.background = BG.clone();
  scene.fog = new THREE.FogExp2(BG, 0.006);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  camera.position.set(34, 8, 46);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, -2, 0);
  controls.minDistance = 6;
  controls.maxDistance = 160;
  controls.enablePan = false;

  // Lighting matches molten-brain's viewer: soft ambient, a key and a cool fill.
  scene.add(new THREE.HemisphereLight("#dfe9ff", "#2a2030", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(30, 50, 40);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#9fb8ff", 0.8);
  fill.position.set(-40, -20, -30);
  scene.add(fill);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.3, 0.4, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const floor = createFloor();
  scene.add(floor.mesh);
  const dust = createDust();
  scene.add(dust.points);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function render(time) {
    floor.tick(time);
    dust.tick(time);
    controls.update();
    composer.render();
    labels.render(scene, camera);
  }

  return { renderer, scene, camera, controls, bloom, floor, dust, render, background: scene.background };
}

/** Infinite-looking glowing grid with a radial fade, scrollable for walking. */
function createFloor() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color("#2bb8ff") },
      uWarm: { value: new THREE.Color("#ffb347") },
      uWarmMix: { value: 0 },
      uScroll: { value: 0 },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform vec3 uWarm; uniform float uWarmMix;
      uniform float uScroll; uniform float uOpacity; uniform float uTime;
      varying vec2 vPos;
      float grid(vec2 p, float size) {
        vec2 g = abs(fract(p / size - 0.5) - 0.5) / fwidth(p / size);
        return 1.0 - min(min(g.x, g.y), 1.0);
      }
      void main() {
        vec2 p = vec2(vPos.x, vPos.y - uScroll);
        float r = length(vPos);
        float fade = smoothstep(4.5, 0.4, r);
        float g = grid(p, 0.25) * 0.35 + grid(p, 1.0) * 0.55;
        // Concentric pulse ring travelling outward from the projector.
        float ring = smoothstep(0.03, 0.0, abs(r - mod(uTime * 0.35, 4.0))) * 0.35;
        float pad = smoothstep(0.62, 0.55, r) * smoothstep(0.45, 0.6, r) * 0.6;
        vec3 col = mix(uColor, uWarm, uWarmMix);
        float a = (g + ring + pad) * fade * uOpacity;
        gl_FragColor = vec4(col * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), mat);
  mesh.rotation.x = -Math.PI / 2;
  // World units are brain units (see js/head.js): the projector floor sits under the neck.
  mesh.scale.setScalar(6);
  mesh.position.y = FLOOR_Y;
  mesh.renderOrder = -1;
  return {
    mesh, uniforms: mat.uniforms,
    tick(time) { mat.uniforms.uTime.value = time; },
  };
}

function createDust() {
  const N = 700;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const r = 0.6 + Math.random() * 5;
    const a = Math.random() * Math.PI * 2;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.random() * 3.2;
    pos[i * 3 + 2] = Math.sin(a) * r;
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color("#7fd8ff") }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed; uniform float uTime; varying float vA;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.02 + seed * 0.05), 3.2);
        p.x += sin(uTime * 0.3 + seed * 20.0) * 0.05;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (1.5 + seed * 2.5) * (90.0 / -mv.z);
        vA = 0.25 + 0.75 * fract(seed * 7.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * 0.5 * uOpacity;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.scale.setScalar(7);
  points.position.y = FLOOR_Y;
  return { points, uniforms: mat.uniforms, tick(time) { mat.uniforms.uTime.value = time; } };
}
