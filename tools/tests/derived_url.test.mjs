// Unit tests for public/js/data.js derivedUrl (where the build-time effect index is
// fetched from), run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { derivedUrl } from "../../public/js/data.js";

test("derived/ is the sibling of the data dir", () => {
  // Regression: the effect index was fetched from a hard-coded "derived/effects.json",
  // ignoring the dataDir every other file is read from.
  assert.equal(derivedUrl("data", "effects.json"), "derived/effects.json");
  assert.equal(derivedUrl("data/", "effects.json"), "derived/effects.json");
  assert.equal(derivedUrl("site/data", "effects.json"), "site/derived/effects.json");
  assert.equal(derivedUrl("/site/data", "effects.json"), "/site/derived/effects.json");
});
