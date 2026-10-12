#!/usr/bin/env python
"""Unit tests for the metabolite-merging half of the pharmacokinetics pass
(``apply_pharmacokinetics.apply``) and the metabolite-bindings applier's link rule.

Stdlib ``unittest`` over a fake page store in a temp dir, so it runs on a clone lacking
the corpus trees::

    python -m unittest discover -t tools/tests -s tools/tests -p test_pk_metabolites.py

Built with the help of Claude Code.
"""

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
# The bindings applier imports bs4 at module level (it runs under ``uv run``), which a
# plain clone need not have: its test is skipped there, like test_binding_directions.
HAS_BS4 = importlib.util.find_spec("bs4") is not None
import apply_pharmacokinetics as PK  # noqa: E402
from prose_gate import PageGate  # noqa: E402

STAHL = "Venlafaxine active metabolite O-desmethylvenlafaxine (ODV)\nElimination half-life 40-50 hours\n"
WIKI = "Elimination half-life | 36-200 hours\n"


class MergeTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name)
        (root / "stahl").mkdir()
        (root / "wiki").mkdir()
        (root / "stahl" / "1.md").write_text(STAHL, encoding="utf-8")
        (root / "wiki" / "nordazepam.md").write_text(WIKI, encoding="utf-8")
        self.pages = PageGate({"stahl": root / "stahl", "wikipedia_pharm": root / "wiki"})

    def test_link_by_explicit_drug_id_keeps_other_passes_fields(self):
        drugs = [{"id": "venlafaxine", "name": "Venlafaxine", "metabolites": [
                     {"name": "O-desmethylvenlafaxine", "bindings": [{"target": "sert"}]},
                     {"name": "Other", "sources": []}]},
                 {"id": "desvenlafaxine", "name": "Desvenlafaxine"}]
        judged = {"venlafaxine": {"metabolites": [{
            "name": "O-desmethylvenlafaxine", "drug_id": "desvenlafaxine", "page": 1,
            "quote": "Venlafaxine active metabolite O-desmethylvenlafaxine (ODV)"}]}}
        _, n_met, warnings = PK.apply(judged, drugs, self.pages)
        self.assertEqual((n_met, warnings), (1, []))
        mets = drugs[0]["metabolites"]
        self.assertEqual([m["name"] for m in mets], ["O-desmethylvenlafaxine", "Other"])
        self.assertEqual(mets[0]["drug_id"], "desvenlafaxine")
        self.assertEqual(mets[0]["bindings"], [{"target": "sert"}])   # not the PK pass's

    def test_null_half_life_clears_and_metabolite_gets_wikipedia_figure(self):
        drugs = [{"id": "clorazepate", "name": "Clorazepate",
                  "half_life": {"hours": 40.0}, "half_life_sources": [{}],
                  "metabolites": [{"name": "Desmethyldiazepam (nordazepam)",
                                   "bindings": [{"target": "gaba_a"}]}]}]
        q = {"corpus": "wikipedia_pharm", "page": "nordazepam",
             "quote": "Elimination half-life | 36-200 hours"}
        judged = {"clorazepate": {"half_life": None, "metabolites": [
            dict(q, name="Nordazepam", half_life=dict(q, hours=36, hours_max=200))]}}
        PK.apply(judged, drugs, self.pages)
        d = drugs[0]
        self.assertNotIn("half_life", d)
        self.assertNotIn("half_life_sources", d)
        (m,) = d["metabolites"]
        self.assertEqual(m["name"], "Nordazepam")   # matched by synonym, judged name wins
        self.assertEqual(m["half_life"], {"hours": 36.0, "hours_max": 200.0})
        self.assertEqual(m["sources"][0]["page"], "nordazepam")
        self.assertEqual(m["bindings"], [{"target": "gaba_a"}])

    def test_off_page_quote_writes_nothing(self):
        drugs = [{"id": "x", "name": "X"}]
        judged = {"x": {"metabolites": [{"name": "Y", "page": 1, "quote": "not there"}]}}
        _, n_met, warnings = PK.apply(judged, drugs, self.pages)
        self.assertEqual(n_met, 0)
        self.assertEqual(len(warnings), 1)
        self.assertNotIn("metabolites", drugs[0])


@unittest.skipUnless(HAS_BS4, "apply_metabolite_bindings imports bs4 at module level")
class LinkedBindingsTest(unittest.TestCase):
    def setUp(self):
        global MB
        import apply_metabolite_bindings as MB  # noqa: F401

    def test_linked_metabolite_loses_its_stale_inline_bindings(self):
        m = {"name": "O-desmethylvenlafaxine", "drug_id": "desvenlafaxine",
             "bindings": [{"target": "sert"}]}
        self.assertTrue(MB.drop_if_linked(m, {}, {"desvenlafaxine"}))
        self.assertNotIn("bindings", m)

    def test_name_match_links_too_and_unlinked_is_kept(self):
        m = {"name": "Temazepam", "bindings": [{"target": "gaba_a"}]}
        self.assertTrue(MB.drop_if_linked(m, {"temazepam": "temazepam"}, {"temazepam"}))
        n = {"name": "Norclozapine", "bindings": [{"target": "m1"}]}
        self.assertFalse(MB.drop_if_linked(n, {}, {"clozapine"}))
        self.assertEqual(n["bindings"], [{"target": "m1"}])


if __name__ == "__main__":
    unittest.main()
