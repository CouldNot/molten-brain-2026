// Unit tests for public/js/tdm.js (therapeutic range + alert level wording), run by
// tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { formatAlert, formatRange } from "../../public/js/tdm.js";

test("range reads in the reading language", () => {
  const r = { low: 0.4, high: 0.8, unit: "mmol/L" };
  assert.equal(formatRange(r, "en"), "0.4–0.8 mmol/L");
  assert.equal(formatRange(r, "fr"), "0,4–0,8 mmol/L");
});

test("thousands are grouped and an analyte is named", () => {
  assert.equal(formatAlert({ value: 1000, unit: "ng/mL" }, "en"), "1,000 ng/mL");
  assert.equal(formatRange({ low: 80, high: 200, unit: "ng/mL",
    analyte: "amitriptyline + nortriptyline" }, "en"),
  "80–200 ng/mL (amitriptyline + nortriptyline)");
});
