// Adaptive quality: step pixel ratio, then dot/bead counts, down on slow animating
// frames and back up with hysteresis.

import { animSettings } from "../anim-settings.js";

/**
 * Adaptive-quality controller: watches the frame time while the scene is animating
 * and, if it stays slow, steps the shared `animSettings.quality` DOWN (and steps it
 * back UP once frames recover). Quality's dominant effect is the renderer's
 * devicePixelRatio (fewer pixels shaded per frame = the biggest cheap win against
 * the additive-glow overdraw of the gem/wash animations); the gem-dot + circuit-bead
 * builders also read it to scatter fewer primitives on the next focus.
 *
 * It only samples frames the loop actually *rendered* while animating (an idle frame
 * costs nothing and would skew the timing), and uses hysteresis (needs several slow
 * frames in a row to drop, many good ones to recover) plus a comfortable middle band
 * so it settles instead of oscillating. `tick(rendered)` is called once per frame
 * from the render loop with whether an animated render happened; it returns true when
 * it changed the level (so the loop repaints at the new pixel ratio).
 * @param {{renderer:THREE.WebGLRenderer, baseDpr:number}} deps
 */
export function createAdaptiveQuality({ renderer, baseDpr }) {
  const MIN_Q = 0.6;       // never below 60% detail / pixel ratio
  const STEP = 0.1;
  const SLOW_MS = 30;      // a frame slower than this (~<33fps) counts as "slow"
  const FAST_MS = 20;      // a frame faster than this (~>50fps) counts as "fast"
  const SLOW_FRAMES = 20;  // this many slow frames in a row -> step down
  const FAST_FRAMES = 90;  // this many fast frames in a row -> step back up
  let lastT = null;
  let slow = 0;
  let fast = 0;

  // three's setPixelRatio re-applies the stored CSS size internally, and a later
  // renderer.setSize (the resize handler) keeps this ratio, so setting it here is
  // enough; no resize re-apply is needed.
  const applyDpr = () => renderer.setPixelRatio(baseDpr * animSettings.quality);

  return {
    tick(rendered) {
      // Only measure while continuously animating: an idle frame is an early-out
      // (no render), so its huge delta must not be read as a slow render.
      if (!rendered) {
        lastT = null;
        return false;
      }
      const now = performance.now();
      if (lastT === null) {
        lastT = now;
        return false;
      }
      const dt = now - lastT;
      lastT = now;
      if (dt > SLOW_MS) {
        slow += 1;
        fast = 0;
      } else if (dt < FAST_MS) {
        fast += 1;
        slow = 0;
      } else {
        slow = 0; // comfortable band: reset both, hold the current level
        fast = 0;
      }
      if (slow >= SLOW_FRAMES && animSettings.quality > MIN_Q) {
        animSettings.setQuality(Math.max(MIN_Q, animSettings.quality - STEP));
        applyDpr();
        slow = 0;
        return true;
      }
      if (fast >= FAST_FRAMES && animSettings.quality < 1) {
        animSettings.setQuality(Math.min(1, animSettings.quality + STEP));
        applyDpr();
        fast = 0;
        return true;
      }
      return false;
    },
  };
}
