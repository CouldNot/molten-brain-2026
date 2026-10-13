// Unit tests for public/js/receptor-demographics.js: rows resolve their labels, glyph and
// per-factor sentence key, age first. Run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { resolveDemographics } from "../../public/js/receptor-demographics.js";

const vocab = {
  factors: { age: { label: "Age" }, sex: { label: "Sex" } },
  glyphs: { decrease: "↓", higher_in_female: "♀ >", no_difference: "=" },
};

test("resolveDemographics labels, glyphs, keys and sorts age first", () => {
  const rows = resolveDemographics([
    { factor: "sex", direction: "no_difference", grade: "verified" },
    { factor: "age", direction: "decrease", structure: "caudate",
      magnitude: "6.6% per decade", grade: "verified" },
  ], vocab);
  assert.deepEqual(rows.map((r) => r.factor), ["age", "sex"]);
  assert.equal(rows[0].glyph, "↓");
  assert.equal(rows[0].structure, "caudate");
  assert.equal(rows[0].magnitude, "6.6% per decade");
  assert.equal(rows[1].textKey, "demog.sex.no_difference");
  assert.equal(rows[1].structure, null);
});

test("resolveDemographics tolerates a missing list and grade", () => {
  assert.deepEqual(resolveDemographics(undefined, vocab), []);
  assert.equal(resolveDemographics([{ factor: "age", direction: "decrease" }], vocab)[0]
    .provenance, "llm");
});
