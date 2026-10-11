// Unit tests for public/js/search-rank.js, run by tools/tests/test_js_units.py.
import test from "node:test";
import assert from "node:assert/strict";
import { rankMatch } from "../../public/js/search-rank.js";

test("label prefix ranks first", () => {
  assert.equal(rankMatch("hippocampus", "", "hipp"), 0);
});

test("an acronym alias beats a mid-word label hit", () => {
  const alias = rankMatch("methylphenidate (d)", "stimulant mph dmph", "mph");
  const midWord = rankMatch("amphetamine (d)", "stimulant", "mph");
  assert.equal(alias, 1);
  assert.equal(midWord, 2);
  assert.equal(rankMatch("locus coeruleus", "lc", "lc"), 1);
  assert.equal(rankMatch("m1 · acetylcholine", "", "lc"), 2);
});

test("a word start inside the label ranks with whole-word aliases", () => {
  assert.equal(rankMatch("neuronal a4b2 nachr", "", "nac"), 1);
});

test("mid-word keyword hit ranks last, no hit is null", () => {
  assert.equal(rankMatch("fluoxetine", "ssri serotonin", "otonin"), 3);
  assert.equal(rankMatch("fluoxetine", "ssri", "zzz"), null);
});

test("regex metacharacters in the query are literal", () => {
  assert.equal(rankMatch("5ht2a (receptor)", "", "(receptor"), 1);
  assert.equal(rankMatch("abc", "", "a.c"), null);
});
