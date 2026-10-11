// Unit tests for public/js/drug-history.js groupWithdrawals (one panel row per
// (year, reason)) and approvalLabel (a one-country approval is labelled so), run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { approvalLabel, groupWithdrawals } from "../../public/js/drug-history.js";

const w = (year, reason, countryLabel, scope = false) =>
  ({ year, reason, reasonLabel: reason, countryLabel, scope });

test("same year + reason fold into one row, scope first, then alphabetical", () => {
  const groups = groupWithdrawals([
    w(2010, "cardiac", "United States"), w(2010, "cardiac", "Australia"),
    w(2010, "cardiac", "most markets", true), w(2010, "cardiac", "Canada"),
  ], "en");
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].items.map((x) => x.countryLabel),
    ["most markets", "Australia", "Canada", "United States"]);
});

test("a different year or reason is its own row, in authored order", () => {
  const groups = groupWithdrawals([
    w(2003, "unstated", "Canada"), w(2004, "liver", "most markets", true),
    w(2003, "liver", "Canada"),
  ], "en");
  assert.deepEqual(groups.map((g) => `${g.year} ${g.reasonLabel} ${g.items.length}`),
    ["2003 unstated 1", "2004 liver 1", "2003 liver 1"]);
});

test("countries sort in the reading language", () => {
  // "Écosse" sorts with E in French, not after Z as a raw code-point compare would.
  const fr = groupWithdrawals([w(1, "r", "Zambie"), w(1, "r", "Écosse"), w(1, "r", "Allemagne")], "fr");
  assert.deepEqual(fr[0].items.map((x) => x.countryLabel), ["Allemagne", "Écosse", "Zambie"]);
});

test("a national (one-country) approval gets its own label", () => {
  const t = (k) => k;
  assert.equal(approvalLabel({ year: 1991, national: true }, t), "drug.firstNationalApproval");
  assert.equal(approvalLabel({ year: 1991, national: false }, t), "drug.firstApproval");
});
