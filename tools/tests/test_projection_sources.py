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


if __name__ == "__main__":
    unittest.main()
