#!/usr/bin/env python
"""foldSections (js/main.js) moves every child of a headed panel section into a
`.panel-sec-body` and its `<h3>` into a `<summary>`. A layout rule written against the
section's direct children (`.info-x > h3`, or `display: flex` on `.info-x` itself to
space its chips) therefore never reaches them: the Pharmacokinetics chips sat glued
pill-to-label for that reason while their gap rule looked correct.
"""
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from viewer_source import viewer_css  # noqa: E402

CSS = viewer_css()


def rules():
    """(selector, body) for every flat CSS rule in the viewer stylesheets."""
    out = []
    for m in re.finditer(r"\{([^{}]*)\}", CSS):
        start = max(CSS.rfind("{", 0, m.start()), CSS.rfind("}", 0, m.start())) + 1
        out.append((CSS[start:m.start()].strip(), m.group(1)))
    return out


class FoldedSectionCssTest(unittest.TestCase):
    def test_no_rule_targets_a_folded_heading(self):
        bad = [s for s, _ in rules() if re.search(r"\.info-[\w-]+\s*>\s*h3\b", s)]
        self.assertEqual(bad, [], "foldSections turns a section's <h3> into a <summary>")

    def test_pk_chip_layout_sits_on_the_section_body(self):
        flex = [s for s, b in rules()
                if "info-halflife" in s and re.search(r"display:\s*flex", b)]
        self.assertTrue(flex, "the Pharmacokinetics block lost its chip layout rule")
        for sel in flex:
            self.assertIn(".panel-sec-body", sel)


if __name__ == "__main__":
    unittest.main()
