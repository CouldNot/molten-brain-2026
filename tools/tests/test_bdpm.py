#!/usr/bin/env python
"""Unit tests for the BDPM corpus #16 fetcher join (``tools/fetch/fetch_bdpm.py``) and the
French duration parsing it feeds into ``fetch_tmax``.

Stdlib ``unittest`` only, over hand-built table rows, so it runs on a clone that lacks the
gitignored ``data_sources/bdpm/`` tree::

    python tools/tests/test_bdpm.py

Built with the help of Claude Code.
"""

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
import fetch_bdpm as B  # noqa: E402
import fetch_tmax  # noqa: E402


def product(cis, denomination, form="comprimé", route="orale", marketed=True):
    return {"cis": cis, "denomination": denomination, "form": form, "route": route,
            "status": "Autorisation active", "marketed": marketed, "holder": "LAB"}


def sa(name, link="1"):
    return {"name": name, "nature": "SA", "link": link}


class JoinTest(unittest.TestCase):
    def setUp(self):
        self.products = {
            "1": product("1", "SEROPRAM 20 mg, comprimé pelliculé sécable"),
            "2": product("2", "SEROPLEX 10 mg, comprimé pelliculé sécable"),
            "3": product("3", "COMBO 5 mg, comprimé"),
            "4": product("4", "LYSERGIC, granules", form="granules"),
        }
        self.compo = {
            "1": [sa("BROMHYDRATE DE CITALOPRAM"),
                  {"name": "CITALOPRAM BASE", "nature": "FT", "link": "1"}],
            "2": [sa("OXALATE D'ESCITALOPRAM")],
            "3": [sa("CHLORHYDRATE DE CITALOPRAM", "1"), sa("SOMETHING ELSE", "2")],
            "4": [sa("CITALOPRAM POUR PRÉPARATIONS HOMÉOPATHIQUES")],
        }

    def join(self, drug):
        keys = B.drug_keys(drug, {})
        return sorted(p["cis"] for p in B.products_for(drug, keys, self.products, self.compo))

    def test_enantiomer_never_matches_racemate(self):
        """escitalopram's products never join citalopram and vice versa (exact match)."""
        self.assertEqual(self.join({"id": "citalopram", "name": "Citalopram"}), ["1"])
        self.assertEqual(self.join({"id": "escitalopram", "name": "Escitalopram"}), ["2"])

    def test_combination_and_homeopathy_skipped(self):
        """A two-active product (3) and a homeopathic dilution (4) are not the drug."""
        self.assertNotIn("3", self.join({"id": "citalopram", "name": "Citalopram"}))
        self.assertNotIn("4", self.join({"id": "citalopram", "name": "Citalopram"}))

    def test_stereo_qualified_name_joins_only_by_alias(self):
        """"Methylphenidate (D)" must not reduce to METHYLPHENIDATE (the racemate)."""
        keys = B.drug_keys({"id": "methylphenidate_d", "name": "Methylphenidate (D)"}, {})
        self.assertNotIn("METHYLPHENIDATE", keys)
        self.assertIn("DEXMETHYLPHENIDATE", keys)

    def test_prodrug_ft_line_ignored(self):
        """lisdexamfetamine's FT line (DEXAMFETAMINE) does not make it dexamfetamine."""
        lines = [sa("DIMÉSILATE DE LISDEXAMFÉTAMINE"),
                 {"name": "DEXAMFÉTAMINE", "nature": "FT", "link": "1"}]
        self.assertFalse(B.matches("amphetamine_d", {"DEXAMFETAMINE"}, lines))

    def test_french_suffix_and_inverted_salt(self):
        keys = B.drug_keys({"id": "vigabatrin", "name": "Vigabatrin"}, {})
        self.assertIn("VIGABATRINE", keys)
        self.assertEqual(B.molecule_key("SODIUM (VALPROATE DE)")[0], "VALPROATE")


