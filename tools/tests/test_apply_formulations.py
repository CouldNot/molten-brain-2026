#!/usr/bin/env python
"""Unit tests for the formulation applier (``tools/sourcing/apply_formulations.py``).

Stdlib ``unittest`` only, offline: the page gate is a stub and every brand below is
placed either by its own quote's release suffix (code) or by a judged pick, so the
author-side ``data_sources/`` tree is never read::

    python -m unittest discover -t tools/tests -s tools/tests -p test_apply_formulations.py

Built with the help of Claude Code.
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import apply_formulations as A  # noqa: E402
from pipeline.judged import qid  # noqa: E402


class _Gate:
    """Every line is on its page unless listed in ``missing``."""

    def __init__(self, missing=()):
        self.missing = set(missing)

    def on_page(self, corpus, page, line):
        return line not in self.missing


def _src(quote, corpus="stahl", page=1):
    return {"corpus": corpus, "page": page, "quote": quote, "provenance": "verified"}


def _brand(name, quote=None):
    return {"name": name, "region": "na", "sources": [_src(quote or name)]}


WIKI = "Concerta is an extended-release tablet; Ritalin is the immediate-release one."
QID = qid(WIKI)  # what a judge echoes beside index 0


def _offered(**items):
    return {"drug": {"name": "Drug", "items": items}}


class CodeReadTest(unittest.TestCase):
    def test_own_suffix_places_the_brand(self):
        d = {"id": "drug", "brands": [_brand("Seroquel XR"), _brand("Seroquel")]}
        stats = A.apply([d], {}, {}, _Gate())
        self.assertEqual(stats["brands"], 1)
        self.assertEqual([b["name"] for b in d["brands"]], ["Seroquel"])
        (f,) = d["formulations"]
        self.assertEqual(f["release"], "xr")
        self.assertEqual(f["release_sources"][0]["extraction"], "code")

    def test_multi_brand_entry_is_never_split(self):
        d = {"id": "drug", "brands": [_brand("Depakote, Depakote ER")]}
        A.apply([d], {}, {}, _Gate())
        self.assertNotIn("formulations", d)
        self.assertEqual(len(d["brands"]), 1)

    def test_french_la_is_not_ritalin_la(self):
        d = {"id": "drug", "brands": [_brand("La Ritaline", "La Ritaline est vendue")]}
        A.apply([d], {}, {}, _Gate())
        self.assertNotIn("formulations", d)


class JudgedPickTest(unittest.TestCase):
    def _brand_item(self, name):
        return {"brand": name, "candidates": [
            {"corpus": "wikipedia_pharm", "page": "x", "line": WIKI, "releases": ["xr", "ir"]}]}

    def test_gated_brand_pick_moves_the_brand(self):
        d = {"id": "drug", "brands": [_brand("Concerta")]}
        offered = _offered(**{"brand:Concerta": self._brand_item("Concerta")})
        judged = {"drug": {"brand:Concerta": {"index": 0, "qid": QID, "release": "xr"}}}
        stats = A.apply([d], judged, offered, _Gate())
        self.assertEqual((stats["brands"], stats["rejected"]), (1, []))
        self.assertNotIn("brands", d)
        self.assertEqual(d["formulations"][0]["brands"][0]["name"], "Concerta")

    def test_rejects(self):
        cases = {
            "bad index": {"index": 3, "release": "xr"},
            "release the sentence never names": {"index": 0, "qid": QID, "release": "depot"},
        }
        for why, pick in cases.items():
            with self.subTest(why):
                d = {"id": "drug", "brands": [_brand("Concerta")]}
                offered = _offered(**{"brand:Concerta": self._brand_item("Concerta")})
                stats = A.apply([d], {"drug": {"brand:Concerta": pick}}, offered, _Gate())
                self.assertEqual(len(stats["rejected"]), 1)
                self.assertNotIn("formulations", d)
        # Off its page: rejected too.
        d = {"id": "drug", "brands": [_brand("Concerta")]}
        offered = _offered(**{"brand:Concerta": self._brand_item("Concerta")})
        stats = A.apply([d], {"drug": {"brand:Concerta": {"index": 0, "qid": QID, "release": "xr"}}},
                        offered, _Gate(missing={WIKI}))
        self.assertEqual(len(stats["rejected"]), 1)

    def test_split_half_life_and_molecule_answer(self):
        q = "Elimination half-life | IR : 2–3 hours CR : 4.5 hours"
        item = {"value": {"hours": 2, "hours_max": 3}, "candidates": [{
            "corpus": "wikipedia_pharm", "page": "oxycodone", "line": q,
            "releases": ["xr", "ir"],
            "durations": [{"hours": 2, "hours_max": 3}, {"hours": 4.5}]}]}

        def drug():
            return {"id": "drug", "half_life": {"hours": 2, "hours_max": 3},
                    "half_life_sources": [_src(q, "wikipedia_pharm", "oxycodone")]}

        d = drug()
        judged = {"drug": {"half_life": {"picks": [
            {"release": "ir", "hours": 2, "hours_max": 3}, {"release": "xr", "hours": 4.5}]}}}
        stats = A.apply([d], judged, _offered(half_life=item), _Gate())
        self.assertEqual(stats["rejected"], [])
        self.assertNotIn("half_life", d)
        by = {f["release"]: f["half_life"] for f in d["formulations"]}
        self.assertEqual(by, {"ir": {"hours": 2.0, "hours_max": 3.0}, "xr": {"hours": 4.5}})

        d = drug()
        A.apply([d], {"drug": {"half_life": {"molecule": True}}},
                _offered(half_life=item), _Gate())
        self.assertIn("half_life", d)
        self.assertNotIn("formulations", d)

        d = drug()     # a value the sentence never states
        stats = A.apply([d], {"drug": {"half_life": {"picks": [
            {"release": "xr", "hours": 6}]}}}, _offered(half_life=item), _Gate())
        self.assertEqual(len(stats["rejected"]), 1)
        self.assertIn("half_life", d)

    def test_idempotent(self):
        d = {"id": "drug", "brands": [_brand("Seroquel XR")]}
        A.apply([d], {}, {}, _Gate())
        before = repr(d)
        stats = A.apply([d], {}, {}, _Gate())
        self.assertEqual((repr(d), stats["brands"]), (before, 0))


if __name__ == "__main__":
    unittest.main()
