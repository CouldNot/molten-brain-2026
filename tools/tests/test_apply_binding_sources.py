"""apply_binding_sources.py must import: provenance.py uses package-relative imports,
so loading it as a top-level module (the script's original path hack) crashed before
any gate ran. Built with the help of Claude Code."""
import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


class ImportTest(unittest.TestCase):
    def test_module_imports_and_table_is_well_formed(self):
        spec = importlib.util.spec_from_file_location(
            "apply_binding_sources", ROOT / "tools" / "sourcing" / "apply_binding_sources.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertIn("wikipedia_pharm", mod.SOURCE_CORPORA)
        for (drug, target), src in mod.BINDING_SOURCES.items():
            self.assertTrue(drug and target)
            self.assertEqual(src["provenance"], "verified")
            self.assertIn(src["corpus"], mod.SOURCE_CORPORA)


if __name__ == "__main__":
    unittest.main()
