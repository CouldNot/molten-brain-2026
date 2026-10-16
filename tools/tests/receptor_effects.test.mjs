// Unit tests for public/js/receptor-effects.js: the drug panel's derived "possible
// effects via its bindings" join is direction-aware and ignores affinity_only bindings.
// Run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveEffects, derivePossibleEffects, indexEffects } from "../../public/js/receptor-effects.js";

const modes = {
  agonism: { label: "Agonism", actions: ["agonist", "partial_agonist"] },
  antagonism: { label: "Antagonism", actions: ["antagonist", "inverse_agonist"] },
  both: { label: "Either", actions: ["agonist", "antagonist"] },
};
const labels = { sedation: "Sedation", hallucinations: "Hallucinations",
                 weight_gain: "Weight gain" };
const nodes = {
  h1: resolveEffects([{ mode: "antagonism", effect: "sedation", grade: "verified" },
                      { mode: "antagonism", effect: "weight_gain", grade: "verified" }],
                     modes, labels),
  "5ht2a": resolveEffects([{ mode: "agonism", effect: "hallucinations", grade: "verified" }],
                          modes, labels),
  alpha1a: resolveEffects([{ mode: "both", effect: "sedation", grade: "verified" }],
                          modes, labels),
};
const effectsOf = (t) => nodes[t] || [];

test("resolveEffects labels mode and effect", () => {
  assert.equal(nodes.h1[0].label, "Sedation");
  assert.equal(nodes.h1[0].modeLabel, "Antagonism");
  assert.equal(nodes.h1[0].provenance, "verified");
});

test("an antagonist inherits antagonism effects only", () => {
  const out = derivePossibleEffects(
    [{ target: "h1", action: "antagonist" }, { target: "5ht2a", action: "antagonist" }],
    effectsOf, modes);
  assert.deepEqual(out.map((e) => e.effect), ["sedation", "weight_gain"]);
});

test("an agonist inherits agonism effects", () => {
  const out = derivePossibleEffects([{ target: "5ht2a", action: "agonist" }], effectsOf, modes);
  assert.deepEqual(out.map((e) => e.effect), ["hallucinations"]);
});

test("affinity_only bindings contribute nothing", () => {
  const out = derivePossibleEffects([{ target: "h1", action: null, affinityOnly: true }],
                                    effectsOf, modes);
  assert.deepEqual(out, []);
});

test("two receptors reaching one effect are grouped under it", () => {
  const out = derivePossibleEffects(
    [{ target: "h1", action: "antagonist" }, { target: "alpha1a", action: "antagonist" }],
    effectsOf, modes);
  const sed = out.find((e) => e.effect === "sedation");
  assert.deepEqual(sed.via.map((v) => v.binding.target), ["h1", "alpha1a"]);
});

test("indexEffects lists owners and the drugs the drug-panel join reaches", () => {
  const targets = [{ id: "h1" }, { id: "5ht2a" }, { id: "alpha1a" }];
  const drugs = [
    { id: "quetiapine", bindings: [{ target: "h1", action: "antagonist" },
                                   { target: "alpha1a", action: "antagonist" }] },
    { id: "lsd", bindings: [{ target: "5ht2a", action: "agonist" }] },
    { id: "kionly", bindings: [{ target: "h1" }] },
  ];
  const out = indexEffects(targets, effectsOf, drugs, modes);
  assert.deepEqual(out.map((e) => e.id), ["hallucinations", "sedation", "weight_gain"]);
  const sed = out.find((e) => e.id === "sedation");
  assert.deepEqual(sed.owners.map((o) => o.target.id), ["h1", "alpha1a"]);
  assert.deepEqual(sed.drugs.map((d) => d.drug.id), ["quetiapine"]);
  assert.equal(sed.drugs[0].via.length, 2);
  assert.deepEqual(out.find((e) => e.id === "hallucinations").drugs.map((d) => d.drug.id), ["lsd"]);
});
