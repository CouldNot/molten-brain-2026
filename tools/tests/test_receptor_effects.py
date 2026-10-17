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
from judged_fixture import lift_owners  # noqa: E402

SED = "Blockade of H1 receptors causes sedation and weight gain."
HYPO = "Potent α1 antagonism may be responsible for orthostatic hypotension."
IV0 = {"0": "in_vivo"}


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
        return A.apply(self.worklist, {"owners": lift_owners(owners, self.worklist["owners"])}, self.kinds, pages=self.pages)

    def test_good_pick_lands_verified(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0], "evidence": IV0}]})
        self.assertEqual(misses, [])
        src = cache["h1"]["antagonism:sedation"][0]
        self.assertEqual((src["page"], src["quote"], src["provenance"]),
                         (56, SED, "verified"))

    def test_effect_not_offered_for_the_sentence_is_refused(self):
        cache, misses = self.run_({"h1": [{"effect": "constipation", "mode": "antagonism",
                                           "picks": [0], "evidence": IV0}]})
        self.assertEqual(cache, {})
        self.assertIn("not offered", misses[0])

    def test_quote_off_its_page_drops_the_whole_node(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0, 1], "evidence": {"0": "in_vivo", "1": "in_vivo"}}]})
        self.assertEqual(cache, {})
        self.assertIn("quote not on", misses[0])

    def test_unknown_vocabulary_is_refused(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "tickling",
                                           "picks": [0], "evidence": IV0}]})
        self.assertEqual(cache, {})
        self.assertIn("closed vocabulary", misses[0])

    def test_inhibition_is_a_target_mode_only(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "inhibition",
                                           "picks": [0], "evidence": IV0}],
                                   "sert": [{"effect": "sedation", "mode": "inhibition",
                                             "picks": [0], "evidence": IV0}]})
        self.assertNotIn("h1", cache)
        self.assertIn("inhibition:sedation", cache["sert"])
        self.assertEqual(len(misses), 1)

    def test_pick_without_an_evidence_reading_is_refused(self):
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0], "evidence": {"0": "in_dreams"}}]})
        self.assertEqual(cache, {})
        self.assertIn("evidence reading", misses[0])

    def test_evidence_reading_rides_the_source(self):
        cache, _ = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                      "picks": [0], "evidence": {"0": "isolated_tissue"}}]})
        self.assertEqual(cache["h1"]["antagonism:sedation"][0]["evidence"], "isolated_tissue")

    def test_a_refused_duplicate_node_never_crashes_the_stamp(self):
        """A second node with the same (mode, effect) and no evidence reading is refused;
        the evidence stamp must not then read its missing ``evidence`` (a KeyError)."""
        good = {"effect": "sedation", "mode": "antagonism", "picks": [0], "evidence": IV0}
        dup = {"effect": "sedation", "mode": "antagonism", "picks": [0]}
        cache, misses = self.run_({"h1": [good, dup]})
        self.assertEqual(cache["h1"]["antagonism:sedation"][0]["evidence"], "in_vivo")
        self.assertIn("evidence reading", misses[0])

    def test_owner_no_longer_modeled_is_refused(self):
        self.kinds.pop("h1")
        cache, misses = self.run_({"h1": [{"effect": "sedation", "mode": "antagonism",
                                           "picks": [0], "evidence": IV0}]})
        self.assertEqual(cache, {})
        self.assertIn("not a current", misses[0])


