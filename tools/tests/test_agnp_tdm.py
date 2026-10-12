"""AGNP TDM guideline corpus #19: the Table 5 cell parsers (fetch_agnp_tdm.py) and the
generator side (data_generators/tdm.py): one range per drug or nothing, and the
Table 1 enzyme pass only ever confirms an existing substrate row."""

import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS / "fetch"))
sys.path.insert(0, str(TOOLS))

import fetch_agnp_tdm as F  # noqa: E402
from data_generators import tdm as T  # noqa: E402
from data_generators.provenance import _quote_sources  # noqa: E402


class CellParserTest(unittest.TestCase):
    def test_clean_joins_hyphen_breaks_and_drops_revision_marker(self):
        self.assertEqual(F.clean("Brexpi­\n+\nprazole"), "Brexpiprazole")
        self.assertEqual(F.clean("Ampheta-\nmine"), "Amphetamine")

    def test_single_range_with_analyte(self):
        self.assertEqual(
            F.parse_range("80–200 ng/mL (amitriptyline plus nortriptyline)"),
            {"low": 80, "high": 200, "unit": "ng/mL",
             "analyte": "amitriptyline + nortriptyline"})

    def test_thousands_and_decimal_and_units(self):
        self.assertEqual(F.parse_range("0.4–0.8 mmol/L"),
                         {"low": 0.4, "high": 0.8, "unit": "mmol/L"})
        self.assertEqual(F.parse_value("1,000 ng/mL"), {"value": 1000, "unit": "ng/mL"})
        self.assertEqual(F.parse_range("50–100 μg/ml")["unit"], "µg/mL")

    def test_two_ranges_or_qualified_range_is_refused(self):
        self.assertIsNone(F.parse_range("60–350 ng/mL 10–60 ng/mL"))
        self.assertIsNone(F.parse_range("Not established"))
        self.assertIsNone(F.parse_range("20–50 ng/mL for children 6–12 y"))

    def test_level(self):
        self.assertEqual(F.parse_level("+ 2"), 2)
        self.assertIsNone(F.parse_level("5"))

    def test_drug_ids_uses_aliases_and_parenthesis_prefix(self):
        idx = F.roster_index([{"id": "clobazam", "name": "Clobazam"},
                              {"id": "ketamine", "name": "Ketamine"},
                              {"id": "esketamine", "name": "Esketamine"}])
        self.assertEqual(F.drug_ids("Ketamine/esketamine", idx), ["ketamine", "esketamine"])
        self.assertEqual(F.drug_ids("Clobazam (norclobazam)", idx), ["clobazam"])
        self.assertEqual(F.drug_ids("Ginkgo", idx), [])


class GeneratorTest(unittest.TestCase):
    SRC = [{"corpus": "agnp_tdm", "page": 28, "quote": "Clozapine 12 h 350–600 ng/mL",
            "provenance": "verified", "extraction": "code"}]

    def _with(self, data):
        old = T._DATA
        T._DATA = data
        self.addCleanup(setattr, T, "_DATA", old)

    def test_range_and_alert_are_two_sourced_fields(self):
        self._with({"ranges": {"x": {"low": 350, "high": 600, "unit": "ng/mL",
                                     "tdm_level": 1, "sources": self.SRC,
                                     "alert": {"value": 1000, "unit": "ng/mL"}}}})
        out = T.drug_tdm("x", _quote_sources)
        self.assertEqual(out["therapeutic_range"],
                         {"low": 350, "high": 600, "unit": "ng/mL", "tdm_level": 1})
        self.assertEqual(out["alert_level"], {"value": 1000, "unit": "ng/mL"})
        self.assertEqual(out["alert_level_sources"][0]["page"], 28)
        self.assertEqual(T.drug_tdm("absent", _quote_sources), {})

    def test_range_without_alert_has_no_alert_node(self):
        self._with({"ranges": {"x": {"low": 1, "high": 2, "unit": "ng/mL",
                                     "sources": self.SRC}}})
        self.assertNotIn("alert_level", T.drug_tdm("x", _quote_sources))

    def test_bad_unit_raises(self):
        self._with({"ranges": {"x": {"low": 1, "high": 2, "unit": "mg/dL",
                                     "sources": self.SRC}}})
        with self.assertRaises(ValueError):
            T.drug_tdm("x", _quote_sources)

    def test_enzymes_confirm_only(self):
        q = [{"corpus": "agnp_tdm", "page": 7, "quote": "Agomelatine CYP1A2, CYP2C19",
              "provenance": "verified", "extraction": "code"}]
        self._with({"enzymes": {"agomelatine": [
            {"enzyme": "cyp1a2", "role": "substrate", "sources": q},
            {"enzyme": "cyp2c19", "role": "substrate", "sources": q}]}})
        merged = {"agomelatine": [{"enzyme": "cyp1a2", "role": "substrate",
                                   "sources": [{"corpus": "stahl", "page": 1}]}]}
        self.assertEqual(T.confirm_enzymes(merged), 1)
        rows = merged["agomelatine"]
        self.assertEqual(len(rows), 1)                    # no cyp2c19 row added
        self.assertEqual([s["corpus"] for s in rows[0]["sources"]], ["stahl", "agnp_tdm"])
        self.assertEqual(T.confirm_enzymes(merged), 0)   # idempotent


if __name__ == "__main__":
    unittest.main()
