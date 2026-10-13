// Unit tests for public/js/data.js toneBySystem + affinityWeightOf: the indicative
// neurotransmitter tone a drug panel shows and a projection-group panel ranks by.
// Run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { affinityWeightOf, toneBySystem } from "../../public/js/data.js";

test("affinity weight ramps from 0.35 at 1 uM to 1 at 0.1 nM, mid without a Ki", () => {
  assert.equal(affinityWeightOf({ median: 1000 }), 0.35);
  assert.equal(affinityWeightOf({ median: 0.1 }), 1);
  assert.equal(affinityWeightOf({ median: 100000 }), 0.35); // clamped below
  assert.equal(affinityWeightOf(null), 0.55);
});

test("a system's tone is the signed sum of its tone-setters, uncapped, with its terms", () => {
  const sert = { flowKind: "serotonergic", toneSign: 1, affinityWeight: 0.9 };
  const ht1d = { flowKind: "serotonergic", toneSign: 1, affinityWeight: 0.6 };
  const h1 = { flowKind: "histaminergic", toneSign: 0, affinityWeight: 1 }; // postsynaptic
  const out = toneBySystem([sert, h1, ht1d]);
  assert.deepEqual(Object.keys(out), ["serotonergic"]);
  assert.ok(Math.abs(out.serotonergic.sum - 1.5) < 1e-9);
  assert.equal(out.serotonergic.weight, 1); // the overlay's cap, not the shown value
  assert.equal(out.serotonergic.direction, 1);
  assert.deepEqual(out.serotonergic.terms, [sert, ht1d]);
});

test("opposing tone-setters that cancel drop the system", () => {
  const up = { flowKind: "dopaminergic", toneSign: 1, affinityWeight: 0.5 };
  const down = { flowKind: "dopaminergic", toneSign: -1, affinityWeight: 0.5 };
  assert.deepEqual(toneBySystem([up, down]), {});
});
