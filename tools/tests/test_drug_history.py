#!/usr/bin/env python
"""Unit tests for the drug regulatory-history pass (fetcher scan + applier gates).

Stdlib ``unittest`` only; drives the gates over a hand-built worklist and a fake page
store in a temp dir, so it runs on a clone that lacks the gitignored corpus trees::

    python -m unittest discover -t tools/tests -s tools/tests -p test_drug_history.py

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
import apply_drug_history as A  # noqa: E402
from judged_fixture import fill_tree  # noqa: E402
import fetch_drug_history as F  # noqa: E402
from pipeline.gate import PageGate  # noqa: E402 (the applier's page gate)
from data_generators import history as H  # noqa: E402

LINES = [
    "Nefazodone was introduced for medical use in the United States in 1994.",   # 0
    "Nefazodone was patented in 1980.",                                            # 1
    "Health Canada withdrew the marketing authorization in 2003 due to liver toxicity.",  # 2
    "Nefazodone was withdrawn from most markets by 2004.",                         # 3
    "Nefazodone was approved by the FDA.",                                         # 4
]


class GateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        en = Path(self.tmp.name)
        (en / "nefazodone.md").write_text("Header\n" + "\n".join(LINES) + "\n", "utf-8")
        self.gate = PageGate({"wikipedia_pharm": en})
        self.offered = {"nefazodone": {"candidates": [
            {"corpus": "wikipedia_pharm", "page": "nefazodone", "line": ln} for ln in LINES]}}
        self.drugs = [{"id": "nefazodone"}, {"id": "sertraline"}]

    def tearDown(self):
        self.tmp.cleanup()

    def run_apply(self, rec, did="nefazodone"):
        cands = self.offered.get(did, {}).get("candidates", [])
        return A.apply({did: fill_tree(rec, cands)}, self.offered, self.drugs, self.gate)

    def test_good_picks_land(self):
        _, rej = self.run_apply({
            "approval": {"index": 0, "year": 1994, "country": "us"},
            "withdrawals": [{"index": 3, "year": 2004, "country": "most_markets",
                             "reason": "unstated"},
                            {"index": 2, "year": 2003, "country": "ca", "reason": "liver"}]})
        self.assertEqual(rej, [])
        d = self.drugs[0]
        self.assertEqual(d["first_approval"], {"year": 1994, "country": "us"})
        self.assertEqual(d["first_approval_sources"][0]["quote"], LINES[0])
        self.assertEqual([w["year"] for w in d["withdrawals"]], [2003, 2004])

    def test_patent_only_sentence_is_not_an_approval(self):
        _, rej = self.run_apply({"approval": {"index": 1, "year": 1980}})
        self.assertNotIn("first_approval", self.drugs[0])
        self.assertIn("no approval", rej[0])

    def test_year_must_be_in_quote(self):
        _, rej = self.run_apply({"approval": {"index": 0, "year": 1993}})
        self.assertIn("year", rej[0])
        _, rej = self.run_apply({"approval": {"index": 4, "year": 1994, "agency": "fda"}})
        self.assertIn("year", rej[0])

    def test_wrong_drug_is_refused(self):
        _, rej = self.run_apply({"approval": {"index": 0, "year": 1994}}, did="sertraline")
        self.assertNotIn("first_approval", self.drugs[1])
        self.assertIn("offers no candidate", rej[0])
        _, rej = self.run_apply({"approval": {"index": 0, "year": 1994}}, did="nope")
        self.assertIn("not a dataset drug", rej[0])

    def test_country_and_reason_must_be_attested(self):
        _, rej = self.run_apply({"approval": {"index": 0, "year": 1994, "country": "fr"},
                                 "withdrawals": [{"index": 3, "year": 2004,
                                                  "country": "most_markets", "reason": "liver"}]})
        self.assertNotIn("first_approval", self.drugs[0])
        self.assertNotIn("withdrawals", self.drugs[0])
        self.assertEqual(len(rej), 2)

    def test_negative_index_never_wraps(self):
        _, rej = self.run_apply({"approval": {"index": -5, "year": 1994}})
        self.assertIn("out of range", rej[0])

    def test_quote_must_be_on_page(self):
        self.offered["nefazodone"]["candidates"].append(
            {"corpus": "wikipedia_pharm", "page": "nefazodone",
             "line": "Nefazodone was approved in 1999."})
        _, rej = self.run_apply({"approval": {"index": 5, "year": 1999}})
        self.assertIn("quote not on", rej[0])

    def test_food_ban_is_not_a_medicine_withdrawal(self):
        """Regression: lithium's 1949 US ban was of lithium salts sold as a table-salt
        substitute, which the withdrawal sentence only reaches through "This practice"
        in the sentence before it (the candidate's ``context``)."""
        line = ("This practice and the sale of lithium itself were both banned in the "
                "United States in February 1949, following the publication of reports.")
        ctx = "Lithium salts were prescribed for use as a replacement for dietary table salt."
        (Path(self.tmp.name) / "lithium.md").write_text(f"{ctx} {line}\n", "utf-8")
        self.offered["lithium"] = {"candidates": [
            {"corpus": "wikipedia_pharm", "page": "lithium", "line": line, "context": ctx}]}
        self.drugs.append({"id": "lithium"})
        _, rej = self.run_apply({"withdrawals": [{"index": 0, "year": 1949, "country": "us",
                                                  "reason": "unstated"}]}, did="lithium")
        self.assertNotIn("withdrawals", self.drugs[2])
        self.assertIn("not a medicine", rej[0])
        # Control: the same sentence after a medical one lands.
        self.offered["lithium"]["candidates"][0]["context"] = "Lithium treats mania."
        _, rej = self.run_apply({"withdrawals": [{"index": 0, "year": 1949, "country": "us",
                                                  "reason": "unstated"}]}, did="lithium")
        self.assertEqual(rej, [])


class ScanTest(unittest.TestCase):
    def test_sections_and_keywords(self):
        page = ("Lead line: X was approved in 1990.\n"
                "## Pharmacology\nX was approved in 1991 for nothing.\n"
                "## History\nX was withdrawn in 2001 due to liver toxicity.\n"
                "X was synthesized in 1970.\n"
                "# WHO-EM ‡ Withdrawn from market 1999\n")
        lines = [c["line"] for c in F.candidates_in(page, "wikipedia_pharm", "x")]
        self.assertEqual(lines, ["Lead line: X was approved in 1990.",
                                 "X was withdrawn in 2001 due to liver toxicity."])

    def test_candidate_carries_the_sentence_before(self):
        page = "## History\nX was sold as table salt. That was banned in 1949.\n"
        cand = F.candidates_in(page, "wikipedia_pharm", "x")[0]
        self.assertEqual(cand["context"], "X was sold as table salt.")


class EmitTest(unittest.TestCase):
    SRC = [{"corpus": "wikipedia_pharm", "page": "x", "quote": "X was approved in 1990.",
            "provenance": "verified"}]

    def test_emits_only_present_keys_sorted(self):
        out = H.drug_history({"id": "x", "first_approval": {"year": 1990, "country": "us",
                                                            "agency": None},
                              "first_approval_sources": self.SRC,
                              "withdrawals": [
                                  {"year": 2004, "country": "uk", "reason": "liver",
                                   "sources": self.SRC},
                                  {"year": 2001, "country": "us", "reason": "unstated"}]})
        self.assertEqual(out["first_approval"], {"year": 1990, "country": "us"})
        self.assertEqual([w["year"] for w in out["withdrawals"]], [2001, 2004])
        self.assertEqual(H.drug_history({"id": "y"}), {})

    def test_unknown_vocabulary_fails_the_build(self):
        with self.assertRaises(KeyError):
            H.drug_history({"id": "x", "withdrawals": [
                {"year": 2004, "country": "atlantis", "reason": "liver"}]})
        with self.assertRaises(KeyError):
            H.drug_history({"id": "x", "first_approval": {"year": 1990, "agency": "nope"}})
        with self.assertRaises(ValueError):
            H.drug_history({"id": "x", "first_approval": {"year": "1990"}})

    def test_every_label_is_bilingual(self):
        for vocab in (H.COUNTRIES, H.AGENCIES, H.WITHDRAWAL_REASONS):
            for k, v in H.labels(vocab).items():
                self.assertTrue(v["en"] and v["fr"], k)


if __name__ == "__main__":
    unittest.main()
