// Unit tests for public/js/data.js withFetched (the download date on a source pill's
// tooltip), run by tools/tests/test_js_units.py via `node --test`.
import test from "node:test";
import assert from "node:assert/strict";
import { withFetched } from "../../public/js/data.js";

const EN = { "info.sourceFetched": "downloaded {date}" };
const FR = { "info.sourceFetched": "téléchargé le {date}" };
const tr = (table) => (key, vars) => table[key].replace("{date}", vars.date);

test("an editable corpus source shows its download date", () => {
  assert.equal(withFetched("Wikipedia (EN), p. vortioxetine", "2026-10-11", tr(EN)),
    "Wikipedia (EN), p. vortioxetine, downloaded 2026-10-11");
});

test("the date is localized", () => {
  assert.equal(withFetched("Wikipédia (FR), p. sertraline", "2026-10-11", tr(FR)),
    "Wikipédia (FR), p. sertraline, téléchargé le 2026-10-11");
});

test("a book page (no date) keeps its plain reference", () => {
  assert.equal(withFetched("Stahl, p. 15", undefined, tr(EN)), "Stahl, p. 15");
});
