"""``tools/render_api.py``: the /api Markdown pages render from the committed data, and
every link and quote marker on them resolves.

Run: ``python -m unittest tools.tests.test_render_api``
"""

from __future__ import annotations

import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import render_api  # noqa: E402

LINK = re.compile(r"\]\(/api/([^)]*)\)")
MARKER = re.compile(r"\[(?:verified|sourced|llm|uncertain) (q_[0-9a-f]+)\]")
LISTED = re.compile(r"^- `(q_[0-9a-f]+)` ", re.M)


class RenderApiTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.out = Path(cls.tmp.name) / "api"
        cls.n = render_api.render(render_api.PUBLIC / "data", cls.out, "0.0.0")
        cls.pages = {p.relative_to(cls.out).as_posix(): p.read_text(encoding="utf-8")
                     for p in cls.out.rglob("*.md")}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_one_page_per_node_plus_index(self):
        kinds = {name.split("/")[0] for name in self.pages if "/" in name}
        # + one index per kind, the top index and the 404 page
        self.assertEqual(len(self.pages), self.n + len(kinds) + 2)
        self.assertIn("drug/sertraline.md", self.pages)
        self.assertIn("receptor/d2.md", self.pages)

    def test_every_link_resolves(self):
        for name, text in self.pages.items():
            for target in LINK.findall(text):
                page = target + "index.md" if target.endswith("/") or not target else target
                self.assertIn(page, self.pages, f"{name} links to missing {target}")

    def test_every_quote_marker_is_listed_once(self):
        for name, text in self.pages.items():
            listed = LISTED.findall(text)
            self.assertEqual(len(listed), len(set(listed)), f"{name}: a quote listed twice")
            self.assertEqual(set(MARKER.findall(text)), set(listed), name)

    def test_not_found_lists_every_page(self):
        text = self.pages["not_found.md"]
        self.assertIn("No page at this address", text)
        for name in self.pages:
            if not name.endswith("index.md") and name != "not_found.md":
                self.assertIn(f"(/api/{name})", text)

    def test_presentation_fields_skipped(self):
        self.assertNotIn("shape_file", self.pages["structure/putamen_R.md"])


if __name__ == "__main__":
    unittest.main()
