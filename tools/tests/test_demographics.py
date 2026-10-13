#!/usr/bin/env python
"""Tests for the ``receptor_demographic`` node kind: applier gates, emitter, fetcher cues.

Built with the help of Claude Code.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
import apply_demographics as A  # noqa: E402
import fetch_demographics as F  # noqa: E402
from data_generators import demographics as DM  # noqa: E402

AGE = "The decrease in DA D2 receptor availability was 6.6% per decade in caudate."
SEX = "Females were found to have significantly higher binding ratios than males."
GOOD = {"factor": "age", "direction": "decrease", "structure": "caudate",
        "magnitude": "6.6% per decade", "picks": [0]}


class ApplierGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "111.md").write_text(f"# Title\npmid: 111\n\n{AGE}\n", encoding="utf-8")
        (d / "222.md").write_text(f"# Title\npmid: 222\n\n{SEX}\n", encoding="utf-8")
        self.pages = {"europepmc": d}
        self.worklist = {"owners": {
            "d2": {"candidates": [
                {"corpus": "europepmc", "page": "111", "line": AGE, "factors": ["age"]},
                {"corpus": "europepmc", "page": "222", "line": SEX, "factors": ["sex"]},
            ]},
        }}
        self.kinds = {"d2": "receptor"}
        self.species = {"111": ["human"], "222": ["rat"]}

    def tearDown(self):
        self.tmp.cleanup()

    def run_(self, nodes):
        return A.apply(self.worklist, {"owners": {"d2": nodes}}, self.kinds, {"caudate"},
                       self.species, pages=self.pages)

    def test_good_pick_lands_with_magnitude(self):
        cache, misses = self.run_([GOOD])
        self.assertEqual(misses, [])
        src = cache["d2"]["age:decrease:caudate"][0]
        self.assertEqual((src["quote"], src["provenance"], src["magnitude"]),
                         (AGE, "verified", "6.6% per decade"))

    def test_direction_outside_its_factor_is_refused(self):
        cache, misses = self.run_([{**GOOD, "direction": "higher_in_female"}])
        self.assertEqual(cache, {})
        self.assertIn("not allowed", misses[0])

    def test_factor_not_offered_is_refused(self):
        cache, misses = self.run_([{**GOOD, "factor": "sex", "direction": "no_difference"}])
        self.assertEqual(cache, {})
        self.assertIn("not offered", misses[0])

    def test_animal_paper_is_refused(self):
        cache, misses = self.run_([{"factor": "sex", "direction": "higher_in_female",
                                    "structure": None, "picks": [1]}])
        self.assertEqual(cache, {})
        self.assertIn("not human", misses[0])

    def test_magnitude_must_be_verbatim(self):
        cache, misses = self.run_([{**GOOD, "magnitude": "10% per decade"}])
        self.assertEqual(cache, {})
        self.assertIn("magnitude", misses[0])

    def test_unknown_structure_is_refused(self):
        cache, misses = self.run_([{**GOOD, "structure": "striatum"}])
        self.assertEqual(cache, {})
        self.assertIn("not a modeled structure", misses[0])


class EmitterTest(unittest.TestCase):
    def test_node_carries_fields_and_magnitude(self):
        cache = {"d2": {"age:decrease:caudate": [
            {"corpus": "europepmc", "page": "111", "quote": AGE, "provenance": "verified",
             "magnitude": "6.6% per decade"}]}}
        [n] = DM.demographic_nodes("d2", cache, "Receptor", {"caudate"})
        self.assertEqual((n["factor"], n["direction"], n["structure"], n["magnitude"],
                          n["grade"]), ("age", "decrease", "caudate", "6.6% per decade",
                                        "verified"))

    def test_vocabulary_break_fails_build(self):
        with self.assertRaises(KeyError):
            DM.demographic_nodes("d2", {"d2": {"age:higher_in_male:-": []}}, "Receptor")

    def test_key_round_trips(self):
        self.assertEqual(DM.parse_key(DM.node_key("sex", "no_difference", None)),
                         {"factor": "sex", "direction": "no_difference", "structure": None})


class FetcherCueTest(unittest.TestCase):
    def test_factor_hits(self):
        self.assertEqual(F.factor_hits(AGE), ["age"])
        self.assertEqual(F.factor_hits(SEX), ["sex"])
        self.assertEqual(F.factor_hits("Binding was measured with PET."), [])

    def test_routing_only_names_listed_papers(self):
        from fetch_europepmc import PAPERS
        for pmids in F.PAPERS_BY_OWNER.values():
            self.assertTrue(set(pmids) <= set(PAPERS))


if __name__ == "__main__":
    unittest.main()
