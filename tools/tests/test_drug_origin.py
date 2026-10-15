#!/usr/bin/env python
"""Unit tests for a drug's origin nodes: current holders (code-read applier), originator
+ its country (four-step pass gates), and the emitter's shape checks.

Stdlib ``unittest`` only; fake page stores in a temp dir, so it runs on a clone that
lacks the gitignored corpus trees::

    python -m unittest discover -t tools/tests -s tools/tests -p test_drug_origin.py

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
import apply_drug_holders as AH  # noqa: E402
from data_generators import origin  # noqa: E402
from prose_gate import PageGate  # noqa: E402

FDA_PAGE = ("# Drugs@FDA application NDA020639 (CHEPLAPHARM)\n"
            "application: NDA020639\n\n"
            "NDA020639 | SEROQUEL | QUETIAPINE FUMARATE | TABLET | ORIG approved 1997-09-26\n")
BDPM_PAGE = ("# XEROQUEL 25 mg, comprimé pelliculé\ncis: {cis}\nform: comprimé\n"
             "holder: {holder}\nsource: https://example.org\n\nLe pic est atteint en 1,5 h.\n"
             "holder: NOT A HEADER\n")


class HolderTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        base = Path(tmp.name)
        self.dirs = {"drugsfda": base / "fda", "bdpm": base / "bdpm"}
        for d in self.dirs.values():
            d.mkdir()
        (self.dirs["drugsfda"] / "NDA020639.md").write_text(FDA_PAGE, "utf-8")
        (self.dirs["drugsfda"] / "NDA000001.md").write_text(
            "# Drugs@FDA application NDA000001 (sponsor not stated)\n", "utf-8")
        for cis, holder in (("1", "UPJOHN (PAYS-BAS)"), ("2", "ETHYPHARM"), ("3", "ETHYPHARM")):
            (self.dirs["bdpm"] / f"{cis}.md").write_text(
                BDPM_PAGE.format(cis=cis, holder=holder), "utf-8")
        self.pages = PageGate(self.dirs)

    def run_apply(self, fda_rec=None, bdpm_rec=None):
        drugs = [{"id": "x", "holders": [{"market": "us", "names": ["STALE"]}]}]
        AH.apply({"x": fda_rec} if fda_rec else {}, {"x": bdpm_rec} if bdpm_rec else {},
                 drugs, self.pages, self.dirs)
        return drugs[0].get("holders")

    def test_us_sponsor_from_the_title_line(self):
        rows = self.run_apply({"status": "found", "application": "NDA020639"})
        self.assertEqual(rows, [{"market": "us", "names": ["CHEPLAPHARM"], "sources": [{
            "corpus": "drugsfda", "page": "NDA020639",
            "quote": "Drugs@FDA application NDA020639 (CHEPLAPHARM)",
            "provenance": "verified", "extraction": "code"}]}])

    def test_us_needs_a_found_record_and_a_stated_sponsor(self):
        """A superseded record, a missing page and "sponsor not stated" publish nothing,
        and a rebuild drops a stale holder."""
        self.assertIsNone(self.run_apply({"status": "superseded", "application": "NDA020639"}))
        self.assertIsNone(self.run_apply({"status": "found", "application": "NDA000001"}))
        self.assertIsNone(self.run_apply({"status": "found", "application": "NDA999999"}))

    def test_fr_holders_fold_into_one_node_per_market(self):
        rows = self.run_apply(bdpm_rec={"brands": [{"cis": "1"}, {"cis": "2"}, {"cis": "3"}]})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["names"], ["UPJOHN (PAYS-BAS)", "ETHYPHARM"])
        self.assertEqual([s["quote"] for s in rows[0]["sources"]],
                         ["holder: UPJOHN (PAYS-BAS)", "holder: ETHYPHARM"])

    def test_fr_reads_only_the_header_block(self):
        """A `holder:` line below the header's blank line is body text, never read."""
        (self.dirs["bdpm"] / "4.md").write_text("# X\ncis: 4\n\nholder: BODY\n", "utf-8")
        self.assertIsNone(self.run_apply(bdpm_rec={"brands": [{"cis": "4"}]}))

    def test_gate_drops_a_name_its_quote_does_not_carry(self):
        found = [("UPJOHN", "holder: PFIZER", "1"), ("ETHYPHARM", "holder: ETHYPHARM", "2")]
        row = AH.gate("fr", found, self.pages)
        self.assertEqual(row["names"], ["ETHYPHARM"])
        self.assertIsNone(AH.gate("fr", [("X", "holder: X", "1")], self.pages))  # not on page


class EmitTest(unittest.TestCase):
    def test_holders_validate_market_and_order(self):
        out = origin.drug_origin({"id": "x", "holders": [
            {"market": "fr", "names": ["B"]}, {"market": "us", "names": ["A"]}]})
        self.assertEqual([h["market"] for h in out["holders"]], ["us", "fr"])
        with self.assertRaises(KeyError):
            origin.drug_origin({"id": "x", "holders": [{"market": "de", "names": ["A"]}]})
        with self.assertRaises(ValueError):
            origin.drug_origin({"id": "x", "holders": [{"market": "us", "names": []}]})

    def test_originator_now_needs_its_own_source(self):
        with self.assertRaises(ValueError):
            origin.drug_origin({"id": "x", "originator": {"name": "A", "now": "B"}})
        with self.assertRaises(ValueError):  # a country with no originator
            origin.drug_origin({"id": "x", "originator_country": "dk"})
        with self.assertRaises(KeyError):  # a market scope is not a country
            origin.drug_origin({"id": "x", "originator": {"name": "A"},
                                "originator_country": "worldwide"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
