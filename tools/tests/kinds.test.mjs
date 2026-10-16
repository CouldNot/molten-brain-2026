// kinds.js: the node-kind registry and the Sources popup's example picker.
import { test } from "node:test";
import assert from "node:assert/strict";
import { KINDS, KIND_ORDER, KIND_LABELS, exampleRow } from "../../public/js/kinds.js";

test("every kind is listed once, with an about.kind* label", () => {
  assert.equal(new Set(KIND_ORDER).size, KINDS.length);
  for (const k of KIND_ORDER) assert.match(KIND_LABELS[k], /^about\.kind/);
});

test("exampleRow prefers the kind's example owner, else the first navigable row", () => {
  const go = () => {};
  const rows = [
    { kind: "drug_nbn", owner: "aripiprazole", go: null },
    { kind: "drug_nbn", owner: "aripiprazole", go },
    { kind: "drug_nbn", owner: "olanzapine", go },
    { kind: "structures", owner: "amygdala_R", go },
    { kind: "structures", owner: "hippocampus_R", go },
  ];
  assert.equal(exampleRow(rows, "drug_nbn").owner, "olanzapine");
  // a lateralized owner matches through its _R member
  assert.equal(exampleRow(rows, "structures").owner, "hippocampus_R");
  assert.equal(exampleRow(rows.slice(0, 2), "drug_nbn"), rows[1]);
  assert.equal(exampleRow(rows, "circuits"), null);
});
