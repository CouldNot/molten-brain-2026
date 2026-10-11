"""data_generators.freshness: the one page -> download-date lookup and the age rule.

Made with the help of Claude Code.
"""
import datetime
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from data_generators import freshness  # noqa: E402


class FreshnessHelperTest(unittest.TestCase):
    LEDGER = {"pdsp_ki": "2026-07-01", "wikipedia_pharm": {"sertraline": "2026-10-10"}}

    def test_bulk_corpus_dates_every_page(self):
        self.assertEqual(freshness.fetched_at(self.LEDGER, "pdsp_ki", 12345), "2026-07-01")

    def test_per_page_corpus_dates_its_own_page_only(self):
        self.assertEqual(freshness.fetched_at(self.LEDGER, "wikipedia_pharm", "sertraline"),
                         "2026-10-10")
        self.assertIsNone(freshness.fetched_at(self.LEDGER, "wikipedia_pharm", "lithium"))

    def test_month_end_is_clamped_not_crashed(self):
        # 2027-02-28 minus 12 months is 2026-02-28; 2026-03-31 minus 1 is 2026-02-28.
        self.assertFalse(freshness.is_stale("2026-02-28", datetime.date(2027, 2, 28)))
        self.assertTrue(freshness.is_stale("2026-02-27", datetime.date(2027, 2, 28)))
        self.assertFalse(freshness.is_stale("2026-02-28", datetime.date(2026, 3, 31), 1))

    def test_every_editable_corpus_has_a_date_rule(self):
        # A corpus flagged editable but neither bulk nor paged would never get a date.
        for corpus in freshness.editable_corpora():
            rec = freshness.SOURCE_CORPORA[corpus]
            self.assertTrue(corpus in freshness.BULK_DATES or rec.get("pages_dir"), corpus)

    def test_books_and_abstracts_are_not_editable(self):
        editable = set(freshness.editable_corpora())
        for corpus in ("stahl", "kandel", "nieuwenhuys", "stahl_essential", "carlat",
                       "europepmc"):
            self.assertNotIn(corpus, editable)


if __name__ == "__main__":
    unittest.main()
