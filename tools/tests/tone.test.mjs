// Unit tests for public/js/data.js toneBySystem + affinityWeightOf: the indicative
// neurotransmitter tone a drug panel shows and a projection-group panel ranks by.
// Run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { affinityWeightOf, toneBySystem, toneWeightOf } from "../../public/js/data.js";

test("affinity weight ramps from 0.35 at 1 uM to 1 at 0.1 nM, mid without a Ki", () => {
  assert.equal(affinityWeightOf({ median: 1000 }), 0.35);
  assert.equal(affinityWeightOf({ median: 0.1 }), 1);
  assert.equal(affinityWeightOf({ median: 100000 }), 0.35); // clamped below
  assert.equal(affinityWeightOf(null), 0.55);
});

test("the tone weight has no floor: 0 at 1 uM, 1 at 0.1 nM, a 10 nM binding without a Ki", () => {
  assert.equal(toneWeightOf({ median: 1000 }), 0);
  assert.equal(toneWeightOf({ median: 10 }), 0.5);
  assert.equal(toneWeightOf({ median: 0.1 }), 1);
  assert.equal(toneWeightOf(null), 0.5);
});

test("an autoreceptor's factor scales its share: weak hits add up but stay below one strong block", () => {
  const sert = { flowKind: "serotonergic", toneSign: 1, toneWeight: toneWeightOf({ median: 0.3 }) };
  const weak = (ki) => ({ flowKind: "serotonergic", toneSign: 1, toneFactor: 0.5,
                          toneWeight: toneWeightOf({ median: ki }) });
  const ssri = toneBySystem([sert]).serotonergic.sum;
  const three = toneBySystem([weak(300), weak(70), weak(70)]).serotonergic.sum;
  assert.ok(three > toneBySystem([weak(70)]).serotonergic.sum, "several weak hits add up");
  assert.ok(three < ssri, `three weak autoreceptor hits (${three}) outrank a 0.3 nM SERT block (${ssri})`);
});

test("a system's tone is the signed sum of its tone-setters, uncapped, with its terms", () => {
  const sert = { flowKind: "serotonergic", toneSign: 1, toneWeight: 0.9 };
  const ht1d = { flowKind: "serotonergic", toneSign: 1, toneWeight: 0.6 };
  const h1 = { flowKind: "histaminergic", toneSign: 0, toneWeight: 1 }; // postsynaptic
  const out = toneBySystem([sert, h1, ht1d]);
  assert.deepEqual(Object.keys(out), ["serotonergic"]);
  assert.ok(Math.abs(out.serotonergic.sum - 1.5) < 1e-9);
  assert.equal(out.serotonergic.weight, 1); // the overlay's cap, not the shown value
  assert.equal(out.serotonergic.direction, 1);
  assert.deepEqual(out.serotonergic.terms, [sert, ht1d]);
});

test("opposing tone-setters that cancel drop the system", () => {
  const up = { flowKind: "dopaminergic", toneSign: 1, toneWeight: 0.5 };
  const down = { flowKind: "dopaminergic", toneSign: -1, toneFactor: 0.5, toneWeight: 1 };
  assert.deepEqual(toneBySystem([up, down]), {});
});
