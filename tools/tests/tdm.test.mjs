// Unit tests for public/js/tdm.js (therapeutic range + alert level wording), run by
// tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { formatAlert, formatDuration, formatRange, valueChip } from "../../public/js/tdm.js";

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

test("durations use the same locale number format as the TDM chips", () => {
  const t = (k) => ({ "drug.hlMinutes": "min", "drug.hlHours": "h", "drug.hlDays": "d" })[k];
  // Regression: the half-life / Tmax chips printed "0.3–3 h" in French while the
  // TDM chips beside them used the French decimal comma.
  assert.equal(formatDuration({ hours: 0.3, hours_max: 3 }, t, "fr"), "0,3–3 h");
  assert.equal(formatDuration({ hours: 0.3, hours_max: 3 }, t, "en"), "0.3–3 h");
  assert.equal(formatDuration({ hours: 0.25 }, t, "en"), "15 min");
  assert.equal(formatDuration({ hours: 60 }, t, "fr"), "2,5 d");
  assert.equal(formatDuration({ hours: 23.98 }, t, "en"), "24 h");
  assert.equal(formatDuration(null, t, "en"), "");
});

// A minimal element stub: valueChip only creates spans and appends to them.
const stubEl = () => ({ children: [], appendChild(c) { this.children.push(c); return c; } });

test("a value chip's pill goes through the shared node pill, doubt included", () => {
  // Regression: valueChip hand-rolled its pill from grade + sources, so a doubted
  // value (a curated `contradicted`) showed its green grade instead of orange.
  const seen = [];
  const h = { el: () => stubEl(), nodePill: (node) => { seen.push(node); return "PILL"; } };
  const doubt = [{ kind: "contradicted" }];
  const chip = valueChip(h, { label: "T", value: "1 h", provenance: "verified",
    sources: [{ quote: "q" }], uncertainty: doubt });
  assert.equal(chip.children.at(-1), "PILL");
  assert.deepEqual(seen, [{ provenance: "verified", sources: [{ quote: "q" }], uncertainty: doubt }]);
  // An unsourced value still shows its (red) pill unless `bare`.
  valueChip(h, { label: "T", value: "1 h", provenance: null });
  assert.equal(seen.length, 2);
  valueChip(h, { label: "T", value: "1 h", provenance: null, bare: true });
  assert.equal(seen.length, 2);
});
