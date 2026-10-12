"""apply_location_sources.py writes its cache in the committed format, so a re-run
diffs only the sources it changed, never every line's indentation."""

import json
import sys
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(TOOLS / "sourcing"))
sys.path.insert(0, str(TOOLS))

import apply_location_sources as A  # noqa: E402


class SerializeTest(unittest.TestCase):
    def test_round_trips_the_committed_cache_byte_for_byte(self):
        raw = A.OUT.read_text(encoding="utf-8")
        self.assertEqual(A.serialize(json.loads(raw)), raw)


if __name__ == "__main__":
    unittest.main()
