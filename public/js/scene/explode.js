// The explode layout: regions pushed radially apart by the slider, the arrows that
// follow (fast during a spread, re-trimmed once it settles), their constant apparent
// width under zoom, and the auto-spread that eases the slider.

import * as THREE from "three";

// Explode slider is 0..1; this is how much extra radial distance the most
// outward regions travel at slider = 1 (as a multiple of their base distance
// from the brain center). Large enough that full separation spreads the regions
// well apart (the deep nuclei get plenty of room to be inspected); the camera
// maxDistance (see initThree) is comfortably beyond the farthest region so the
// user can zoom out to see the whole spread.
export const EXPLODE_STRENGTH = 2.5;

/**
 * Position every region for a given explode amount, pushing each radially
 * outward from the brain center along its stored direction.
 * @param {THREE.Mesh[]} meshes
 * @param {number} amount  Slider value in [0, 1].
 * @param {import("./arrows.js").ProjectionArrow[]} arrows
 * @param {boolean} [fast]  Re-fit arrows cheaply (skip the surface-trim raycasts,
 *   ~90% of the cost) for a smooth continuous spread; a deferred precise re-trim
 *   (createArrowRetrim) cleans up once the spread settles.
 */
export function applyExplode(meshes, amount, arrows, fast = false) {
  for (const mesh of meshes) {
    const { base, dir } = mesh.userData;
    const distance = base.length() * amount * EXPLODE_STRENGTH;
    mesh.position.copy(base).addScaledVector(dir, distance);
  }
  // Arrows follow the moved centers.
  for (const arrow of arrows) arrow.update(fast);
}

/**
 * Deferred precise arrow re-trim for the explode path. During a continuous spread
 * the arrows are re-fit cheaply (applyExplode `fast`), which skips the surface-trim
 * raycasts and so leaves each end slightly facing the pre-spread direction. Once
 * the spread has been still for SETTLE_MS this re-trims every arrow precisely, a
 * CHUNK at a time per frame so the catch-up never lands as one hitch.
 *
 * It plugs into the render loop like the other per-frame controllers: `tick()`
 * runs every frame (the loop callback is continuous; only the render is on-demand)
 * and returns whether it changed anything, so the loop repaints the corrected
 * arrows. `markDirty()` is called after each fast spread update to (re)arm it.
 * @param {import("./arrows.js").ProjectionArrow[]} arrows
 */
export function createArrowRetrim(arrows) {
  const SETTLE_MS = 120; // re-trim this long after the last spread change
  const CHUNK = 24;      // arrows re-trimmed per frame while catching up
  let lastChange = -Infinity;
  let cursor = arrows.length; // < length while a precise pass is in flight

  return {
    /** Note a fast (imprecise) spread update; (re)start the settle timer and
     *  abandon any in-flight catch-up (it would fight the active spread). */
    markDirty() {
      lastChange = performance.now();
      cursor = arrows.length;
    },
    /** Per-frame: drive the deferred re-trim. Returns true while it has work. */
    tick() {
      if (cursor < arrows.length) {
        const end = Math.min(cursor + CHUNK, arrows.length);
        for (; cursor < end; cursor++) arrows[cursor].update(); // precise + re-caches
        return true; // arrows changed: keep rendering
      }
      if (lastChange !== -Infinity && performance.now() - lastChange >= SETTLE_MS) {
        lastChange = -Infinity;
        cursor = 0; // begin a precise pass over the next frames
        return true;
      }
      return false;
    },
  };
}

/**
 * Keep projection arrows a constant *apparent* width as the camera zooms. A
 * zoomed-in arrow would otherwise balloon and clutter the view (and a zoomed-out
 * one thin away to nothing); scaling the shaft radius + cone cross-section by the
 * camera<->target distance holds the on-screen width roughly put.
 *
 * The reference distance (width scale 1) is captured on the first tick, so the
 * resting framing keeps the authored arrow width. The explode auto-zoom
 * (zoomForExplode pulls the camera back as the brain spreads) is divided out via
 * focus.explodeZoom(), so a spread does NOT rescale arrows: it would fight the
 * per-frame explode rebuild for no visual gain (the brain holds a constant
 * apparent size while spreading anyway). Only a genuine user zoom changes width.
 *
 * Plugs into the render loop like the other controllers: tick() runs each frame
 * and returns whether it changed any arrow, so the on-demand loop repaints. A
 * width-step threshold avoids rebuilding on sub-pixel damping jitter.
 * @param {{arrows:import("./arrows.js").ProjectionArrow[], camera:THREE.PerspectiveCamera,
 *   controls:import("three/addons/controls/OrbitControls.js").OrbitControls,
 *   focus:ReturnType<typeof createCameraFocus>}} deps
 */