class RankTest(unittest.TestCase):
    def test_prolonged_release_never_supplies_the_ir_rcp(self):
        """An LP product (the Seroquel XR gotcha) is never the representative RCP."""
        keys = {"QUETIAPINE"}
        ps = [product("10", "XEROQUEL LP 50 mg, comprimé à libération prolongée",
                      form="comprimé à libération prolongée"),
              product("11", "QUETIAPINE TEVA 25 mg, comprimé pelliculé"),
              product("12", "XEROQUEL 25 mg, comprimé pelliculé")]
        for p in ps:
            p["substances"] = ["FUMARATE DE QUÉTIAPINE"]
        ranked = [p["cis"] for p, _ in B.rank(ps, keys)]
        self.assertEqual(ranked, ["12", "11"])          # brand first, LP absent

    def test_only_lp_marketed_gives_nothing(self):
        p = product("20", "ZYBAN L.P. 150 mg, comprimé à libération prolongée",
                    form="comprimé à libération prolongée")
        self.assertEqual(B.rank([p], {"BUPROPION"}), [])

    def test_local_route_never_a_fallback(self):
        p = product("30", "ATROPINE ALCON 0,5 POUR CENT, collyre", form="collyre",
                    route="ophtalmique")
        self.assertEqual(B.rank([p], {"ATROPINE"}), [])


class BrandTest(unittest.TestCase):
    """The generic-exclusion rule of ``brand_of``."""

    def brand(self, denomination, subs=("LOPRAZOLAM",), keys=("LOPRAZOLAM",), route="orale"):
        p = product("1", denomination, route=route)
        p["substances"] = list(subs)
        return B.brand_of(p, set(keys))

    def test_brand(self):
        self.assertEqual(self.brand("HAVLANE, comprimé sécable"), "HAVLANE")
        self.assertEqual(self.brand("DEPAKINE CHRONO 500 mg, comprimé",
                                    ("VALPROATE DE SODIUM",), ("VALPROATE",)), "DEPAKINE")

    def test_inn_named_generic(self):
        self.assertIsNone(self.brand("LOPRAZOLAM TEVA 1 mg, comprimé"))
        self.assertIsNone(self.brand("ACIDE VALPROIQUE ARROW 200 mg, comprimé",
                                     ("ACIDE VALPROÏQUE",), ("ACIDE VALPROIQUE",)))
        self.assertIsNone(self.brand("VALPROATE DE SODIUM MYLAN 500 mg",
                                     ("VALPROATE DE SODIUM",), ("VALPROATE",)))

    def test_range_name_and_lab_and_local_route(self):
        self.assertIsNone(self.brand("GRANIONS DE LITHIUM, solution buvable",
                                     ("GLUCONATE DE LITHIUM",), ("LITHIUM",)))
        self.assertIsNone(self.brand("ZOLPI BIOGARAN 10 mg", ("ZOLPIDEM",), ("ZOLPIDEM",)))
        self.assertIsNone(self.brand("LITHIODERM, gel", ("GLUCONATE DE LITHIUM",),
                                     ("LITHIUM",), route="cutanée"))

    def test_display_casing(self):
        self.assertEqual(B.display_brand("DI-HYDAN"), "Di-Hydan")


class FrenchDurationTest(unittest.TestCase):
    def test_durations(self):
        self.assertEqual(fetch_tmax.durations_in_fr("un Tmax atteint en 1 heure environ"),
                         [{"hours": 1.0}])
        self.assertEqual(fetch_tmax.durations_in_fr("entre 1,5 et 3 heures"),
                         [{"hours": 1.5, "hours_max": 3.0}])
        self.assertEqual(fetch_tmax.durations_in_fr("de 15 à 17 heures"),
                         [{"hours": 15.0, "hours_max": 17.0}])

    def test_hours_and_minutes_and_mixed_units(self):
        self.assertEqual(fetch_tmax.durations_in_fr("environ 1h30 après la prise"),
                         [{"hours": 1.5}])
        self.assertEqual(fetch_tmax.durations_in_fr("30 min à 1 heure 30 plus tard"),
                         [{"hours": 0.5, "hours_max": 1.5}])

    def test_et_is_a_range_only_after_entre(self):
        """"en 2 et 3 heures respectivement" is venlafaxine's 2 h and ODV's 3 h."""
        self.assertEqual(fetch_tmax.durations_in_fr("respectivement en 2 et 3 heures"),
                         [{"hours": 2.0}, {"hours": 3.0}])
        self.assertEqual(fetch_tmax.durations_in_fr("entre 2 et 4 heures"),
                         [{"hours": 2.0, "hours_max": 4.0}])

    def test_bdpm_page_resolves_through_the_registry(self):
        import apply_tmax
        self.assertEqual(apply_tmax.page_path("bdpm", "69071035"),
                         ROOT / "data_sources" / "bdpm" / "pages" / "69071035.md")
        self.assertIsNone(apply_tmax.page_path("nope", "1"))


if __name__ == "__main__":
    unittest.main()
