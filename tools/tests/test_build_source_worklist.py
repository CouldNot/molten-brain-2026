#!/usr/bin/env python
"""Unit tests for tools/sourcing/build_source_worklist.py.

Regression: an ``affinity_only`` binding (a measured Ki, no ``action``) crashed the
whole run with ``KeyError: 'action'``, since the worklist claim names an action.

Built with the help of Claude Code.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sourcing"))
import build_source_worklist as W  # noqa: E402

TARGETS = {"d2": {"name": "D2 receptor"}, "h1": {"name": "H1 receptor"}}
ACTIONS = {"antagonist": {"label": "antagonist"}}


class WorklistItemsTest(unittest.TestCase):
    def test_directionless_binding_is_skipped_and_counted(self):
        drug = {"name": "Haloperidol", "bindings": [
            {"target": "d2", "action": "antagonist"},
            {"target": "h1", "affinity_only": True, "ki": {"value": 400}},
        ]}
        items, directionless = W.worklist_items(drug, TARGETS, ACTIONS)
        self.assertEqual(directionless, 1)
        self.assertEqual([i["target"] for i in items], ["d2"])
        self.assertEqual(items[0]["claim"],
                         "Haloperidol acts on D2 receptor (antagonist).")

    def test_sourced_binding_is_skipped(self):
        drug = {"name": "X", "bindings": [
            {"target": "d2", "action": "antagonist", "sources": [{"quote": "q"}]}]}
        self.assertEqual(W.worklist_items(drug, TARGETS, ACTIONS), ([], 0))


if __name__ == "__main__":
    unittest.main(verbosity=2)
