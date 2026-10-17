#!/usr/bin/env python
"""data_generators.page_links: a cited page whose url no `{page}` template can build
(a Wikipedia slug, a Drugs@FDA application, a paper's DOI) is read from its page header,
and only the pages a quote actually cites reach meta.json."""
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from data_generators import page_links  # noqa: E402
from data_generators import freshness  # noqa: E402
from data_generators.freshness import header_field  # noqa: E402

LEDGER = {"wikipedia_pharm": {"agom_latine": "https://en.wikipedia.org/w/index.php?oldid=1",
                              "unused": "https://en.wikipedia.org/w/index.php?oldid=2"}}


class AttachTest(unittest.TestCase):
    def test_only_cited_pages_are_emitted(self):
        corpora = {"wikipedia_pharm": {"ref": "Wikipedia"}, "stahl": {"ref": "Stahl"}}
        quotes = [{"corpus": "wikipedia_pharm", "page": "agom_latine"},
                  {"corpus": "stahl", "page": 12}]
        out = page_links.attach(corpora, quotes, LEDGER)
        self.assertEqual(out["wikipedia_pharm"]["page_urls"],
                         {"agom_latine": LEDGER["wikipedia_pharm"]["agom_latine"]})
        self.assertNotIn("page_urls", out["stahl"])
        self.assertNotIn("page_urls", corpora["wikipedia_pharm"], "input mutated")


class HeaderTest(unittest.TestCase):
    def read(self, corpus, header):
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as fh:
            fh.write(header)
        try:
            pattern, template = page_links.HEADER_LINKS[corpus]
            found = header_field(fh.name, pattern)
            return template.format(found) if found else None
        finally:
            os.unlink(fh.name)

    def test_wikipedia_links_the_pinned_revision(self):
        line = ("<!-- 2C-B -->\nsource: https://en.wikipedia.org/wiki/2C-B | revision: 9 | "
                "permalink: https://en.wikipedia.org/w/index.php?oldid=9 | fetched_at: x\n")
        self.assertEqual(self.read("wikipedia_pharm", line),
                         "https://en.wikipedia.org/w/index.php?oldid=9")

    def test_paper_links_its_doi_and_skips_a_missing_one(self):
        self.assertEqual(self.read("europepmc", "# T\npmid: 1\ndoi: 10.1038/x.1\n"),
                         "https://doi.org/10.1038/x.1")
        self.assertIsNone(self.read("europepmc", "# T\npmid: 1\ndoi: None\n"))


class LedgerLoadTest(unittest.TestCase):
    """A missing ledger reads as {}; a corrupt one raises instead of being rebuilt from
    this disk alone (which would silently drop every corpus it does not hold)."""

    def test_missing_is_empty_and_corrupt_raises(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(page_links.load_ledger(os.path.join(d, "none.json")), {})
            bad = os.path.join(d, "bad.json")
            Path(bad).write_text("{not json", encoding="utf-8")
            with self.assertRaises(ValueError):
                page_links.load_ledger(bad)
            with self.assertRaises(ValueError):
                freshness.load_ledger(bad)


if __name__ == "__main__":
    unittest.main()
