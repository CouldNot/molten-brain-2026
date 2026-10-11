#!/usr/bin/env python
"""Tests for ``apply_projection_sources.apply``, the gated by-index projection pass.

Built with the help of Claude Code.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import apply_projection_sources as A  # noqa: E402

TX = "The thalamocortical projections are glutamatergic and activate cortical neurons."
SIGN = "The thalamocortical fibres form excitatory synapses with pyramidal cells."
ROUTE = "The dopaminergic cells in the substantia nigra project to the caudate nucleus."
OFF = "This glutamatergic sentence is not on any page."

KEY = "thalamus_R->frontal_R"
NIGRA = "substantia_nigra_R->caudate_R"


class ProjectionGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "446.md").write_text(f"Header\n{TX} {SIGN}\n{ROUTE}\n", encoding="utf-8")
        self.pages = {"nieuwenhuys": d}
        cand = lambda line, *attrs: {"corpus": "nieuwenhuys", "page": 446, "line": line,
                                     "attrs": list(attrs)}
        self.worklist = {"projections": {
            KEY: {"transmitter": "Glutamate", "sign": "excitatory",
                  "need": ["transmitter", "sign"],
                  "candidates": [cand(TX, "transmitter"), cand(SIGN, "sign"),
                                 cand(OFF, "transmitter")]},
            NIGRA: {"transmitter": "Dopamine", "sign": None, "need": ["route"],
                    "candidates": [cand(ROUTE, "route")]},
        }}
        self.current = {KEY: {"transmitter": "Glutamate", "sign": "excitatory"},
                        NIGRA: {"transmitter": "Dopamine", "sign": None}}

    def tearDown(self):
        self.tmp.cleanup()

    def run_(self, judged, current=None):
        out = {}
        n, misses = A.apply(self.worklist, judged, current or self.current, out, self.pages)
        return n, misses, out

    def test_picks_land_and_are_idempotent(self):
        judged = {KEY: {"transmitter": [0], "sign": [1]}, NIGRA: {"route": [0]}}
        n, misses, out = self.run_(judged)
        self.assertEqual((n, misses), (3, []))
        self.assertEqual(sorted(s["quote"] for s in out[KEY]), sorted([TX, SIGN]))
        n2, _ = A.apply(self.worklist, judged, self.current, out, self.pages)
        self.assertEqual(n2, 0)

    def test_quote_not_on_page_is_rejected(self):
        n, misses, out = self.run_({KEY: {"transmitter": [2]}})
        self.assertEqual((n, out), (0, {}))
        self.assertIn("quote not on", misses[0])

    def test_pick_must_be_offered_for_that_attribute(self):
        # A sign sentence picked for the transmitter claim would not move it.
        n, misses, _ = self.run_({KEY: {"transmitter": [1]}})
        self.assertEqual(n, 0)
        self.assertIn("not offered", misses[0])

    def test_closed_claim_and_changed_value_write_nothing(self):
        n, misses, _ = self.run_({KEY: {"route": [0]}})
        self.assertEqual(n, 0)
        self.assertIn("not an open claim", misses[0])
        changed = {**self.current, KEY: {"transmitter": "GABA", "sign": "inhibitory"}}
        n, misses, _ = self.run_({KEY: {"transmitter": [0]}}, changed)
        self.assertEqual(n, 0)
        self.assertIn("value changed", misses[0])

    def test_bad_index_writes_nothing(self):
        n, misses, _ = self.run_({NIGRA: {"route": [5]}})
        self.assertEqual(n, 0)
        self.assertIn("out of range", misses[0])



class SetLevelAllowanceTest(unittest.TestCase):
    """``fetch_projection_worklist.candidates`` refuses a sentence naming neither
    endpoint exactly, except the documented SET_LEVEL_PAIRS (cerebral cortex -> striatum),
    and even there never offers it for ``route``."""

    @classmethod
    def setUpClass(cls):
        sys.path.insert(0, str(ROOT / "tools" / "fetch"))
        import fetch_projection_worklist as F
        cls.F = F
        cls.des = {"frontal": {"frontal"}, "caudate": {"caudate"},
                   "hippocampus": {"hippocampus"}, "parietal": {"parietal"}}

    def offer(self, frm, to, line, need=("transmitter", "sign", "route")):
        proj = {"from": frm, "to": to, "transmitter": "Glutamate", "sign": "excitatory",
                "need": list(need), "flag": []}
        return self.F.candidates(proj, [("kandel", 1, line)], self.des)

    def test_cortex_to_striatum_offered_for_transmitter_and_sign_only(self):
        got = self.offer("frontal_R", "caudate_R",
                         "Signals received by the striatum from the cerebral cortex are "
                         "conveyed by excitatory glutamatergic neurotransmission.")
        self.assertEqual(len(got), 1)
        self.assertEqual(sorted(got[0]["attrs"]), ["sign", "transmitter"])

    def test_other_both_coarse_pairs_stay_refused(self):
        self.assertEqual(self.offer(
            "parietal_R", "frontal_R",
            "Cortico-cortical fibres from the cerebral cortex are glutamatergic and "
            "excitatory."), [])


class SetClaimFlagTest(unittest.TestCase):
    """``uncertainty.apply_set_claim_uncertainty``: a sub-claim (or the route) backed only
    by a sentence naming neither endpoint, shared by pathways from two or more origins, is
    flagged where that sentence backs it; one origin, or a named endpoint, is not."""

    SET = "Signals from the cerebral cortex to the striatum are glutamatergic."

    @classmethod
    def setUpClass(cls):
        from data_generators.quotes.uncertainty import apply_set_claim_uncertainty
        cls.apply = staticmethod(apply_set_claim_uncertainty)
        cls.structures = [{"id": f"{b}_R", "base_name": b}
                          for b in ("frontal", "parietal", "caudate", "putamen")]

    ROUTE = "The caudate receives cortical input."

    def proj(self, frm, to, quote, route=None):
        src = {"corpus": "kandel", "page": 1, "quote": quote, "provenance": "verified"}
        rsrc = dict(src, quote=route) if route else src
        return {"from": frm, "to": to, "sources": [rsrc],
                "claims": {"transmitter": {"grade": "verified", "sources": [src]}}}

    def test_two_origins_flag_the_sub_claim(self):
        ps = [self.proj("frontal_R", "caudate_R", self.SET, route=self.ROUTE),
              self.proj("parietal_R", "caudate_R", self.SET, route=self.ROUTE)]
        self.apply(ps, self.structures)
        for p in ps:
            bullets = p["claims"]["transmitter"].get("uncertainty")
            self.assertEqual([b["kind"] for b in bullets], ["set_claim"])
            self.assertEqual(bullets[0]["args"], {"n": 2})
            self.assertNotIn("uncertainty", p)

    def test_one_origin_or_a_named_end_is_not_flagged(self):
        ps = [self.proj("frontal_R", "caudate_R", self.SET),
              self.proj("frontal_R", "putamen_R", self.SET),
              self.proj("parietal_R", "caudate_R",
                        "Parietal fibres to the caudate are glutamatergic."),
              self.proj("frontal_R", "parietal_R",
                        "Parietal fibres to the caudate are glutamatergic.")]
        self.apply(ps, self.structures)
        for p in ps:
            self.assertFalse(p["claims"]["transmitter"].get("uncertainty"), p["to"])

    def test_a_set_level_route_is_flagged_on_the_pathway(self):
        # parietal / temporal -> caudate rest on Kandel p981 "input from most regions of
        # the cerebral cortex" (to the striatum): two origins, one target, neither named.
        # The one-origin blanket grouping cannot see it; the route set_claim does, and it
        # is appended after a bullet the pathway already carries.
        route = ("The striatum receives direct input from most regions of the cerebral "
                 "cortex.")
        ps = [self.proj("parietal_R", "caudate_R", self.SET, route=route),
              self.proj("frontal_R", "caudate_R", self.SET, route=route)]
        ps[0]["uncertainty"] = [{"kind": "blanket_claim"}]
        self.apply(ps, self.structures)
        self.assertEqual([b["kind"] for b in ps[0]["uncertainty"]],
                         ["blanket_claim", "set_claim"])
        self.assertEqual([b["kind"] for b in ps[1]["uncertainty"]], ["set_claim"])
        self.assertEqual(ps[1]["uncertainty"][0]["args"], {"n": 2})
        self.assertEqual(ps[1]["uncertainty"][0]["sources"][0]["quote"], route)


if __name__ == "__main__":
    unittest.main()
