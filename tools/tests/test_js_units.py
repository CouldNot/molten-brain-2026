"""Run every JS unit suite (tools/tests/*.test.mjs, e.g. sim_model.test.mjs for the
Simulation maths, wiki_lead.test.mjs for the Wikipedia lead preview) from the Python
suite, so `python -m unittest discover tools/tests` covers them without a JS test
runner of its own. Skipped when `node` is not on PATH (the site has no JS toolchain
requirement). A new suite needs no edit here: drop a `<name>.test.mjs` beside this.
"""
import shutil
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SUITES = sorted((ROOT / "tools" / "tests").glob("*.test.mjs"))


class JsUnitTest(unittest.TestCase):
    @unittest.skipUnless(shutil.which("node"), "node not installed")
    def test_node_suites_pass(self):
        self.assertTrue(SUITES, "no *.test.mjs suite found")
        for suite in SUITES:
            with self.subTest(suite=suite.name):
                proc = subprocess.run(
                    ["node", "--test", str(suite)],
                    capture_output=True, text=True, cwd=ROOT,
                )
                self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
