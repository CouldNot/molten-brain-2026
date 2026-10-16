// Unit tests for public/js/workup.js (pre-prescription workup grouping + wording),
// run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { formatWorkup, groupWorkup } from "../../public/js/workup.js";

test("rows group before then during, empty groups dropped", () => {
  const rows = [
    { test: "weight", timing: "during" },
    { test: "ecg", timing: "before" },
    { test: "blood_count", timing: "during" },
  ];
  assert.deepEqual(groupWorkup(rows).map((g) => [g.timing, g.rows.map((r) => r.test)]),
    [["before", ["ecg"]], ["during", ["weight", "blood_count"]]]);
  assert.deepEqual(groupWorkup([{ test: "ecg", timing: "during" }]).map((g) => g.timing),
    ["during"]);
  assert.deepEqual(groupWorkup(undefined), []);
});

test("one node reads as test then timing", () => {
  assert.equal(formatWorkup({ testLabel: "ECG (QT interval)", timingLabel: "before starting" }),
    "ECG (QT interval), before starting");
});
