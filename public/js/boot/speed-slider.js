// Animation-speed slider (Controls > Settings): a persisted multiplier that every
// animated module applies (js/anim-settings.js `speed`). Revealed only while an
// animation is actually on screen: the render loop calls the returned
// `updateSpeedRow` each rendered frame, so it appears the instant one starts and
// hides the instant the focus clears, with no per-controller bookkeeping.

import { animSettings } from "../anim-settings.js";

/**
 * @param {{invalidate: () => void, urlState: object, animating: () => boolean}} deps
 *   `animating` says whether any animation controller is active right now.
 * @returns {() => void} updateSpeedRow
 */
export function wireSpeedSlider({ invalidate, urlState, animating }) {
  const speedRow = document.getElementById("anim-speed-row");
  const speedSlider = document.getElementById("anim-speed");
  // The input is a linear 0..1; map it GEOMETRICALLY onto the [min,max] speed range so
  // the midpoint (0.5) reads as 1x (min*max == 1 by construction, see anim-settings.js).
  const { min: SPD_MIN, max: SPD_MAX } = animSettings.speedRange;
  const sliderToSpeed = (v) => SPD_MIN * Math.pow(SPD_MAX / SPD_MIN, v);
  const speedToSlider = (s) => Math.log(s / SPD_MIN) / Math.log(SPD_MAX / SPD_MIN);
  if (speedSlider) {
    speedSlider.value = String(speedToSlider(animSettings.speed));
    speedSlider.addEventListener("input", () => {
      animSettings.setSpeed(sliderToSpeed(parseFloat(speedSlider.value)));
      invalidate(); // repaint so the new pace takes visible effect at once
    });
    // `speed=<multiplier>`: the multiplier itself (1 = the reference pace), not the
    // slider's linear position, so the link stays meaningful if the mapping changes.
    const writeSpeed = (v) => {
      if (!Number.isFinite(parseFloat(v))) return;
      animSettings.setSpeed(parseFloat(v));
      speedSlider.value = String(speedToSlider(animSettings.speed));
      invalidate();
    };
    // Apply-only, like `anim`: the speed is a persisted personal preference.
    urlState.register("speed", { read: () => null, write: writeSpeed,
      reset: () => writeSpeed("1") });
  }
  const updateSpeedRow = () => {
    if (!speedRow) return;
    const show = animSettings.enabled && animating();
    if (speedRow.hidden === show) speedRow.hidden = !show; // write only on a change
  };
  updateSpeedRow(); // initial: hidden (nothing focused yet)
  return updateSpeedRow;
}
