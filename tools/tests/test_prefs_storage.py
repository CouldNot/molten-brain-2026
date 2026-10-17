#!/usr/bin/env python
"""Only ``js/prefs.js`` touches ``localStorage`` in the viewer.

Every module used to hand-roll its own try/catch around ``localStorage`` (six copies
had grown), each a chance to forget that storage throws in private mode. The one
exception is ``js/i18n.js``: a classic script that runs before any module, so it
cannot import ``prefs.js``. A structural lint in the style of test_theme_tokens.py.

Built with the help of Claude Code.
"""

import re
import unittest
from pathlib import Path

JS = Path(__file__).resolve().parents[2] / "public" / "js"
ALLOWED = {"prefs.js", "i18n.js"}
ACCESS = re.compile(r"\blocalStorage\s*\.")


class PrefsStorageTest(unittest.TestCase):
    def test_only_prefs_touches_local_storage(self):
        bad = []
        for path in sorted(JS.rglob("*.js")):
            if path.relative_to(JS).as_posix() in ALLOWED:
                continue
            for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
                if ACCESS.search(line) and not line.lstrip().startswith(("//", "*")):
                    bad.append(f"{path.relative_to(JS)}:{n}")
        self.assertEqual(bad, [], "use loadFlag/saveFlag/loadString/saveString from js/prefs.js")


if __name__ == "__main__":
    unittest.main(verbosity=2)
