// Unit tests for public/js/physchem.js (lipophilicity, polar surface and BBB wording),
// run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { formatBbb, formatLogP, formatTpsa, hasPhyschem } from "../../public/js/physchem.js";

const t = (k, v) => ({ "drug.bbbRange": `${v?.lo} to ${v?.hi}` })[k];

test("logP and TPSA read in the reading language, with a true minus sign", () => {
  assert.equal(formatLogP(3.2, "en"), "3.2");
  assert.equal(formatLogP(3.2, "fr"), "3,2");
  assert.equal(formatLogP(-0.4, "en"), "−0.4");
  assert.equal(formatTpsa(36.3, "en"), "36.3 Å²");
  assert.equal(formatTpsa(36.3, "fr"), "36,3 Å²");
});

test("BBB label alone, with one logBB, or with a range", () => {
  assert.equal(formatBbb({ label: "BBB-", logbb: null, logbbMax: null }, t, "en"), "BBB-");
  assert.equal(formatBbb({ label: "BBB+", logbb: 0.99, logbbMax: null }, t, "en"),
    "BBB+ (logBB 0.99)");
  assert.equal(formatBbb({ label: "BBB+", logbb: 0.78, logbbMax: 0.8 }, t, "en"),
    "BBB+ (logBB 0.78 to 0.8)");
  assert.equal(formatBbb({ label: "BBB-", logbb: -1.3, logbbMax: null }, t, "fr"),
    "BBB- (logBB −1,3)");
});

test("the section shows only when a drug carries one of the three", () => {
  assert.equal(hasPhyschem({ xlogp: null, tpsa: null, bbb: null }), false);
  assert.equal(hasPhyschem({ xlogp: null, tpsa: { value: 1 }, bbb: null }), true);
});
