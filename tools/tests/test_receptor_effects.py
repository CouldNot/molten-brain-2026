#!/usr/bin/env python
"""Tests for the ``receptor_effect`` node kind: the applier's gates and the emitter.

Built with the help of Claude Code.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import apply_receptor_effects as A  # noqa: E402
from data_generators import receptor_effects as RE  # noqa: E402

SED = "Blockade of H1 receptors causes sedation and weight gain."
HYPO = "Potent α1 antagonism may be responsible for orthostatic hypotension."


class ApplierGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "56.md").write_text(f"Header\n{SED}\n{HYPO}\n", encoding="utf-8")
        self.pages = {"stahl_essential": d}
        self.worklist = {"owners": {
            "h1": {"candidates": [
                {"corpus": "stahl_essential", "page": 56, "line": SED,
                 "effects": ["sedation", "weight_gain"]},
                {"corpus": "stahl_essential", "page": 56, "line": "Never printed.",
                 "effects": ["sedation"]},
            ]},
            "sert": {"candidates": [
                {"corpus": "stahl_essential", "page": 56, "line": SED,
                 "effects": ["sedation"]},
            ]},
        }}
        self.kinds = {"h1": "receptor", "sert": "target"}

    def tearDown(self):
        self.tmp.cleanup()

    def run_(self, owners):
        return A.apply(self.worklist, {"owners": owners}, self.kinds, pages=self.pages)

    def test_good_pick_lands_verified(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0]}]})
        self.assertEqual(misses, [])
        src = cache["h1"]["antagonism:sedation"][0]
        self.assertEqual((src["page"], src["quote"], src["provenance"]),
                         (56, SED, "verified"))

    def test_effect_not_offered_for_the_sentence_is_refused(self):
        cache, misses = self.run_({"h1": [{"effect": "constipation", "mode": "antagonism",
                                           "picks": [0]}]})
        self.assertEqual(cache, {})
        self.assertIn("not offered", misses[0])

    def test_quote_off_its_page_drops_the_whole_node(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0, 1]}]})
        self.assertEqual(cache, {})
        self.assertIn("quote not on", misses[0])

    def test_unknown_vocabulary_is_refused(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "tickling",
                                           "picks": [0]}]})
        self.assertEqual(cache, {})
        self.assertIn("closed vocabulary", misses[0])

    def test_inhibition_is_a_target_mode_only(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "inhibition",
                                           "picks": [0]}],
                                   "sert": [{"effect": "sedation", "mode": "inhibition",
                                             "picks": [0]}]})
        self.assertNotIn("h1", cache)
        self.assertIn("inhibition:sedation", cache["sert"])
        self.assertEqual(len(misses), 1)

    def test_owner_no_longer_modeled_is_refused(self):
        self.kinds.pop("h1")
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0]}]})
        self.assertEqual(cache, {})
        self.assertIn("not a current", misses[0])


class EmitterTest(unittest.TestCase):
    def test_nodes_sorted_and_graded(self):
        cache = {"h1": {"antagonism:weight_gain": [
            {"corpus": "stahl_essential", "page": 56, "quote": SED, "provenance": "verified"}],
            "antagonism:sedation": [
            {"corpus": "stahl_essential", "page": 56, "quote": SED, "provenance": "verified"}]}}
        nodes = RE.effect_nodes("h1", cache, "receptor")
        self.assertEqual([n["effect"] for n in nodes], ["sedation", "weight_gain"])
        self.assertTrue(all(n["grade"] == "verified" and n["mode"] == "antagonism"
                            for n in nodes))
        self.assertEqual(RE.effect_nodes("d2", cache, "receptor"), [])

    def test_unknown_effect_in_cache_fails_the_build(self):
        with self.assertRaises(KeyError):
            RE.effect_nodes("h1", {"h1": {"antagonism:telepathy": []}}, "receptor")

    def test_every_mode_action_is_a_drug_action(self):
        from data_generators.drugs import DRUG_ACTIONS
        for mode, v in RE.RECEPTOR_EFFECT_MODES.items():
            self.assertLessEqual(set(v["actions"]), set(DRUG_ACTIONS), mode)


if __name__ == "__main__":
    unittest.main()
