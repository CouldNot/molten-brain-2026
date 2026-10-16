"""``public/llms.txt``: generated from the emitted data, never hand-edited.

Run: ``python -m unittest tools.tests.test_llms_txt``
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data_generators"))
import effect_index  # noqa: E402
import llms_txt  # noqa: E402

PUBLIC = Path(__file__).resolve().parents[2] / "public"


class RenderTest(unittest.TestCase):
    def test_lists_every_collection_with_count_and_fields(self):
        text = llms_txt.render("1.2.3", {"drugs": [{"id": "a"}, {"id": "b", "tmax": 1}]},
                               ["drug_targets"], 7)
        self.assertIn("Version 1.2.3.", text)
        self.assertIn("drugs.jsonl): 2 ", text)
        self.assertIn("`id`, `tmax`", text)
        self.assertIn("7 source quotes", text)
        self.assertIn(llms_txt.CONTACT_URL, text)
        self.assertIn(llms_txt.REPO_URL, text)

    def test_undescribed_collection_raises(self):
        with self.assertRaises(KeyError):
            llms_txt.render("1.2.3", {"brand_new": []}, [], 0)

    def test_committed_file_is_current(self):
        """The committed llms.txt matches what the committed data would render."""
        data = PUBLIC / "data"
        collections = {
            name: [json.loads(line) for line in
                   (data / f"{name}.jsonl").read_text(encoding="utf-8").splitlines()]
            for name in llms_txt.COLLECTION_BLURBS}
        meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))
        n_quotes = len((data / "quotes.jsonl").read_text(encoding="utf-8").splitlines())
        effects = effect_index.summary_lines(
            effect_index.build(collections["receptors"], collections["drugs"],
                               collections["metabolites"], meta),
            meta["receptor_effect_modes"], llms_txt.SITE_URL)
        expected = llms_txt.render(llms_txt.app_version(PUBLIC), collections, list(meta), n_quotes,
                                   effects)
        self.assertEqual((PUBLIC / "llms.txt").read_text(encoding="utf-8"), expected,
                         "public/llms.txt is stale: run python tools/generate_data.py")


if __name__ == "__main__":
    unittest.main()
