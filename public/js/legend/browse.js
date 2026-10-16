// The Enzymes and Effects browse sections: panel-only lists (no 3D state), each a
// buildBrowseList over its dataset slice.

import { buildBrowseList } from "./item.js";

const { t } = window.__I18N__;

/**
 * Build the Enzymes section (#enzymes-body): one row per metabolic isoform some
 * drug actually touches, natural-sorted (CYP1A2 ... CYP3A5), each showing how many
 * drugs sit on it and clickable to open its panel.
 *
 * The metabolism mirror of buildTargetLegend, minus everything 3D: an enzyme has no
 * anatomy, so a row never dims the brain or scatters dots, and the section caption
 * says so rather than leaving a user waiting for the scene to react.
 * @param {import("./data.js").BrainData} data
 * @param {(enzyme: object) => void} onPick
 * @returns {(activeId: string|null) => void} reflect: lights the active row
 */
export function buildEnzymeLegend(data, onPick) {
  return buildBrowseList({ section: "enzymes", captionKey: "enzymes.hint", kind: "enzyme",
    items: data.enzymes || [], count: (enz) => enz.rows.length, onPick });
}

/**
 * Build the Effects section (#effects-body, BETA): one row per clinical effect some
 * receptor / target carries a sourced receptor_effect node for, A->Z, its tag the
 * number of drugs that could reach it. Like the Enzymes section it lights nothing in
 * the scene (the caption says so): a pick opens the effect's panel.
 * @param {import("./data.js").BrainData} data
 * @param {(effect: object) => void} onPick
 * @returns {(activeId: string|null) => void} reflect: lights the active row
 */
export function buildEffectLegend(data, onPick) {
  // No effect index (derived/effects.json failed to load, already said by a red
  // banner): hide the whole section rather than show an empty, clickable header.
  const section = document.getElementById("effects");
  if (section) section.hidden = !(data.effects || []).length;
  return buildBrowseList({ section: "effects", captionKey: "effects.legendHint", kind: "effect",
    items: data.effects || [], count: (effect) => effect.drugs.length,
    tagTitle: t("effects.legendTag"), onPick });
}
