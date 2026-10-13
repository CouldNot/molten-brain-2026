#!/usr/bin/env python
"""The UNKNOWN grade (data_generators/unknown.py): searched everywhere, nothing states it.

Locks the three rules: a stamp comes only from a search log and only onto a still
unsourced claim (a real source wins), the search must cover every required corpus, and
it expires like a cited page. Also locks the tally: UNKNOWN is its own bucket, outside
the headline denominator. Stdlib only::

    python -m unittest discover -t tools/tests -s tools/tests -p test_unknown.py

Built with the help of Claude Code.
"""

import io
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import check_data  # noqa: E402
from data_generators import unknown  # noqa: E402
from data_generators.provenance import _provenance_stats  # noqa: E402

ALL = list(unknown.UNKNOWN_REQUIRED_SOURCES["drug_binding_action"])


def entry(corpora=ALL, searched="2026-10-12"):
    return {"kind": "drug_binding_action", "searched": searched,
            "by": {"harness": "Claude Code", "model": "opus"},
            "sources": [{"corpus": c, "lookup": "x", "hits": 0} for c in corpora]}


def drugs():
    """Two drugs both making metabolite ``nor_a`` (one store record, see :func:`metabs`)."""
    return [{"id": "a", "bindings": [
        {"target": "d2", "affinity_only": True, "ki": {"median": 3.0}},
        {"target": "d3", "action": "antagonist", "sources": [{"provenance": "verified"}]}],
        "metabolites": [{"id": "nor_a"}]},
        {"id": "b", "bindings": [], "metabolites": [{"id": "nor_a"}]}]


def metabs():
    return [{"id": "nor_a", "name": "Nor-A", "bindings": [
        {"target": "h1", "affinity_only": True}]}]


class ApplyTest(unittest.TestCase):
    def test_stamps_an_affinity_only_binding(self):
        ds = drugs()
        unknown.apply_unknown(ds, metabs(), {"drug:a/bindings[d2]": entry()})
        self.assertEqual(ds[0]["bindings"][0]["unknown"],
                         {"searched": "2026-10-12", "corpora": ALL})

    def test_a_real_source_wins(self):
        ds = drugs()
        stats = unknown.apply_unknown(ds, metabs(), {"drug:a/bindings[d3]": entry()})
        self.assertNotIn("unknown", ds[0]["bindings"][1])
        self.assertEqual(stats, {"stamped": 0, "superseded": 1})

    def test_metabolite_stamp_lands_on_the_one_record(self):
        ms = metabs()
        unknown.apply_unknown(drugs(), ms, {"metabolite:nor_a/bindings[h1]": entry()})
        self.assertIn("unknown", ms[0]["bindings"][0])

    def test_stale_key_raises(self):
        with self.assertRaises(KeyError):
            unknown.apply_unknown(drugs(), metabs(), {"drug:a/bindings[sert]": entry()})
        with self.assertRaises(KeyError):
            unknown.apply_unknown(drugs(), metabs(), {"drug:zz/bindings[d2]": entry()})
        with self.assertRaises(KeyError):
            unknown.apply_unknown(drugs(), metabs(), {"metabolite:zz/bindings[h1]": entry()})


class SiteTest(unittest.TestCase):
    def test_site_matches_the_citation_site_grammar(self):
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "sourcing"))
        import citation_site as cs
        self.assertEqual(unknown.binding_site("a", "d2"), cs.site("drug", "a", "bindings[d2]"))
        self.assertEqual(unknown.binding_site("nor_a", "h1", "metabolite"),
                         cs.site("metabolite", "nor_a", "bindings", "h1"))

    def test_enumeration_lists_a_shared_metabolite_once(self):
        rows = unknown.affinity_only_bindings(drugs(), metabs())
        self.assertEqual([r["site"] for r in rows],
                         ["drug:a/bindings[d2]", "metabolite:nor_a/bindings[h1]"])
        self.assertEqual(rows[1]["drug"], "a")        # first parent, whose article a search reads


class TallyTest(unittest.TestCase):
    def _action(self, ds):
        return _provenance_stats([], [], [], [], [], ds, metabs(), {}, [])

    def test_unknown_leaves_the_denominator(self):
        ds = drugs()
        before = self._action(ds)
        unknown.apply_unknown(ds, metabs(), {"drug:a/bindings[d2]": entry()})
        after = self._action(ds)
        k0, k1 = before["by_kind"]["drug_binding_action"], after["by_kind"]["drug_binding_action"]
        self.assertEqual((k0["total"], k0["nosource"], k0["unknown"]), (3, 2, 0))
        self.assertEqual((k1["total"], k1["nosource"], k1["unknown"]), (2, 1, 1))
        self.assertEqual(after["nodes"]["unknown"], 1)
        # One backed of two counted nodes instead of one of three.
        self.assertGreater(after["nodes"]["pct_backed"], before["nodes"]["pct_backed"])


class CheckDataTest(unittest.TestCase):
    TODAY = check_data.date(2026, 10, 12)
    META = {"source_corpora": {"wikipedia_pharm": {"ref": "W", "editable": True}}}

    def _stamped(self, corpora=ALL, searched="2026-10-12"):
        ds = drugs()
        unknown.apply_unknown(ds, metabs(), {"drug:a/bindings[d2]": entry(corpora, searched)})
        return ds

    def _provenance_errors(self, ds):
        report = check_data.Report()
        with redirect_stdout(io.StringIO()):
            check_data.check_provenance(report, {}, [], [], [], [], [], ds, [])
        return report.errors

    def _freshness_errors(self, ds):
        report = check_data.Report()
        with redirect_stdout(io.StringIO()):
            check_data.check_freshness(report, self.META, [self.META, ds], today=self.TODAY)
        return report.errors

    def test_complete_search_passes(self):
        self.assertEqual(self._provenance_errors(self._stamped()), 0)

    def test_search_missing_a_required_source_fails(self):
        self.assertEqual(self._provenance_errors(self._stamped(ALL[:-1])), 1)

    def test_stamp_on_a_sourced_direction_fails(self):
        ds = drugs()
        ds[0]["bindings"][1]["unknown"] = {"searched": "2026-10-12", "corpora": ALL}
        self.assertEqual(self._provenance_errors(ds), 1)

    def test_search_expires_like_a_cited_page(self):
        self.assertEqual(self._freshness_errors(self._stamped(searched="2025-10-12")), 0)
        self.assertEqual(self._freshness_errors(self._stamped(searched="2025-09-11")), 1)


if __name__ == "__main__":
    unittest.main(verbosity=2)
