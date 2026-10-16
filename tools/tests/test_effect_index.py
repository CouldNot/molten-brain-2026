"""``data_generators/effect_index.py``: the Python twin of js/receptor-effects.js's
effect -> receptors -> drugs join (BETA), read by llms.txt and the /api/ effect pages.

Run: ``python -m unittest discover -s tools/tests -t tools/tests -p test_effect_index.py``
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data_generators"))

import effect_index  # noqa: E402

DATA = Path(__file__).resolve().parents[2] / "public" / "data"

MODES = {"agonism": {"label": "Agonism", "actions": ["agonist", "partial_agonist"]},
         "antagonism": {"label": "Antagonism", "actions": ["antagonist"]}}
META = {"receptor_effect_modes": MODES,
        "receptor_effect_labels": {"sedation": {"en": "Sedation", "fr": "Sédation"},
                                   "hallucinations": "Hallucinations"},
        "drug_targets": {"h1": {"receptor": "h1"},
                         "sert": {"name": "SERT", "effects": []}}}
RECEPTORS = [
    {"id": "h1", "name": "H1", "effects": [{"mode": "antagonism", "effect": "sedation"}]},
    {"id": "5ht2a", "name": "5-HT2A", "effects": [{"mode": "agonism", "effect": "hallucinations"}]},
]


class JoinTest(unittest.TestCase):
    def test_direction_aware_and_affinity_only_ignored(self):
        drugs = [{"id": "quetiapine", "bindings": [{"target": "h1", "action": "antagonist"},
                                                   {"target": "5ht2a", "action": "antagonist"}]},
                 {"id": "kionly", "bindings": [{"target": "h1"}]}]
        idx = {e["id"]: e for e in effect_index.build(RECEPTORS, drugs, [], META)}
        self.assertEqual([d["drug"]["id"] for d in idx["sedation"]["drugs"]], ["quetiapine"])
        self.assertEqual(idx["hallucinations"]["drugs"], [])
        self.assertEqual(idx["sedation"]["label"], "Sedation")
        self.assertEqual(idx["sedation"]["owners"][0]["name"], "H1")

    def test_prodrug_borrows_its_metabolite_bindings(self):
        drugs = [{"id": "pro", "prodrug": True, "bindings": [], "metabolites": [{"id": "m"}]},
                 {"id": "active", "bindings": [{"target": "5ht2a", "action": "agonist"}]}]
        metabolites = [{"id": "m", "name": "Active", "drug_id": "active"}]
        idx = {e["id"]: e for e in effect_index.build(RECEPTORS, drugs, metabolites, META)}
        got = {d["drug"]["id"]: d["via"] for d in idx["hallucinations"]["drugs"]}
        self.assertEqual(set(got), {"pro", "active"})
        self.assertEqual(got["pro"][0][0]["via_metabolite"], "Active")

    def test_summary_line(self):
        drugs = [{"id": "q", "bindings": [{"target": "h1", "action": "antagonist"}]}]
        lines = effect_index.summary_lines(effect_index.build(RECEPTORS, drugs, [], META),
                                           MODES, "https://x")
        self.assertIn("- [Sedation](https://x/api/effect/sedation) `sedation`: "
                      "antagonism of H1; 1 drug could cause it", lines)


class EmittedTest(unittest.TestCase):
    def test_matches_the_viewer_counts(self):
        """Counts read off the viewer's Effects panel (headless, 2026-10-16): nausea
        lists 4 receptors and 28 drugs, sedation 13 and 143. A drift means the two
        joins disagree (or the data changed: re-read the panel, then update)."""
        load = lambda n: [json.loads(line) for line in  # noqa: E731
                          (DATA / f"{n}.jsonl").read_text(encoding="utf-8").splitlines() if line]
        meta = json.loads((DATA / "meta.json").read_text(encoding="utf-8"))
        idx = {e["id"]: e for e in effect_index.build(
            load("receptors"), load("drugs"), load("metabolites"), meta)}
        self.assertEqual((len(idx["nausea"]["owners"]), len(idx["nausea"]["drugs"])), (4, 28))
        self.assertEqual((len(idx["sedation"]["owners"]), len(idx["sedation"]["drugs"])), (13, 143))


if __name__ == "__main__":
    unittest.main()
