"""data_generators.release_modulation: the ``receptor_release_modulation`` node kind (BETA).

One node = one sourced sentence-level claim "activating this receptor, sitting on this
**cell** (optionally in this **structure**), **increases / decreases** the release of this
**transmitter**" (a 2nd-order effect): 5-HT2C on GABA interneurons -> less dopamine, alpha2
heteroreceptors on serotonin terminals -> less serotonin, 5-HT1A somatodendritic
autoreceptors in the raphe -> less serotonin. It is a statement about the receptor, never
about a drug: the viewer *derives* a drug's possible release changes by joining its
directional bindings with these nodes (an antagonist flips the direction, affinity_only
contributes nothing), worded conditionally, and stores nothing per drug.

``structure`` is optional: many sources state the circuit without a region ("alpha2
heteroreceptors on serotonin terminals"), and the node then says no more than its quote.

The closed vocabularies below are emitted into ``meta`` (``release_modulation``) so the
viewer and ``check_data.py`` read them instead of restating them. The nodes themselves are
written by ``tools/sourcing/apply_release_modulation.py`` (sole writer) into
``tools/generated_cache/release_modulation.json``; :func:`modulation_nodes` turns that
cache into the ``release_modulation`` list a receptor record carries.

Built with the help of Claude Code.
"""
from __future__ import annotations

from typing import Any

from . import caches
from .provenance import _quote_sources

CACHE = caches.CACHE_DIR / "release_modulation.json"

# auto = on the neuron that releases the transmitter (its own terminal or soma); hetero =
# any other arrangement (a receptor for another transmitter, or on an interneuron).
RELEASE_KINDS: dict[str, dict[str, str]] = {
    "autoreceptor": {"en": "Autoreceptor", "fr": "Autorécepteur"},
    "heteroreceptor": {"en": "Heteroreceptor", "fr": "Hétérorécepteur"},
}

# The cell the receptor sits on. An autoreceptor sits on the releasing neuron itself, so
# only the first two apply to it.
RELEASE_CELLS: dict[str, dict[str, str]] = {
    "presynaptic_terminal": {"en": "presynaptic terminals", "fr": "terminaisons présynaptiques"},
    "cell_body": {"en": "cell bodies (somatodendritic)",
                  "fr": "corps cellulaires (somatodendritiques)"},
    "gaba_interneuron": {"en": "GABA interneurons", "fr": "interneurones GABA"},
    "glutamatergic_neuron": {"en": "glutamatergic (pyramidal) neurons",
                             "fr": "neurones glutamatergiques (pyramidaux)"},
}
AUTORECEPTOR_CELLS = ("presynaptic_terminal", "cell_body")

# transmitter id -> bilingual label + the ``neurotransmitter`` name receptor records and
# projections carry for it (the autoreceptor gate and the 3D overlay join on it).
RELEASE_TRANSMITTERS: dict[str, dict[str, Any]] = {
    "dopamine": {"label": {"en": "dopamine", "fr": "dopamine"}, "system": "Dopamine"},
    "serotonin": {"label": {"en": "serotonin", "fr": "sérotonine"}, "system": "Serotonin"},
    "norepinephrine": {"label": {"en": "norepinephrine", "fr": "noradrénaline"},
                       "system": "Noradrenaline"},
    "acetylcholine": {"label": {"en": "acetylcholine", "fr": "acétylcholine"},
                      "system": "Acetylcholine"},
    "histamine": {"label": {"en": "histamine", "fr": "histamine"}, "system": "Histamine"},
    "glutamate": {"label": {"en": "glutamate", "fr": "glutamate"}, "system": "Glutamate"},
    "gaba": {"label": {"en": "GABA", "fr": "GABA"}, "system": "GABA"},
}

RELEASE_EFFECTS = ("increase", "decrease")

_FIELDS = ("kind", "structure", "cell", "modulates", "effect")


def node_key(kind: str, structure: str | None, cell: str, modulates: str, effect: str) -> str:
    """The cache key of one node under its receptor (``-`` = no structure stated)."""
    return ":".join((kind, structure or "-", cell, modulates, effect))


def parse_key(key: str) -> dict[str, Any]:
    """Inverse of :func:`node_key`."""
    parts = key.split(":")
    if len(parts) != len(_FIELDS):
        raise KeyError(f"release_modulation key {key!r}: expected {len(_FIELDS)} fields")
    out = dict(zip(_FIELDS, parts))
    out["structure"] = None if out["structure"] == "-" else out["structure"]
    return out


def vocab_error(f: dict[str, Any], receptor_system: str | None,
                structures: set[str] | None = None) -> str | None:
    """Why one node's fields break the closed vocabularies, or None when they hold.

    Shared by the applier (a miss), the emitter (a build failure) and check_data."""
    if f["kind"] not in RELEASE_KINDS or f["cell"] not in RELEASE_CELLS \
            or f["modulates"] not in RELEASE_TRANSMITTERS or f["effect"] not in RELEASE_EFFECTS:
        return "kind / cell / modulates / effect outside the closed vocabulary"
    if structures is not None and f["structure"] is not None and f["structure"] not in structures:
        return f"structure {f['structure']!r} is not a modeled structure"
    if f["kind"] == "autoreceptor":
        if f["cell"] not in AUTORECEPTOR_CELLS:
            return "an autoreceptor sits on the releasing neuron (terminal or cell body)"
        if RELEASE_TRANSMITTERS[f["modulates"]]["system"] != receptor_system:
            return "an autoreceptor modulates its own transmitter"
    return None


def load_cache() -> dict[str, dict[str, list]]:
    """``{receptor id: {node_key: [source, ...]}}`` (empty when not built yet)."""
    return caches.load(CACHE.name, required=False)


def modulation_nodes(rec: dict[str, Any], cache: dict[str, dict[str, list]],
                     structures: set[str] | None = None) -> list[dict[str, Any]]:
    """The ``release_modulation`` list one receptor record carries, sorted by key.

    Each item ``{kind, site: {structure, cell}, modulates, effect_of_activation, sources,
    grade}`` is ONE node. A vocabulary break in the cache fails the build."""
    out: list[dict[str, Any]] = []
    for key, srcs in sorted((cache.get(rec["id"]) or {}).items()):
        f = parse_key(key)
        err = vocab_error(f, rec.get("neurotransmitter"), structures)
        if err:
            raise KeyError(f"receptor {rec['id']!r} release_modulation {key!r}: {err}")
        sources = _quote_sources(srcs, f"receptor {rec['id']!r} release_modulation {key!r}")
        if not sources:
            continue
        out.append({"kind": f["kind"], "site": {"structure": f["structure"], "cell": f["cell"]},
                    "modulates": f["modulates"], "effect_of_activation": f["effect"],
                    "sources": sources,
                    "grade": "verified" if any(s["provenance"] == "verified"
                                               for s in sources) else "sourced"})
    return out


def meta_vocab() -> dict[str, Any]:
    """The closed vocabularies, emitted as ``meta.release_modulation`` (labels stay
    bilingual: the serialization-time ``externalize`` pass collapses them)."""
    return {"release_modulation": {
        "kinds": {k: dict(v) for k, v in RELEASE_KINDS.items()},
        "cells": {k: dict(v) for k, v in RELEASE_CELLS.items()},
        "transmitters": {k: {"label": dict(v["label"]), "system": v["system"]}
                         for k, v in RELEASE_TRANSMITTERS.items()},
        "effects": list(RELEASE_EFFECTS),
        "autoreceptor_cells": list(AUTORECEPTOR_CELLS),
    }}