class UnknownLogTest(unittest.TestCase):
    """``--unknown-log``: one owner-level entry per searched, still effect-less owner."""
    LEDGER = {"receptor:zz9/effects": {"query": "q", "hits": 4, "read": ["1", "2"],
                                       "searched": "2026-10-16"},
              "receptor:h1/effects": {"query": "q", "hits": 9, "read": [],
                                      "searched": "2026-10-16"}}
    WL = {"owners": {"zz9": {"wikipedia": "https://en.wikipedia.org/wiki/Zz9_receptor",
                             "candidates": [{"corpus": "europepmc", "page": "1", "line": "x"},
                                            {"corpus": "wikipedia_pharm", "page": "z",
                                             "line": "y"}]}}}
    BY = {"harness": "Claude Code", "model": "opus"}

    def test_entry_covers_every_required_corpus(self):
        from data_generators import unknown
        log = A.unknown_log(self.WL, {}, {"zz9": "receptor"}, self.LEDGER, self.BY)
        e = log["receptor:zz9/effects"]
        self.assertEqual(e["kind"], "receptor_effect")
        self.assertEqual(e["candidates_offered"], 2)
        self.assertEqual(unknown.missing_required("receptor_effect", unknown.stamp(e)["corpora"]),
                         [])
        epmc = next(s for s in e["sources"] if s["corpus"] == "europepmc")
        self.assertEqual((epmc["hits"], epmc["read"], epmc["offered"]), (4, ["1", "2"], 1))

    def test_an_owner_with_an_effect_gets_no_entry_and_loses_a_stale_one(self):
        prior = {"receptor:h1/effects": {"kind": "receptor_effect"},
                 "drug:a/bindings[d2]": {"kind": "drug_binding_action"}}
        log = A.unknown_log(self.WL, {"h1": {"antagonism:sedation": []}},
                            {"h1": "receptor"}, self.LEDGER, self.BY, prior)
        self.assertEqual(list(log), ["drug:a/bindings[d2]"])


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

    def test_isolated_tissue_flag_only_when_every_source_is_isolated(self):
        def src(quote, evidence):
            return {"corpus": "stahl_essential", "page": 56, "quote": quote,
                    "provenance": "verified", "evidence": evidence}
        cache = {"h3": {"agonism:vasoconstriction": [src(SED, "isolated_tissue")],
                        "agonism:vasodilation": [src(SED, "isolated_tissue"),
                                                 src(HYPO, "in_vivo")]}}
        nodes = {n["effect"]: n for n in RE.effect_nodes("h3", cache, "receptor")}
        bullet = nodes["vasoconstriction"]["uncertainty"][0]
        self.assertEqual(bullet["kind"], "isolated_tissue")
        self.assertEqual(bullet["sources"][0]["quote"], SED)
        self.assertNotIn("uncertainty", nodes["vasodilation"])
        self.assertNotIn("evidence", nodes["vasoconstriction"]["sources"][0])

    def test_isolated_tissue_bullet_cites_every_isolated_source(self):
        def src(quote):
            return {"corpus": "stahl_essential", "page": 56, "quote": quote,
                    "provenance": "verified", "evidence": "isolated_tissue"}
        cache = {"h3": {"agonism:vasoconstriction": [src(SED), src(HYPO)]}}
        node = RE.effect_nodes("h3", cache, "receptor")[0]
        bullet = node["uncertainty"][0]
        self.assertEqual([s["quote"] for s in bullet["sources"]], [SED, HYPO])

    def test_unknown_effect_in_cache_fails_the_build(self):
        with self.assertRaises(KeyError):
            RE.effect_nodes("h1", {"h1": {"antagonism:telepathy": []}}, "receptor")

    def test_every_mode_action_is_a_drug_action(self):
        from data_generators.drugs import DRUG_ACTIONS
        for mode, v in RE.RECEPTOR_EFFECT_MODES.items():
            self.assertLessEqual(set(v["actions"]), set(DRUG_ACTIONS), mode)


class EffectSearchTermsTest(unittest.TestCase):
    """The UNKNOWN search's Europe PMC terms (``fetch_europepmc.effect_terms``)."""

    def test_an_alias_already_naming_the_receptor_is_kept_once(self):
        sys.path.insert(0, str(ROOT / "tools" / "fetch"))
        import fetch_europepmc as E
        terms = E.effect_terms("gaba_a_rho", {"gaba_a_rho": ["GABA-C", "GABAC receptor"]},
                               {"gaba_a_rho": {"GABRR1"}})
        self.assertEqual(terms, ["GABA-C receptor", "GABAC receptor", "GABRR1",
                                 "GABAA-rho receptor", "GABA rho receptor"])
        self.assertEqual(len({t.lower() for t in terms}), len(terms))


if __name__ == "__main__":
    unittest.main()
