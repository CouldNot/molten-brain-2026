// Unit tests for public/js/wiki.js clipLead (the collapsed Wikipedia lead preview),
// run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { clipLead } from "../../public/js/wiki.js";

test("a lead that fits is returned whole, no ellipsis", () => {
  assert.equal(clipLead("Caffeine is a stimulant.", 300), "Caffeine is a stimulant.");
});

test("a long lead is cut at a word boundary with an ellipsis", () => {
  const out = clipLead("Caffeine is a central nervous system stimulant of the methylxanthine class", 30);
  assert.equal(out, "Caffeine is a central nervous…");
  assert.ok(out.length <= 31);
});

test("trailing punctuation before the cut is dropped", () => {
  assert.equal(clipLead("Alpha beta, gamma delta epsilon", 12), "Alpha beta…");
});

test("one huge token falls back to a hard cut", () => {
  assert.equal(clipLead("a " + "x".repeat(50), 20), "a " + "x".repeat(18) + "…");
});
