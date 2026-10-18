// Renderer, camera, controls and lights on Haptiq's navy. The background stays
// opaque because the pathway tubes blend additively. Everything else adds
// itself to `stage.scene`.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { HAPTIQ } from "./palette.js";

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
  scene.background = new THREE.Color(HAPTIQ.navy);

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
  camera.position.set(15, 1.5, 15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, -2.2, -0.4);
  controls.minDistance = 6;
  controls.maxDistance = 60;
  controls.enablePan = false;

  // Lighting matches molten-brain's viewer: soft ambient, a key and a cool fill.
  scene.add(new THREE.HemisphereLight("#dfe9ff", "#2a2030", 0.9));
  const key = new THREE.DirectionalLight("#ffffff", 2.2);
  key.position.set(30, 50, 40);
  scene.add(key);
  const fill = new THREE.DirectionalLight("#9fb8ff", 0.8);
  fill.position.set(-40, -20, -30);
  scene.add(fill);

  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    labels.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function render() {
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  }

  return { renderer, scene, camera, controls, render };
}
