// Unit tests for public/js/receptor-variants.js: rows resolve their level, category and
// drug labels; groups keep first-appearance order; the drug join names the drug itself.
// Run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { groupByVariant, resolveVariants, variantsForDrug }
  from "../../public/js/receptor-variants.js";

const vocab = {
  levels: { "2B": { strength: "moderate", label: "replicated" },
            3: { strength: "low", label: "one study" } },
  categories: { efficacy: "efficacy", toxicity: "toxicity" },
  populations: { Pediatric: "children" },
};
const names = { methadone: "Methadone" };
const raw = [
  { annotation: "1", variant: "rs1", level: "2B", categories: ["efficacy"],
    drugs: ["methadone"], drug_names: ["opioids"], phenotypes: ["Pain"],
    population: "Pediatric", grade: "verified", sources: [{ quote: "q" }] },
  { annotation: "2", variant: "rs2", level: "3", categories: ["toxicity"], drugs: [] },
  { annotation: "3", variant: "rs1", level: "3", categories: ["mystery"], drugs: [] },
];

test("resolveVariants labels levels, categories, drugs and population", () => {
  const rows = resolveVariants(raw, vocab, (id) => names[id] || null);
  assert.equal(rows[0].strength, "moderate");
  assert.deepEqual(rows[0].drugs, [{ id: "methadone", name: "Methadone" }]);
  assert.deepEqual(rows[0].drugNames, ["opioids"]);
  assert.equal(rows[0].population, "children");
  assert.equal(rows[0].provenance, "verified");
  assert.deepEqual(rows[2].categories, ["mystery"]);
  assert.equal(rows[1].provenance, "llm");
  assert.equal(rows[1].population, null);
});

test("groupByVariant keeps first-appearance order", () => {
  const groups = groupByVariant(resolveVariants(raw, vocab));
  assert.deepEqual(groups.map((g) => g.variant), ["rs1", "rs2"]);
  assert.deepEqual(groups[0].rows.map((r) => r.annotation), ["1", "3"]);
});

test("variantsForDrug joins the drug itself, once per target", () => {
  const rows = resolveVariants(raw, vocab);
  const mu = { id: "mu", variantInfo: rows };
  const hits = variantsForDrug("methadone", [mu, mu]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].row.annotation, "1");
  assert.deepEqual(variantsForDrug("opioids", [mu]), []);
  assert.deepEqual(resolveVariants(undefined, vocab), []);
});
