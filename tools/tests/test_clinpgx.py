#!/usr/bin/env python
"""Tests for the ``receptor_variant`` node kind (ClinPGx clinical annotations, corpus #20).

Built with the help of Claude Code.
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from data_generators import clinpgx as C  # noqa: E402
from data_generators.genes import GENE_OWNERS  # noqa: E402

TEXT = "Patients with the AA genotype may have a decreased response to haloperidol."


def row(**over):
    base = {"id": "1", "variant": "rs1800497", "genes": ["ANKK1", "DRD2"], "level": "3",
            "categories": ["Efficacy"], "drugs": ["haloperidol", "antipsychotics"],
            "drug_ids": ["haloperidol", None], "phenotypes": ["Schizophrenia"],
            "population": "", "pmids": 2,
            "genotypes": [{"genotype": "AA", "text": TEXT, "function": ""},
                          {"genotype": "AG", "text": "", "function": ""}]}
    base.update(over)
    return base


def export(rows):
    return {"fetched": "2026-10-13", "created": "2025-07-05", "licence": "CC BY-SA 4.0",
            "url": C.DOWNLOAD_URL, "rows": rows}


class OwnersTest(unittest.TestCase):
    def test_receptor_gene_wins_over_group_target(self):
        self.assertEqual(GENE_OWNERS["ADRB2"], ("receptor", "beta2"))
        self.assertEqual(GENE_OWNERS["SLC6A4"], ("target", "sert"))

    def test_heteromer_subunit_lands_on_its_receptor(self):
        # fetch_allen's "nicotinic" group key is no emitted target: CHRNB2 must not
        # fall through to it.
        self.assertEqual(GENE_OWNERS["CHRNB2"], ("receptor", "nachr_a4b2"))

    def test_unmodeled_co_gene_is_ignored(self):
        self.assertEqual(C.owners_of(["ANKK1", "DRD2"]), [("receptor", "d2")])
        self.assertEqual(C.owners_of(["ANKK1"]), [])


class NodeTest(unittest.TestCase):
    def test_drugs_split_into_ids_and_unmatched_names(self):
        node = C.node_for(row())
        self.assertEqual(node["drugs"], ["haloperidol"])
        self.assertEqual(node["drug_names"], ["antipsychotics"])
        self.assertEqual(node["categories"], ["efficacy"])
        self.assertNotIn("population", node)

    def test_one_code_citation_per_non_empty_genotype_sentence(self):
        node = C.node_for(row())
        self.assertEqual(node["genotypes"], ["AA"])
        self.assertEqual(node["sources"], [{"corpus": "clinpgx", "page": "1", "quote": TEXT,
                                            "provenance": "verified",
                                            "extraction": "code"}])
        self.assertEqual(node["url"], "https://www.clinpgx.org/clinicalAnnotation/1")

    def test_strongest_level_sorts_first(self):
        nodes = C.variant_nodes(export([row(id="1", level="3"), row(id="2", level="2B")]))
        self.assertEqual([n["annotation"] for n in nodes[("receptor", "d2")]], ["2", "1"])


class ReadExportTest(unittest.TestCase):
    def read(self, rows):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "x.json"
            path.write_text(json.dumps(export(rows)), encoding="utf-8")
            return C.read_export(str(path))

    def test_good_export_reads(self):
        self.assertEqual(len(self.read([row()])["rows"]), 1)

    def test_level_4_is_rejected(self):
        with self.assertRaises(C.ExportError):
            self.read([row(level="4")])

    def test_unknown_category_is_rejected(self):
        with self.assertRaises(C.ExportError):
            self.read([row(categories=["Efficacy", "Mystery"])])

    def test_row_on_no_modeled_gene_is_rejected(self):
        with self.assertRaises(C.ExportError):
            self.read([row(genes=["ANKK1"])])


class CommittedExportTest(unittest.TestCase):
    def test_pin_matches_and_every_row_has_an_owner(self):
        self.assertTrue(C.load_pins())
        data = C.read_export(C.export_path(str(ROOT)))
        self.assertTrue(all(C.owners_of(r["genes"]) for r in data["rows"]))
        self.assertEqual({r["level"] for r in data["rows"]} - set(C.VARIANT_LEVELS), set())


if __name__ == "__main__":
    unittest.main()
