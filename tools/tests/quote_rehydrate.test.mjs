// Unit tests for public/js/data.js rehydrateQuotes (the externalized quote table merged
// back onto each source reference), run by tools/tests/test_js_units.py via `node --test`.
// Mirrors check_data.py's rehydrate_quotes rule: every quote-node field but `id`.
import test from "node:test";
import assert from "node:assert/strict";
import { rehydrateQuotes } from "../../public/js/data.js";

test("every quote-node field but id is copied, nested anywhere", () => {
  const byId = { q1: { id: "q1", corpus: "stahl", page: 15, quote: "x", aFutureField: 1 } };
  const data = [{ drug: { sources: [{ quote_id: "q1", provenance: "verified" }] } }];
  rehydrateQuotes(data, byId);
  assert.deepEqual(data[0].drug.sources[0], {
    quote_id: "q1", provenance: "verified", corpus: "stahl", page: 15, quote: "x",
    aFutureField: 1,
  });
});

test("a dangling quote_id is left as is", () => {
  const src = { quote_id: "nope" };
  rehydrateQuotes(src, {});
  assert.deepEqual(src, { quote_id: "nope" });
});
