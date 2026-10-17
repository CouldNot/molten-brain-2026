// The static colour key (Legend popup): the scene's encodings, built once from meta.

import { addLegendItem } from "./item.js";

const { t } = window.__I18N__;

/**
 * Build the static Legend "key" (#legend-body): a small, non-interactive colour /
 * symbol legend for the 3D scene's encodings that have no label in the interactive
 * sections, so a first-time viewer can decode what a glowing gem dot or a dotted
 * arrow means. Deliberately *not* a copy of the Projections rows (the arrow
 * colours live there) nor the About provenance key; only the otherwise-unlabeled
 * encodings:
 *   - expression "gem" dots over a focused receptor / target, coloured by its
 *     excit / inhib / modulatory sign;
 *   - the per-drug effect dots + surface wash, coloured boost / block / modulate;
 *   - a speculative pathway, drawn as a dotted arrow.
 * Colours come from the dataset's meta (signColors/signLabels, drugEffectColors/
 * drugEffectLabels), so the key can never drift from what the scene draws.
 * @param {import("./data.js").BrainData} data
 */
/**
 * Fill `el` with `str`, rendering `*emphasis*` spans as <em>. Builds real text +
 * <em> DOM nodes (never innerHTML), so it is injection-safe for any string.
 */
function setInlineEmphasis(el, str) {
  el.replaceChildren();
  // Odd-indexed capture groups are the emphasized runs.
  (str || "").split(/\*([^*]+)\*/g).forEach((part, i) => {
    if (i % 2 === 1) {
      const em = document.createElement("em");
      em.textContent = part;
      el.appendChild(em);
    } else if (part) {
      el.appendChild(document.createTextNode(part));
    }
  });
}

export function buildLegendKey(data) {
  const body = document.getElementById("legend-body");
  if (!body) return;
  body.replaceChildren();
  const meta = data.meta || {};

  // A heading + a muted one-line caption + its swatches.
  const section = (headingKey, captionKey, entries) => {
    if (entries.length === 0) return;
    const h = document.createElement("h2");
    h.textContent = t(headingKey);
    body.appendChild(h);
    const cap = document.createElement("p");
    cap.className = "legend-caption";
    setInlineEmphasis(cap, t(captionKey));
    body.appendChild(cap);
    for (const { color, label, line } of entries) {
      addLegendItem(body, color, label, Boolean(line));
    }
  };

  // Expression dots (receptors & targets): one swatch per excit/inhib/modulatory
  // sign, the same colours the dots are drawn in.
  section("legendKey.dots", "legendKey.dotsDesc",
    Object.entries(meta.signLabels || {}).map(([sign, label]) => ({
      color: (meta.signColors || {})[sign] || "#fff", label,
    })));

  // Drug effect dots + wash: boost / block / modulate, in their effect colours.
  section("legendKey.effects", "legendKey.effectsDesc",
    Object.entries(meta.drugEffectColors || {}).map(([effect, color]) => ({
      color, label: (meta.drugEffectLabels || {})[effect] || effect,
    })));

  // Drug flow overlay: beads ride the ascending pathways of the transmitter
  // system(s) the drug engages. One line swatch per distinct flow-capable kind
  // (the values of meta.systemFlowKinds), in that kind's projection colour, so
  // the key names exactly the fans that can light up. Rendered as a line to echo
  // that these are pathways, not regions.
  const flowKinds = [...new Set(Object.values(meta.systemFlowKinds || {}))];
  section("legendKey.flow", "legendKey.flowDesc",
    flowKinds.map((kind) => ({
      color: (meta.projectionColors || {})[kind] || "#fff",
      label: (meta.kindLabels || {})[kind] || kind,
      line: true,
    })));

  // Speculative pathway: a dotted swatch echoing the dotted arrows (drawn as a
  // thin line, like the projection rows). The caption is the heading itself, so
  // pass the heading text and an empty caption row is avoided by reusing it.
  const dotted = "repeating-linear-gradient(90deg, #b0b0b0 0 5px, transparent 5px 9px)";
  const hP = document.createElement("h2");
  hP.textContent = t("legendKey.pathways");
  body.appendChild(hP);
  addLegendItem(body, dotted, t("legendKey.speculative"), true);
}
