// Unit tests for public/js/data.js indexDrugsByTarget: a prodrug acting through a
// focusable metabolite drug is listed apart (prodrugsByTarget, shown "via" and never
// counted), a non-drug metabolite keeps its own counted "metab. of" row. Run by
// tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { indexDrugsByTarget } from "../../public/js/data.js";

const dex = { displayName: "Dextroamphetamine", metabolites: [],
              bindings: [{ target: "dat" }, { target: "net" }] };
const lisdex = {
  displayName: "Lisdexamfetamine",
  metabolites: [{ name: "Dextroamphetamine", linkFocusable: true, ownBindings: [] }],
  bindings: [{ target: "dat", viaMetabolite: "Dextroamphetamine" },
             { target: "net", viaMetabolite: "Dextroamphetamine" }],
};
const psilocin = { target: "5ht2a" };
const psilocybin = {
  displayName: "Psilocybin",
  metabolites: [{ name: "Psilocin", linkFocusable: false, ownBindings: [psilocin] }],
  bindings: [{ ...psilocin, viaMetabolite: "Psilocin" }],
};

test("a prodrug through a metabolite drug is listed apart, not counted", () => {
  const { drugsByTarget, prodrugsByTarget } = indexDrugsByTarget([dex, lisdex]);
  assert.deepEqual(drugsByTarget.get("dat").map((r) => r.drug), [dex]);
  assert.deepEqual(prodrugsByTarget.get("dat").map((r) => r.drug), [lisdex]);
  assert.equal(prodrugsByTarget.get("dat")[0].binding.viaMetabolite, "Dextroamphetamine");
  assert.deepEqual(prodrugsByTarget.get("net").map((r) => r.drug), [lisdex]);
});

test("a non-drug metabolite keeps its own counted row, never a borrowed one", () => {
  const { drugsByTarget, prodrugsByTarget } = indexDrugsByTarget([psilocybin]);
  const rows = drugsByTarget.get("5ht2a");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].metaboliteName, "Psilocin");
  assert.deepEqual(rows[0].viaMetaboliteOfList, ["Psilocybin"]);
  assert.equal(prodrugsByTarget.size, 0);
});

test("a salt through a modeled constituent is listed apart, not counted", () => {
  const dph = { displayName: "Diphenhydramine", metabolites: [], bindings: [{ target: "h1" }] };
  const salt = {
    displayName: "Dimenhydrinate", metabolites: [],
    combo: [{ name: "Diphenhydramine", drugId: "diphenhydramine" },
            { name: "8-Chlorotheophylline", drugId: null }],
    bindings: [{ target: "h1", viaMetabolite: "Diphenhydramine" }],
  };
  const { drugsByTarget, prodrugsByTarget } = indexDrugsByTarget([dph, salt]);
  assert.deepEqual(drugsByTarget.get("h1").map((r) => r.drug), [dph]);
  assert.deepEqual(prodrugsByTarget.get("h1").map((r) => r.drug), [salt]);
});
