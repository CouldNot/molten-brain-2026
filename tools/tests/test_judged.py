"""Tests for ``pipeline.judged``: a judged pick lands only on the sentence it was judged on.

Built with the help of Claude Code.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline import judged as J  # noqa: E402

CANDS = [{"line": "Alpha binds D2."}, {"quote": "Beta  binds\nH1."}, "Gamma blocks SERT."]


class ResolveTest(unittest.TestCase):
    def pick(self, i):
        return {"index": i, "qid": J.qid(J.text_of(CANDS[i]))}

    def test_qid_ignores_whitespace_runs(self):
        self.assertEqual(J.qid("Beta binds H1."), J.qid(J.text_of(CANDS[1])))

    def test_a_matching_pick_resolves(self):
        for i in range(3):
            self.assertEqual(J.resolve(CANDS, self.pick(i)), (CANDS[i], None))

    def test_refusals(self):
        cases = {
            "pick is not an object": 0,
            "out of range": {"index": 3, "qid": "x"},
            "negative": {"index": -1, "qid": "x"},
            "a bool is not an index": {"index": True, "qid": self.pick(1)["qid"]},
            "carries no qid": {"index": 0},
            "qid mismatch": {"index": 0, "qid": self.pick(1)["qid"]},
        }
        for name, pick in cases.items():
            with self.subTest(name):
                cand, why = J.resolve(CANDS, pick)
                self.assertIsNone(cand)
                self.assertTrue(why)

    def test_a_shifted_worklist_is_refused(self):
        pick = self.pick(0)
        self.assertIn("qid mismatch", J.resolve(CANDS[1:] + CANDS[:1], pick)[1])

    def test_resolve_all_is_all_or_nothing(self):
        self.assertEqual(J.resolve_all(CANDS, [self.pick(0), self.pick(2)]),
                         ([CANDS[0], CANDS[2]], None))
        cands, why = J.resolve_all(CANDS, [self.pick(0), {"index": 1}])
        self.assertIsNone(cands)
        self.assertTrue(why.startswith("pick 1: "))

    def test_stamp_reaches_nested_candidates(self):
        wl = {"owners": {"a": {"candidates": [{"line": "x"}]}}, "list": [{"candidates": [{"quote": "y"}]}]}
        J.stamp(wl)
        self.assertEqual(wl["owners"]["a"]["candidates"][0]["qid"], J.qid("x"))
        self.assertEqual(wl["list"][0]["candidates"][0]["qid"], J.qid("y"))


if __name__ == "__main__":
    unittest.main()
