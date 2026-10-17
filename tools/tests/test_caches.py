#!/usr/bin/env python
"""Unit tests for ``tools/data_generators/caches.py``, the cache loader and vocabulary
helpers the generators share (stdlib, offline)::

    python -m unittest discover -t tools/tests -s tools/tests -p test_caches.py

Built with the help of Claude Code.
"""

import doctest
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from data_generators import caches, history, workup  # noqa: E402


class LoadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        patcher = mock.patch.object(caches, "CACHE_DIR", Path(self.tmp.name))
        patcher.start()
        self.addCleanup(patcher.stop)
        caches.load.cache_clear()
        self.addCleanup(caches.load.cache_clear)

    def test_missing_cache_raises_unless_optional(self):
        with self.assertRaises(FileNotFoundError):
            caches.load("absent.json")
        self.assertEqual(caches.load("absent.json", required=False), {})

    def test_reads_json(self):
        Path(self.tmp.name, "x.json").write_text('{"a": 1}', encoding="utf-8")
        self.assertEqual(caches.load("x.json"), {"a": 1})


class VocabularyTest(unittest.TestCase):
    def test_doctests(self):
        self.assertEqual(doctest.testmod(caches).failed, 0)

    def test_empty_pattern_always_attests(self):
        """The two copies disagreed here: workup's attested an empty pattern only when
        given a text, history's always. The shared one always does (``unstated``)."""
        self.assertTrue(history.attests(history.WITHDRAWAL_REASONS, "unstated", "Withdrawn in 1990."))
        self.assertTrue(workup.attests({"k": {"attests": ""}}, "k"))
        self.assertIs(history.attests, workup.attests)


if __name__ == "__main__":
    unittest.main()
