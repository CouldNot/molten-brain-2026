// Value formatting shared by the panel, legends and search: half-lives, a binding's
// ranking Ki, side-stripped region ids, and the effect / no-source glyphs. Pure (no DOM).

import { formatDuration } from "../tdm.js";

const { t } = window.__I18N__;

// Drug-effect glyphs: a coloured symbol that stands in for the plain colour bar in
// a binding row, so the action's direction reads at a glance: + boost (increase),
// − block (decrease), ≈ modulate (roughly), each drawn in the effect's own colour
// (emerald / rose / violet).
export const EFFECT_GLYPHS = { boost: "+", block: "−", modulate: "≈" };

// The glyph shown inside a NOSOURCE pill (no source document for the claim yet): a
// cross, so an unbacked node reads as a red ✕ at a glance rather than a long word.
// Shared by the info-panel pills (makeProvenancePill) and the About grade key, so
// the two never drift.
export const NOSOURCE_GLYPH = "✕";

// Format an elimination half-life ({hours, hours_max?}) into a compact human string,
// choosing ONE unit (minutes / hours / days) from the largest bound so a range reads
// in a single unit ("2–3 days", "6–8 h", "45 min"). The data stores canonical hours
// precisely, so this is the single place the days/h/min choice lives. Returns "" for
// a missing value. Module-level so BOTH the drug panel (showDrug) and the drugs list
// (buildDrugLegend) can format T½ the same way.
export function formatHalfLife(hl) {
  return formatDuration(hl, t, window.__I18N__.lang);
}

// A drug binding's representative Ki (its median), or Infinity when unmeasured. The
// single "how hard does this drug grip this target" ranking key, shared by the info
// panel (the drug's "Direct molecular targets" order, each system's strongest binding) and the target
// legend's affinity sort, so every affinity ordering agrees.
export const bindingKi = (b) =>
  b.ki && typeof b.ki.median === "number" ? b.ki.median : Infinity;

/**
 * Build the merged "Receptors & targets" legend section from the live dataset
 * (#receptors-body): the unified `data.targets` list (every modeled receptor plus
 * every non-receptor drug target: transporters, enzymes, channels, receptor
 * groups), grouped by neurotransmitter `system`, so a transporter like SERT sits
 * under "Serotonergic" beside the 5-HT receptors. System headings are ordered by
 * **total knowledge nodes** (biggest first: the sum over the system's targets of
 * each target's own node + its "Found in" regions + the drug bindings on it, so a
 * heavily-expressed, heavily-drugged system like dopaminergic leads), with the
 * system-less "Other" bucket pinned last; members within a system are ordered
 * **lexicographically** by name. Each row is coloured by its swatch (a receptor's
 * sign colour, a target's type colour) and, for a non-receptor target, tagged with
 * its type ("transporter", ...). A focusable row is clickable (dim the brain to the
 * regions it sits in + scatter glowing dots, handled by the caller's `onPick`); a
 * footprint-less one (a receptor stub, an unlocated enzyme) renders muted + inert.
 * Returns a `reflect(activeId)` callback that lights the active row and greys the rest.
 * @param {import("./data.js").BrainData} data
 * @param {(target: object) => void} onPick
 * @returns {(activeId: string|null) => void}
 */
/** `accumbens_R` -> `accumbens`: the side-stripped base id. A hemisphere is a
 * rendering detail, so anything keyed by region (expression, search rows, deep
 * links) keys by the base. */
export function stripSide(id) {
  return String(id == null ? "" : id).replace(/_[LR]$/, "");
}
