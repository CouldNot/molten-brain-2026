#!/usr/bin/env python
"""The machine-written provenance registries load on demand, not at import.

Regression: ``data_generators/provenance.py`` merged five ``generated_cache`` files
(and re-hashed the pinned PharmFreq / CPIC exports, raising on drift) as a side
effect of being imported, so every importer paid that I/O and a stale cache broke
scripts that only wanted a quote constructor. ``load_external_registries`` is now
called by ``build_records``; it must stay idempotent and must hand the export pins
to the corpus records, which are built before it runs.

Built with the help of Claude Code.
"""

import importlib
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class LazyRegistriesTest(unittest.TestCase):
    def setUp(self):
        # A fresh module object, so state left by other tests (or generate_data) does
        # not hide an import-time load.
        self._orig = sys.modules.pop("data_generators.provenance", None)
        self.P = importlib.import_module("data_generators.provenance")

    def test_import_loads_nothing(self):
        self.assertFalse(self.P._REGISTRIES_LOADED)
        self.assertEqual(self.P.RECEPTOR_LOCATION_SOURCES, {})
        self.assertEqual(self.P.SOURCE_CORPORA["pharmfreq"]["export_sha256"], {})

    def test_load_is_idempotent_and_fills_the_pins(self):
        self.P.load_external_registries()
        targets = {k: list(v) for k, v in self.P.TARGET_CLASSIFICATION_SOURCES.items()}
        self.P.load_external_registries()
        # A second load must not extend the per-target source lists again.
        self.assertEqual(
            {k: list(v) for k, v in self.P.TARGET_CLASSIFICATION_SOURCES.items()}, targets)
        self.assertEqual(self.P.SOURCE_CORPORA["pharmfreq"]["export_sha256"],
                         self.P.ENZYME_VARIABILITY_PINS)
        self.assertEqual(self.P.SOURCE_CORPORA["cpic"]["export_sha256"],
                         self.P.CPIC_GUIDANCE_PINS)

    def tearDown(self):
        # Put back the module object every other importer already holds, so later
        # tests never see two diverging copies of the registries.
        if self._orig is not None:
            sys.modules["data_generators.provenance"] = self._orig
        else:
            sys.modules.pop("data_generators.provenance", None)


if __name__ == "__main__":
    unittest.main(verbosity=2)
