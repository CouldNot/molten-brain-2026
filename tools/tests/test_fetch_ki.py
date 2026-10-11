#!/usr/bin/env python
"""Unit tests for tools/fetch/fetch_ki.py's Ki-ownership guard.

Stdlib ``unittest`` only (no deps), matching test_generate.py. Runnable directly:

    python tools/tests/test_fetch_ki.py

pytest-discoverable. These lock the ``--apply`` idempotency contract: the pass may
only write into a Ki slot it *owns* (empty, or its own prior non-curated PDSP Ki). A
``wikipedia_pharm`` fallback Ki (corpus #9) or a hand-curated Ki belongs to another
tool and must be left untouched, else annotate would flip its corpus to ``pdsp_ki``
and the next --apply's strip would delete the binding (the destructive oscillation
this guard fixes). No CSV needed: ``_ki_owned_by_pdsp`` is a pure predicate.

Built with the help of Claude Code.
"""

import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fetch"))
import fetch_ki  # noqa: E402


def _binding(corpus=None, curated=False, has_ki=True):
    if not has_ki:
        return {"target": "x", "affinity_only": True}
    src = {}
    if corpus is not None:
        src["corpus"] = corpus
    if curated:
        src["curated"] = True
    return {"target": "x", "affinity_only": True, "ki": {"median": 100.0, "source": src}}


class KiOwnershipTest(unittest.TestCase):
    def test_no_ki_is_ownable(self):
        # An empty slot is fetch_ki's to fill (annotate or auto-add).
        self.assertTrue(fetch_ki._ki_owned_by_pdsp(_binding(has_ki=False)))

    def test_pdsp_non_curated_is_ownable(self):
        # Its own prior output: refreshable in place.
        self.assertTrue(fetch_ki._ki_owned_by_pdsp(_binding(corpus="pdsp_ki")))

    def test_pdsp_curated_is_not_ownable(self):
        # Hand-attached weak binder (source.curated): never overwritten/stripped.
        self.assertFalse(fetch_ki._ki_owned_by_pdsp(_binding(corpus="pdsp_ki", curated=True)))

    def test_wikipedia_fallback_is_not_ownable(self):
        # The regression this test exists for: a wikipedia_pharm Ki must be left
        # alone, or annotate flips it to pdsp_ki and the next strip deletes it.
        self.assertFalse(fetch_ki._ki_owned_by_pdsp(_binding(corpus="wikipedia_pharm")))

    def test_unknown_corpus_is_not_ownable(self):
        # Any non-PDSP corpus is another tool's slot; only PDSP is owned.
        self.assertFalse(fetch_ki._ki_owned_by_pdsp(_binding(corpus="something_else")))


class ResolveRowsShapeTest(unittest.TestCase):
    """``resolve_rows`` returns a ``(rows, mapping)`` TUPLE, never a bare list. A caller
    that forgets to unpack it and passes the whole tuple to ``summarize_target`` gets no
    Ki: exactly the bug that made ``apply_metabolite_bindings._pdsp_ki`` a silent no-op,
    so the documented "PDSP measured Ki preferred where one exists" never actually fired
    (and PDSP-direct metabolite affinity-only bindings were dropped). Lock the contract so
    a future edit that reverts the unpack fails loudly here. Uses a monkeypatched row
    table so no PDSP CSV is needed (like the ownership tests above)."""

    def setUp(self):
        self._saved = fetch_ki._ALL_ROWS
        # One synthetic assay: norfluoxetine at SERT (SLC6A4 -> our `sert`), human, 10 nM.
        fetch_ki._ALL_ROWS = [{
            " Ligand Name": "Norfluoxetine", "Unigene": "SLC6A4", "ki Val": "10",
            "species": "HUMAN", "source": "membrane", "Hotligand": "paroxetine",
            "Number": "1", "Name": "SERT", "Reference": "", "ki Note": "",
        }]

    def tearDown(self):
        fetch_ki._ALL_ROWS = self._saved

    def test_returns_two_tuple(self):
        result = fetch_ki.resolve_rows("Norfluoxetine", None)
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)
        rows, mapping = result
        self.assertTrue(rows)           # the fake assay matched by ligand name
        self.assertIsNone(mapping)      # a direct name match carries no alias mapping

    def test_unpacked_rows_summarize_but_the_raw_tuple_does_not(self):
        rows, _ = fetch_ki.resolve_rows("Norfluoxetine", None)
        # Correct usage: unpack, then summarize -> a real Ki.
        s = fetch_ki.summarize_target(rows, "sert")
        self.assertIsNotNone(s)
        self.assertIn("ki_nm", s)
        # The buggy path (whole tuple in) must NOT yield a summary. Iterating the 2-tuple
        # feeds `resolve_target` a list, which raises inside the comprehension -> the caller
        # (_pdsp_ki) swallows it as "no Ki". Assert that failure mode explicitly.
        with self.assertRaises(Exception):
            fetch_ki.summarize_target(fetch_ki.resolve_rows("Norfluoxetine", None), "sert")