export function createArrowWidth({ arrows, camera, controls, focus }) {
  const MIN = 0.4;   // never thinner than 40% (stays visible zoomed all the way in)
  const MAX = 2.4;   // never fatter than 240% (zoomed all the way out)
  const STEP = 0.02; // re-fit only when the scale moves at least this much
  let refDist = null; // resting (explode-zoom-divided-out) distance = scale 1
  let applied = 1;
  const tmp = new THREE.Vector3();
  // The camera<->target distance with the explode auto-pull removed, i.e. the
  // distance the user's own zoom implies.
  const userDist = () =>
    tmp.copy(camera.position).sub(controls.target).length() / focus.explodeZoom();
  return {
    /** Per-frame: rescale every arrow to hold a constant apparent width.
     *  Returns true only when a width step was actually applied. */
    tick() {
      const dist = userDist();
      if (refDist === null) { refDist = dist; return false; }
      const scale = Math.max(MIN, Math.min(MAX, dist / refDist));
      if (Math.abs(scale - applied) < STEP) return false;
      applied = scale;
      let changed = false;
      for (const a of arrows) if (a.setWidthScale(scale)) changed = true;
      return changed;
    },
  };
}

/**
 * Auto-spread controller: smoothly drives the explode slider UP to a target
 * amount, the same thing the user would do by dragging the Separate slider, so a
 * deep (inside) structure isn't left hidden under the cortex when it is focused
 * from search / a detail panel. `apply(amount)` is the shared explode applier
 * (layout + camera re-aim + zoom), so a spread tracks the focused structure and
 * keeps the apparent size exactly like a manual drag. Advanced by `tick()` in the
 * render loop. Only ever raises the spread (never collapses it), and never lowers
 * below the current value, so it composes with whatever the user already set.
 * @param {{slider:HTMLInputElement, apply:(amount:number)=>void}} deps
 */
export function createAutoSpread({ slider, apply }) {
  const DURATION_MS = 600;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let running = false;
  let frames = []; // remaining target keyframes to visit, in order
  let segFrom = 0; // slider value at the start of the current segment
  let segStart = null; // performance.now() when the current segment began
  let segDur = DURATION_MS;
  // Start a segment from wherever the slider is now (so back-to-back segments chain).
  const beginSegment = () => { segFrom = parseFloat(slider.value); segStart = null; };
  return {
    /** Animate the spread up to `target` (0..1). No-op if already at/above it. */
    spreadTo(target) {
      const current = parseFloat(slider.value);
      if (current >= target - 1e-3) return; // already spread enough
      frames = [target];
      segDur = DURATION_MS;
      beginSegment();
      running = true;
    },
    /**
     * Play a scripted keyframe sweep from the current value through each target in
     * `keyframes` in turn (e.g. [0, 1, 0, 0.5] = down to off, out to max, back to
     * off, settle at the middle), one segment each. Used by the guided tour's
     * "Separate" demo; being
     * re-callable, a step's before() replays the whole sweep on Back->Next. Setting
     * slider.value here does NOT fire an "input" event, so it never trips the tour's
     * user-move gate.
     */
    playSequence(keyframes, { segMs = DURATION_MS } = {}) {
      if (!keyframes || !keyframes.length) return;
      frames = keyframes.slice();
      segDur = segMs;
      beginSegment();
      running = true;
    },
    /** Stop the auto-spread (a manual slider grab wins). */
    cancel() {
      running = false;
      frames = [];
    },
    tick() {
      if (!running) return false;
      if (!frames.length) { running = false; return false; }
      if (segStart === null) segStart = performance.now();
      const target = frames[0];
      const t = Math.min(1, (performance.now() - segStart) / segDur);
      const amount = segFrom + (target - segFrom) * ease(t);
      slider.value = String(amount);
      apply(amount);
      if (t >= 1) {
        frames.shift();
        if (frames.length) beginSegment(); // chain into the next keyframe
        else running = false;
      }
      return true;
    },
  };
}
