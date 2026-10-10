#!/usr/bin/env python
"""Tests for ``apply_classification_sources.apply_prose``, the gated --prose mode.

Built with the help of Claude Code.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import apply_classification_sources as A  # noqa: E402

PRE = "D2 receptors can be presynaptic autoreceptors on dopamine neurons."
POST = "Postsynaptic D2 receptors are present in the striatum."
SIGN = "The NMDA receptor is a non-specific cation channel."


class ProseGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "12.md").write_text(f"Header\n{PRE} {POST}\n", encoding="utf-8")
        (d / "nmda.md").write_text(f"{SIGN}\n", encoding="utf-8")
        self.pages = {"stahl_essential": d, "wikipedia_pharm": d}
        self.worklist = {"owners": {
            "d2": {"need": ["synaptic"], "values": {"synaptic": "both"}, "candidates": [
                {"corpus": "stahl_essential", "page": 12, "line": PRE},
                {"corpus": "stahl_essential", "page": 12, "line": POST},
                {"corpus": "stahl_essential", "page": 12, "line": "Never printed anywhere."},
            ]},
            "nmda": {"need": ["sign"], "values": {"sign": "excitatory"}, "candidates": [
                {"corpus": "wikipedia_pharm", "page": "nmda", "line": SIGN},
            ]},
        }}
        self.receptors = {"d2": {"synaptic": "both"}, "nmda": {"sign": "excitatory"}}

    def tearDown(self):
        self.tmp.cleanup()

    def run_(self, judged, receptors=None):
        rec_out, tgt_out = {}, {}
        n, misses = A.apply_prose(self.worklist, {"receptors": judged},
                                  receptors or self.receptors, {}, rec_out, tgt_out,
                                  pages=self.pages)
        return n, misses, rec_out

    def test_both_needs_one_quote_per_site(self):
        n, misses, out = self.run_({"d2": {"synaptic": {"presynaptic": [0],
                                                        "postsynaptic": [1]}}})
        self.assertEqual((n, misses), (2, []))
        self.assertEqual([s["quote"] for s in out["d2"]["synaptic"]], [POST, PRE])
        self.assertEqual(out["d2"]["synaptic"][0]["provenance"], "verified")

    def test_both_with_one_site_writes_nothing(self):
        n, misses, out = self.run_({"d2": {"synaptic": {"presynaptic": [0]}}})
        self.assertEqual((n, out), (0, {}))
        self.assertIn("needs", misses[0])

    def test_quote_not_on_page_is_rejected(self):
        n, misses, out = self.run_({"d2": {"synaptic": {"presynaptic": [2],
                                                        "postsynaptic": [1]}}})
        self.assertEqual((n, out), (0, {}))
        self.assertIn("quote not on", misses[0])

    def test_changed_value_and_bad_index_write_nothing(self):
        n, misses, out = self.run_({"nmda": {"sign": [0]}},
                                   receptors={"nmda": {"sign": "modulatory"}})
        self.assertEqual((n, out), (0, {}))
        self.assertIn("value changed", misses[0])
        n, misses, out = self.run_({"nmda": {"sign": [5]}})
        self.assertEqual(n, 0)
        self.assertIn("out of range", misses[0])

    def test_sign_pick_lands_and_is_idempotent(self):
        rec_out = {}
        for _ in range(2):
            A.apply_prose(self.worklist, {"receptors": {"nmda": {"sign": [0]}}},
                          self.receptors, {}, rec_out, {}, pages=self.pages)
        self.assertEqual(len(rec_out["nmda"]["sign"]), 1)


if __name__ == "__main__":
    unittest.main()
