#!/usr/bin/env python
"""Unit tests for fetch_europepmc's ``--ki-prose`` citation follower (stdlib, offline).

    python -m unittest discover -t tools/tests -s tools/tests -p test_europepmc_ki_prose.py

Built with the help of Claude Code.
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fetch"))
import fetch_europepmc as E  # noqa: E402

# A trimmed MediaWiki render: the note ids come HTML-escaped on the <li> and plain on the
# link, the shape that once made every citation miss.
HTML = """
<p>In 2020, viloxazine was reported to have affinity for the serotonin 5-HT<sub>2B</sub>
receptor (K<sub>i</sub> = 3,900&#160;nM).<sup class="reference"><a href="#cite_note-Yu_2020-23">[23]</a></sup></p>
<p>Viloxazine is a morpholine derivative.<sup class="reference"><a href="#cite_note-Old-2">[2]</a></sup></p>
<p>It inhibits CYP1A2 with an IC<sub>50</sub> of 40&#160;nM.<sup class="reference"><a href="#cite_note-Old-2">[2]</a></sup></p>
<ol class="references">
<li id="cite&#95;note-Old-2"><cite>Old. <a href="https://pubmed.ncbi.nlm.nih.gov/111">111</a></cite></li>
<li id="cite&#95;note-Yu&#95;2020-23"><cite>Yu C. <a href="https://pubmed.ncbi.nlm.nih.gov/32943948">32943948</a></cite></li>
</ol>
"""


class CitedAffinityTest(unittest.TestCase):
    def test_follows_escaped_note_ids_to_the_pmid(self):
        got = E.cited_affinity_pmids(HTML)
        self.assertEqual([pm for _, pm in got], [["32943948"]])
        self.assertIn("K i = 3,900 nM", got[0][0])

    def test_a_functional_potency_is_not_an_affinity(self):
        self.assertFalse(E.states_affinity("an IC 50 of 40 nM"))
        self.assertTrue(E.states_affinity("trazodone (KD = 324 microM)"))
        self.assertTrue(E.states_affinity("5-HT1A (pKi = 7.72)"))


if __name__ == "__main__":
    unittest.main()
