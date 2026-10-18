// Run Haptiq's existing scene script with the same-origin Three.js bundle.
import * as THREE from "../vendor/three/three.module.js";
window.THREE = THREE;
await import("./scenes.js");
if (document.getElementById("runBtn")) await import("./main.js");
if (document.getElementById("monthlyChart")) await import("./dashboard.js" + new URL(import.meta.url).search);