class IdentityAliasPoolingTest(unittest.TestCase):
    """An ``identity`` alias (paliperidone filed by PDSP as 9-OH-risperidone) is the same
    molecule, so its rows pool with direct ones. Regression: the 2026-10 export added
    ONE direct "Paliperidone" row, and the direct-first early return then hid every
    9-OH-risperidone assay (paliperidone lost its D2 Ki and nine affinity-only sites)."""

    @staticmethod
    def _row(num, ligand, gene, ki):
        return {" Ligand Name": ligand, "Unigene": gene, "ki Val": ki, "species": "HUMAN",
                "source": "CLONED", "Hotligand": "x", "Number": str(num), "Name": gene,
                "Reference": "", "ki Note": ""}

    def setUp(self):
        self._saved = fetch_ki._ALL_ROWS
        fetch_ki._ALL_ROWS = [self._row(1, "9-OH-risperidone", "DRD2", "3.4"),
                              self._row(2, "Paliperidone", "ADRA2A", "222")]

    def tearDown(self):
        fetch_ki._ALL_ROWS = self._saved

    def test_direct_and_identity_rows_pool(self):
        rows, mapping = fetch_ki.resolve_rows("Paliperidone", "paliperidone")
        self.assertEqual({r["Number"] for r in rows}, {"1", "2"})
        self.assertEqual(mapping["ki_ids"], [1])

    def test_only_aliased_rows_are_stamped_mapped(self):
        rows, mapping = fetch_ki.resolve_rows("Paliperidone", "paliperidone")
        aliased = fetch_ki.summarize_target(rows, "d2")
        direct = fetch_ki.summarize_target(rows, "alpha2")
        for s in (aliased, direct):
            fetch_ki._stamp_mapping(s, mapping)
        self.assertTrue(aliased["source"].get("mapped"))
        self.assertNotIn("mapped", direct["source"])


class DownloadContextTest(unittest.TestCase):
    """The PDSP download trusts the system store PLUS one pinned cert, and never
    relaxes verification: CERT_REQUIRED + hostname checking, the pinned cert loaded."""

    def test_verification_on(self):
        import ssl
        ctx = fetch_ki.download_context()
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(ctx.check_hostname)

    def test_pinned_cert_loaded(self):
        subjects = [dict(x[0] for x in c["subject"]).get("commonName")
                    for c in fetch_ki.download_context().get_ca_certs()]
        self.assertIn("emSign Root TLS CA - G1", subjects)


class SplitExportTest(unittest.TestCase):
    """The paged download merges export pages by Ki id, so each record must come back
    byte-for-byte, a quoted multi-line field included."""

    def test_records_kept_raw(self):
        header = "Number,Name,Unigene,Ligand ID, Ligand Name,ki Val\n"
        rec1 = '7,D2,DRD2,1,"HALO,\nPERIDOL",1.2\n'
        rec2 = "8,D3,DRD3,1,X,3\n"
        head, recs = fetch_ki.split_export(header + rec1 + rec2)
        self.assertEqual(head, header)
        self.assertEqual(recs, [(7, rec1), (8, rec2)])


if __name__ == "__main__":
    unittest.main(verbosity=2)
