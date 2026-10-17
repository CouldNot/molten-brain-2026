#!/usr/bin/env python
"""Unit tests for tools/fetch/fetch_dailymed.py's set-id boundary check.

A set id from the DailyMed API becomes the file name of ``raw/<setid>.xml`` and
``pages/<setid>.md``; a value that is not a UUID must never reach the disk.

Built with the help of Claude Code.
"""

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fetch"))
import fetch_dailymed  # noqa: E402

GOOD = "3f9a6b8e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"


class SetidBoundaryTest(unittest.TestCase):
    def test_search_drops_non_uuid_setids(self):
        body = json.dumps({"data": [{"setid": GOOD, "title": "X TABLETS"},
                                    {"setid": "../../escape", "title": "X"},
                                    {"title": "no setid"}]})
        with mock.patch.object(fetch_dailymed.polite_http, "fetch_or_none",
                               return_value=body):
            self.assertEqual([c["setid"] for c in fetch_dailymed.search("x")], [GOOD])

    def test_quote_label_refuses_a_bad_setid(self):
        with self.assertRaises(ValueError):
            fetch_dailymed.fetch_quote_label("../x", refresh=False)

    def test_every_hand_listed_label_is_a_uuid(self):
        for setid in fetch_dailymed.QUOTE_LABELS:
            self.assertRegex(setid, fetch_dailymed.SETID)


if __name__ == "__main__":
    unittest.main(verbosity=2)
