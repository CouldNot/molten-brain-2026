/**
 * receptor_effect nodes (BETA): resolve them for the receptor / target panel, and
 * DERIVE a drug's "possible effects via its bindings" for the drug panel.
 *
 * No three.js, no DOM: pure functions, unit-tested by
 * tools/tests/receptor_effects.test.mjs. The drug-side list is computed, never
 * stored, and is a statement about the receptors a drug acts on, not about the drug:
 * the panel words it conditionally ("could cause"), never as a side effect of the drug.
 *
 * Built with the help of Claude Code.
 */

/**
 * Resolve one owner's emitted `effects` list into display rows.
 * @param {object[]} raw  `[{mode, effect, sources, grade}]` from the record.
 * @param {Object<string,{label:string}>} modes  meta.receptor_effect_modes (localized labels).
 * @param {Object<string,string>} labels  meta.receptor_effect_labels (localized).
 * @returns {{mode:string, effect:string, label:string, modeLabel:string,
 *            sources:object[], provenance:string}[]}
 */
export function resolveEffects(raw, modes, labels) {
  return (raw || []).map((e) => ({
    mode: e.mode,
    effect: e.effect,
    label: labels[e.effect] || e.effect,
    modeLabel: (modes[e.mode] && modes[e.mode].label) || e.mode,
    sources: e.sources || [],
    provenance: e.grade || "llm",
  }));
}

/**
 * Join a drug's bindings with the effect nodes of the targets they hit.
 *
 * Direction-aware: a binding inherits an effect node only when its action is one of
 * the actions that node's mode lists (an antagonist inherits antagonism effects, an
 * agonist agonism ones, `both` takes either). An affinity_only binding (no action)
 * contributes nothing: a Ki says the drug binds, never in which direction.
 *
 * @param {object[]} bindings  resolved drug bindings (`{target, targetName, action}`).
 * @param {(targetId:string) => object[]} effectsOf  target id -> resolved effect rows.
 * @param {Object<string,{actions:string[]}>} modes  meta.receptor_effect_modes.
 * @returns {{effect:string, label:string, via:{binding:object, node:object}[]}[]}
 *   one entry per effect, in first-seen order of the bindings as given.
 */
export function derivePossibleEffects(bindings, effectsOf, modes) {
  const byEffect = new Map();
  for (const b of bindings || []) {
    if (!b.action) continue;
    for (const node of effectsOf(b.target) || []) {
      const actions = (modes[node.mode] && modes[node.mode].actions) || [];
      if (!actions.includes(b.action)) continue;
      if (!byEffect.has(node.effect)) {
        byEffect.set(node.effect, { effect: node.effect, label: node.label, via: [] });
      }
      const entry = byEffect.get(node.effect);
      if (!entry.via.some((v) => v.binding.target === b.target && v.node === node)) {
        entry.via.push({ binding: b, node });
      }
    }
  }
  return [...byEffect.values()];
}
