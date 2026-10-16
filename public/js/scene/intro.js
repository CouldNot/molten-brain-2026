// The launch intro: hold, rotate, then assemble the exploded brain.

import * as THREE from "three";
import { applyExplode } from "./explode.js";

// Intro animation: on a plain page load the brain starts fully blown out and
// settles together into the assembled whole, the camera pulling in from the
// spread (like dragging the Separate slider 1 -> 0). It runs as three beats
// rather than all at once, because rotating AND re-laying-out the whole brain in
// the same frames is more than a modest GPU can keep smooth:
//   1. INTRO_HOLD_MS   still on the blown-out pose (the first frames after the
//                      overlay fades pay for the shader compiles and the first
//                      draw of every mesh; moving through them read as a stutter)
//   2. INTRO_ROTATE_MS the camera alone sweeps INTRO_ROTATION_TURNS of a turn in
//                      to the resting orientation (no geometry moves)
//   3. INTRO_PAUSE_MS  a beat on the resting angle, so the two moves read as two
//   4. INTRO_ASSEMBLE_MS the regions alone glide back together (camera azimuth
//                      parked; only the distance tracks the spread)
// Each beat is eased on its own, so it departs and arrives smoothly.
export const INTRO_HOLD_MS = 1000;

export const INTRO_ROTATE_MS = 2000;

export const INTRO_PAUSE_MS = 300;

export const INTRO_ASSEMBLE_MS = 2400;

// How much of a full turn the camera sweeps during the intro before settling on
// the resting orientation (0.75 = three-quarters of a revolution).
export const INTRO_ROTATION_TURNS = 0.75;

/**
 * Auto-play intro: start the regions fully blown out and let them glide back
 * together into the assembled brain, exactly like dragging the Separate slider
 * from 1 to 0, the camera following the spread (zoomForExplode, so the brain
 * keeps a steady apparent size). The camera's INTRO_ROTATION_TURNS sweep runs
 * BEFORE that, as its own beat (see the INTRO_* constants): the two moves cost
 * too much together to stay smooth, and separated they also read as two.
 * Advanced once per frame by `tick()` from the render loop. `cancel()` stops it
 * (and restores auto-rotate) so a manual grab of the explode slider always wins.
 * Uses easeInOutCubic for a smooth departure + gentle settle.
 * @param {{meshes:THREE.Mesh[], arrows:object[], slider:HTMLInputElement,
 *   camera:THREE.PerspectiveCamera, controls:OrbitControls,
 *   focus:ReturnType<typeof createCameraFocus>,
 *   retrim:ReturnType<typeof createArrowRetrim>,
 *   onSettle?:(completed:boolean)=>void}} deps
 */
export function createIntroAnimation({ meshes, arrows, slider, camera, controls, focus, retrim, onSettle }) {
  const FROM = 1; // fully blown out (slider max)
  const TO = 0; // assembled whole
  const SWEEP = INTRO_ROTATION_TURNS * Math.PI * 2; // radians to sweep in
  let startTime = null; // set on the first tick so load jank isn't counted
  let running = false;
  let restAzimuth = 0; // azimuth/polar of the resting pose to land on at t=1
  let restPolar = 0;
  let wasAutoRotate = false; // restored when the intro ends / is cancelled
  let lastAmount = null; // last spread applied, so a still beat re-lays out nothing
  const tmpOffset = new THREE.Vector3();
  const sph = new THREE.Spherical();
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  // easeInOutCubic: starts and ends at rest, fastest through the middle.
  const ease = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // `fast` re-fits the arrows cheaply (cached offsets, no surface re-scan), the
  // same deal the manual spread takes: the precise re-trim then runs once the
  // assemble has settled. The per-frame scans were ~90% of an explode frame, so
  // paying them here is what made the assemble stutter.
  const applyAmount = (amount, fast = false) => {
    // Set the slider directly (no input event) so this doesn't trip the
    // user-input cancel listener wired alongside it.
    slider.value = String(amount);
    applyExplode(meshes, amount, arrows, fast);
    if (fast && retrim) retrim.markDirty();
  };

  // We drive the rotation ourselves during the intro, so OrbitControls' own
  // auto-rotate must be off until we hand back at the end (or on cancel).
  // Either way the launch is over, so `onSettle` always fires; its `completed`
  // flag tells a natural finish (the assemble ran to the end) from a cancel
  // (slider grab / deep link). One callback with a flag rather than a
  // natural-finish-only hook, because the two follow-ons want different things:
  // the guided tour must not auto-start over a user's own action, while the
  // "What's new" popup still has to appear on a load the user interrupted.
  const finish = (completed) => {
    running = false;
    controls.autoRotate = wasAutoRotate;
    if (onSettle) onSettle(completed);
  };

  return {
    start() {
      running = true;
      startTime = null;
      wasAutoRotate = controls.autoRotate;
      controls.autoRotate = false;
      // Capture the resting camera azimuth/polar so the sweep lands exactly on
      // the default view; only azimuth + distance animate (polar held fixed).
      tmpOffset.copy(camera.position).sub(controls.target);
      sph.setFromVector3(tmpOffset);
      restAzimuth = sph.theta;
      restPolar = sph.phi;
      // The one precise lay-out of the run: the blown-out pose is held long
      // enough (hold + sweep + pause) to be worth trimming properly.
      applyAmount(FROM);
      lastAmount = FROM;
    },
    cancel() {
      if (!running) return;
      // Cancelled before its first frame (an automated `?ui=0` launch starts the intro
      // at once, then a URL fragment cancels it): start() has already blown the brain
      // apart with no camera pull-back yet, so put it back together rather than leave
      // that half-applied pose on screen.
      if (startTime === null) applyAmount(TO);
      finish(false);
    },
    tick() {
      if (!running) return false;
      if (startTime === null) startTime = performance.now();
      // Elapsed is negative through the INTRO_HOLD_MS hold, which clamps both
      // beats to 0, so the brain sits still (fully blown out, at the far end of
      // the sweep) while those first expensive frames are drawn.
      const elapsed = performance.now() - startTime - INTRO_HOLD_MS;
      // Beat 1: the camera sweep. Beat 2: the assemble, INTRO_PAUSE_MS later.
      const rot = clamp01(elapsed / INTRO_ROTATE_MS);
      const asm = clamp01(
        (elapsed - INTRO_ROTATE_MS - INTRO_PAUSE_MS) / INTRO_ASSEMBLE_MS,
      );
      const eRot = ease(rot);
      const amount = FROM + (TO - FROM) * ease(asm);
      // Only re-lay-out the brain when the spread actually changed: during the
      // sweep + the pause the amount is pinned at FROM, so those frames cost a
      // camera move and nothing else (which is the point of splitting them).
      if (amount !== lastAmount) {
        applyAmount(amount, true);
        lastAmount = amount;
      }
      // Camera distance tracks the spread (telescoping back to the resting
      // distance at amount 0), exactly like the Separate slider does.
      focus.zoomForExplode(amount);
      // Sweep the azimuth in toward the resting angle; hold the polar + the
      // distance zoomForExplode just set.
      tmpOffset.copy(camera.position).sub(controls.target);
      sph.setFromVector3(tmpOffset);
      sph.theta = restAzimuth - (1 - eRot) * SWEEP;
      sph.phi = restPolar;
      sph.makeSafe();
      tmpOffset.setFromSpherical(sph);
      camera.position.copy(controls.target).add(tmpOffset);
      if (asm >= 1) finish(true);
      return true; // animating (incl. the finishing frame), so keep rendering
    },
  };
}
