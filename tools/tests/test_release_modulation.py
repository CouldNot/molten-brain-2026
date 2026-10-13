#!/usr/bin/env python
"""Tests for the ``receptor_release_modulation`` node kind: applier gates, emitter, fetcher cues.

Built with the help of Claude Code.
"""
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))
sys.path.insert(0, str(ROOT / "tools" / "fetch"))
import apply_release_modulation as A  # noqa: E402
import fetch_release_modulation as F  # noqa: E402
from data_generators import release_modulation as RM  # noqa: E402

C2C = ("Excitatory 5HT2C receptors on GABA interneurons in the VTA inhibit dopamine "
       "release in the prefrontal cortex.")
H3 = "Histamine H3 receptors are presynaptic autoreceptors that inhibit histamine release."
GOOD = {"kind": "heteroreceptor", "structure": "vta", "cell": "gaba_interneuron",
        "modulates": "dopamine", "effect": "decrease", "picks": [0]}


class ApplierGateTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        d = Path(self.tmp.name)
        (d / "142.md").write_text(f"Header\n{C2C}\n{H3}\n", encoding="utf-8")
        self.pages = {"stahl_essential": d}
        self.worklist = {"owners": {
            "5ht2c": {"candidates": [
                {"corpus": "stahl_essential", "page": 142, "line": C2C,
                 "transmitters": ["dopamine", "gaba"]},
                {"corpus": "stahl_essential", "page": 142, "line": "Never printed.",
                 "transmitters": ["dopamine"]},
            ]},
            "h3": {"candidates": [
                {"corpus": "stahl_essential", "page": 142, "line": H3,
                 "transmitters": ["histamine"]},
            ]},
        }}
        self.receptors = {"5ht2c": "Serotonin", "h3": "Histamine"}
        self.structures = {"vta", "raphe"}

    def tearDown(self):
        self.tmp.cleanup()

    def run_(self, owners):
        return A.apply(self.worklist, {"owners": owners}, self.receptors, self.structures,
                       pages=self.pages)

    def test_good_pick_lands_verified(self):
        cache, misses = self.run_({"5ht2c": [GOOD]})
        self.assertEqual(misses, [])
        key = "heteroreceptor:vta:gaba_interneuron:dopamine:decrease"
        src = cache["5ht2c"][key][0]
        self.assertEqual((src["page"], src["quote"], src["provenance"]),
                         (142, C2C, "verified"))

    def test_structure_is_optional(self):
        cache, _ = self.run_({"h3": [{"kind": "autoreceptor", "structure": None,
                                      "cell": "presynaptic_terminal", "modulates": "histamine",
                                      "effect": "decrease", "picks": [0]}]})
        self.assertIn("autoreceptor:-:presynaptic_terminal:histamine:decrease", cache["h3"])

    def test_transmitter_the_sentence_never_names_is_refused(self):
        cache, misses = self.run_({"5ht2c": [{**GOOD, "modulates": "norepinephrine"}]})
        self.assertEqual(cache, {})
        self.assertIn("never name", misses[0])

    def test_unknown_structure_is_refused(self):
        cache, misses = self.run_({"5ht2c": [{**GOOD, "structure": "vta_core"}]})
        self.assertEqual(cache, {})
        self.assertIn("not a modeled structure", misses[0])

    def test_autoreceptor_must_modulate_its_own_transmitter(self):
        cache, misses = self.run_({"5ht2c": [{**GOOD, "kind": "autoreceptor",
                                              "cell": "presynaptic_terminal"}]})
        self.assertEqual(cache, {})
        self.assertIn("own transmitter", misses[0])

    def test_autoreceptor_cannot_sit_on_an_interneuron(self):
        cache, misses = self.run_({"h3": [{"kind": "autoreceptor", "structure": None,
                                           "cell": "gaba_interneuron", "modulates": "histamine",
                                           "effect": "decrease", "picks": [0]}]})
        self.assertEqual(cache, {})
        self.assertIn("releasing neuron", misses[0])

    def test_quote_off_its_page_drops_the_whole_node(self):
        cache, misses = self.run_({"5ht2c": [{**GOOD, "picks": [0, 1]}]})
        self.assertEqual(cache, {})
        self.assertIn("quote not on", misses[0])

    def test_closed_vocabulary(self):
        for bad in ({"effect": "doubles"}, {"cell": "astrocyte"}, {"kind": "paracrine"}):
            cache, misses = self.run_({"5ht2c": [{**GOOD, **bad}]})
            self.assertEqual(cache, {}, bad)
            self.assertIn("closed vocabulary", misses[0])

    def test_missing_field_is_refused(self):
        node = dict(GOOD)
        node.pop("cell")
        cache, misses = self.run_({"5ht2c": [node]})
        self.assertEqual(cache, {})
        self.assertIn("missing", misses[0])

    def test_owner_no_longer_modeled_is_refused(self):
        self.receptors.pop("5ht2c")
        cache, misses = self.run_({"5ht2c": [GOOD]})
        self.assertEqual(cache, {})
        self.assertIn("not a current", misses[0])


class EmitterTest(unittest.TestCase):
    SRC = [{"corpus": "stahl_essential", "page": 142, "quote": C2C, "provenance": "verified"}]

    def test_node_shape(self):
        cache = {"5ht2c": {"heteroreceptor:vta:gaba_interneuron:dopamine:decrease": self.SRC}}
        (n,) = RM.modulation_nodes({"id": "5ht2c", "neurotransmitter": "Serotonin"}, cache,
                                   {"vta"})
        self.assertEqual((n["kind"], n["site"], n["modulates"], n["effect_of_activation"],
                          n["grade"]),
                         ("heteroreceptor", {"structure": "vta", "cell": "gaba_interneuron"},
                          "dopamine", "decrease", "verified"))

    def test_vocabulary_break_in_cache_fails_the_build(self):
        cache = {"5ht2c": {"autoreceptor:-:presynaptic_terminal:dopamine:decrease": self.SRC}}
        with self.assertRaises(KeyError):
            RM.modulation_nodes({"id": "5ht2c", "neurotransmitter": "Serotonin"}, cache)

    def test_key_round_trip(self):
        f = {"kind": "autoreceptor", "structure": None, "cell": "cell_body",
             "modulates": "serotonin", "effect": "decrease"}
        self.assertEqual(RM.parse_key(RM.node_key(**f)), f)

    def test_every_system_is_a_receptor_transmitter(self):
        import json
        systems = {json.loads(ln)["neurotransmitter"] for ln in
                   (ROOT / "public/data/receptors.jsonl").read_text("utf-8").splitlines()
                   if ln.strip()}
        for t, v in RM.RELEASE_TRANSMITTERS.items():
            self.assertIn(v["system"], systems, t)


class FetcherCueTest(unittest.TestCase):
    def test_needs_a_mechanism_cue(self):
        self.assertEqual(F.transmitter_hits("Dopamine and serotonin are monoamines."), [])

    def test_names_every_transmitter(self):
        self.assertEqual(F.transmitter_hits(C2C), ["dopamine", "gaba"])

    def test_acronyms_are_case_sensitive(self):
        self.assertEqual(F.transmitter_hits("presynaptic release of NE"), ["norepinephrine"])
        self.assertEqual(F.transmitter_hits("presynaptic release of one"), [])

    def test_a_receptor_name_does_not_name_serotonin(self):
        self.assertEqual(F.transmitter_hits("5HT1A autoreceptors inhibit 5HT release"),
                         ["serotonin"])
        self.assertEqual(F.transmitter_hits("serotonin 2A receptors on interneurons"), [])


if __name__ == "__main__":
    unittest.main()
