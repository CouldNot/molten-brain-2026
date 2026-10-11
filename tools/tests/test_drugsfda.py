#!/usr/bin/env python
"""Unit tests for the Drugs@FDA pass (corpus #18: fetcher selection + applier gates).

Stdlib ``unittest`` only; hand-built application records and a fake page store in a
temp dir, so it runs on a clone lacking the gitignored export::

    python -m unittest discover -t tools/tests -s tools/tests -p test_drugsfda.py

Built with the help of Claude Code.
"""

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import apply_drug_history as H  # noqa: E402
import apply_drugsfda as A  # noqa: E402
import fetch_drugsfda as F  # noqa: E402
from data_generators import history  # noqa: E402
from prose_gate import PageGate  # noqa: E402


def app(num, ingredients, date, cls="Type 1 - New Molecular Entity", brand="BRAND"):
    sub = {"submission_type": "ORIG", "submission_status": "AP"}
    if date:
        sub["submission_status_date"] = date
    if cls:
        sub["submission_class_code_description"] = cls
    return {"application_number": num, "submissions": [sub] if date else [],
            "products": [{"brand_name": brand, "dosage_form": "TABLET",
                          "active_ingredients": [{"name": n} for n in ingredients]}]}


SERTRALINE = {"id": "sertraline", "name": "Sertraline"}


class SelectTest(unittest.TestCase):
    def test_earliest_nme_nda_wins_salt_dropped(self):
        rec = F.first_approval(SERTRALINE, [
            app("NDA020990", ["SERTRALINE HYDROCHLORIDE"], "19991207", cls="Type 3 - New Dosage Form"),
            app("NDA019839", ["SERTRALINE HYDROCHLORIDE"], "19911230", brand="ZOLOFT"),
            app("ANDA076000", ["SERTRALINE HYDROCHLORIDE"], "19800101"),
        ])
        self.assertEqual((rec["status"], rec["application"], rec["year"]),
                         ("found", "NDA019839", 1991))
        self.assertEqual(rec["quote"], "NDA019839 | ZOLOFT | SERTRALINE HYDROCHLORIDE | "
                                       "TABLET | ORIG approved 1991-12-30")

    def test_combination_product_is_another_drug(self):
        rec = F.first_approval(SERTRALINE, [
            app("NDA000001", ["SERTRALINE HYDROCHLORIDE", "OTHER"], "19700101")])
        self.assertEqual(rec["status"], "none")

    def test_undated_nda_means_no_year_rather_than_a_late_one(self):
        """A pre-1982 NDA without a dated ORIG makes the earliest dated one a lie."""
        rec = F.first_approval({"id": "haloperidol", "name": "Haloperidol"}, [
            app("NDA015921", ["HALOPERIDOL"], None),
            app("NDA020074", ["HALOPERIDOL DECANOATE"], "19940101")])
        self.assertEqual(rec["status"], "undated")

    def test_reformulation_class_means_the_original_is_missing(self):
        """Regression: OxyContin's 1995 NDA is absent from the export, so oxycodone's
        earliest listed NDA is a 1998 "new dosage form", which must not publish."""
        rec = F.first_approval({"id": "oxycodone", "name": "Oxycodone"}, [
            app("NDA020932", ["OXYCODONE HYDROCHLORIDE"], "19981026",
                cls="Type 3 - New Dosage Form")])
        self.assertEqual(rec["status"], "superseded")

    def test_us_name_and_stereo(self):
        rec = F.first_approval({"id": "pethidine", "name": "Pethidine"}, [
            app("NDA005010", ["MEPERIDINE HYDROCHLORIDE"], "19421110", cls=None)])
        self.assertEqual(rec["year"], 1942)
        # A (-)-tagged ingredient never joins a racemate we model.
        self.assertIsNone(F.ingredient_key("(-)-SERTRALINE", "sertraline"))

    def test_roster_combination_is_skipped(self):
        self.assertEqual(F.first_approval({"id": "x", "name": "Naltrexone + Bupropion"}, [])
                         ["status"], "combo")


class ApplyTest(unittest.TestCase):
    QUOTE = "NDA019839 | ZOLOFT | SERTRALINE HYDROCHLORIDE | TABLET | ORIG approved 1991-12-30"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        (Path(self.tmp.name) / "NDA019839.md").write_text(f"# h\n\n{self.QUOTE}\n", "utf-8")
        self.pages = PageGate({"drugsfda": Path(self.tmp.name)})
        self.cache = {"sertraline": {"status": "found", "application": "NDA019839",
                                     "date": "1991-12-30", "year": 1991, "quote": self.QUOTE}}

    def tearDown(self):
        self.tmp.cleanup()

    def test_fills_an_empty_approval_as_national(self):
        drugs = [{"id": "sertraline"}]
        filled, _, _ = A.apply(self.cache, drugs, self.pages)
        self.assertEqual(filled, ["sertraline"])
        self.assertEqual(drugs[0]["first_approval"],
                         {"year": 1991, "country": "us", "agency": "fda", "national": True})
        self.assertEqual(drugs[0]["first_approval_sources"][0]["extraction"], "code")

    def test_never_overwrites_a_wikipedia_approval_reports_earlier(self):
        wiki = {"year": 1995, "country": "fr"}
        drugs = [{"id": "sertraline", "first_approval": dict(wiki),
                  "first_approval_sources": [{"corpus": "wikipedia_pharm"}]}]
        filled, _, earlier = A.apply(self.cache, drugs, self.pages)
        self.assertEqual((filled, drugs[0]["first_approval"]), ([], wiki))
        self.assertIn("FDA 1991-12-30", earlier[0])

    def test_quote_must_be_on_page(self):
        self.cache["sertraline"]["quote"] = self.QUOTE.replace("1991-12-30", "1991-12-31")
        drugs = [{"id": "sertraline"}]
        self.assertEqual(A.apply(self.cache, drugs, self.pages)[0], [])

    def test_own_stale_approval_is_cleared(self):
        drugs = [{"id": "sertraline", "first_approval": {"year": 1991},
                  "first_approval_sources": [{"corpus": "drugsfda"}]}]
        self.cache["sertraline"] = {"status": "superseded"}
        self.assertEqual(A.apply(self.cache, drugs, self.pages)[1], ["sertraline"])
        self.assertNotIn("first_approval", drugs[0])


class CoexistTest(unittest.TestCase):
    def test_history_applier_keeps_an_fda_approval(self):
        """A judged drug with no approval of its own keeps the Drugs@FDA fallback."""
        fa = {"year": 1991, "country": "us", "agency": "fda", "national": True}
        drugs = [{"id": "x", "first_approval": dict(fa),
                  "first_approval_sources": [{"corpus": "drugsfda"}]}]
        offered = {"x": {"candidates": [{"corpus": "wikipedia_pharm", "page": "x",
                                         "line": "X was approved in 1990."}]}}
        H.apply({"x": {"approval": None, "withdrawals": []}}, offered, drugs, PageGate({}))
        self.assertEqual(drugs[0]["first_approval"], fa)

    def test_national_needs_a_country(self):
        with self.assertRaises(ValueError):
            history.drug_history({"id": "x", "first_approval": {"year": 1991,
                                                                "national": True}})
        out = history.drug_history({"id": "x", "first_approval": {
            "year": 1991, "country": "us", "national": True}})
        self.assertTrue(out["first_approval"]["national"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
