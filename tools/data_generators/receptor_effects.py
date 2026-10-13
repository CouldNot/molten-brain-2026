"""data_generators.receptor_effects: the ``receptor_effect`` node kind (BETA).

One node = one sourced sentence-level claim "acting on this receptor (or target) in this
**mode** can cause this clinical **effect**" (H1 antagonism -> sedation, D2 antagonism ->
prolactin elevation). It is a statement about the receptor, never about a drug: the
viewer only *derives* a drug's possible effects by joining its directional bindings with
these nodes, worded conditionally, and stores nothing per drug.

The two vocabularies below are closed and emitted into ``meta`` (``receptor_effect_modes``
/ ``receptor_effect_labels``) so the viewer and ``check_data.py`` read them instead of
restating them. Grow :data:`EFFECTS` only when a source states a new effect.

The nodes themselves are written by ``tools/sourcing/apply_receptor_effects.py`` (sole
writer) into ``tools/generated_cache/receptor_effects.json``; :func:`effect_nodes` turns
that cache into the ``effects`` list a receptor record / target entry carries.

Built with the help of Claude Code.
"""
from __future__ import annotations

import functools
import json
from pathlib import Path
from typing import Any

from .provenance import _quote_sources

CACHE = Path(__file__).resolve().parent.parent / "generated_cache" / "receptor_effects.json"

# mode -> label + the binding actions that inherit it in the drug-panel join. The join is
# direction-aware: an antagonist inherits only antagonism effects, an affinity_only
# binding (no action) inherits nothing. ``both`` = the source says either direction
# causes it. ``inhibition`` is the mode of a non-receptor target (a transporter, an
# enzyme), whose drugs are inhibitors, not antagonists.
RECEPTOR_EFFECT_MODES: dict[str, dict[str, Any]] = {
    "agonism": {"label": {"en": "Agonism", "fr": "Agonisme"},
                "actions": ["agonist", "partial_agonist", "pam"]},
    "antagonism": {"label": {"en": "Antagonism", "fr": "Antagonisme"},
                   "actions": ["antagonist", "inverse_agonist", "nam", "blocker"]},
    "both": {"label": {"en": "Agonism or antagonism", "fr": "Agonisme ou antagonisme"},
             "actions": ["agonist", "partial_agonist", "pam",
                         "antagonist", "inverse_agonist", "nam", "blocker"]},
    "inhibition": {"label": {"en": "Inhibition", "fr": "Inhibition"},
                   "actions": ["reuptake_inhibitor", "enzyme_inhibitor",
                               "vesicular_inhibitor", "synthesis_inhibitor", "blocker"]},
}

# effect -> bilingual label. Human / clinical effects only (no knockout phenotype).
RECEPTOR_EFFECTS: dict[str, dict[str, str]] = {
    "sedation": {"en": "Sedation", "fr": "Sédation"},
    "weight_gain": {"en": "Weight gain", "fr": "Prise de poids"},
    "appetite_increase": {"en": "Increased appetite", "fr": "Augmentation de l'appétit"},
    "orthostatic_hypotension": {"en": "Orthostatic hypotension",
                                "fr": "Hypotension orthostatique"},
    "dizziness": {"en": "Dizziness", "fr": "Vertiges"},
    "hallucinations": {"en": "Hallucinations", "fr": "Hallucinations"},
    "prolactin_elevation": {"en": "Prolactin elevation", "fr": "Élévation de la prolactine"},
    "extrapyramidal_symptoms": {"en": "Extrapyramidal symptoms (parkinsonism)",
                                "fr": "Symptômes extrapyramidaux (parkinsonisme)"},
    "tardive_dyskinesia": {"en": "Tardive dyskinesia", "fr": "Dyskinésie tardive"},
    "akathisia": {"en": "Akathisia", "fr": "Akathisie"},
    "anticholinergic_cognitive": {"en": "Memory / cognitive impairment",
                                  "fr": "Troubles mnésiques / cognitifs"},
    "dry_mouth": {"en": "Dry mouth", "fr": "Sécheresse buccale"},
    "constipation": {"en": "Constipation", "fr": "Constipation"},
    "blurred_vision": {"en": "Blurred vision", "fr": "Vision trouble"},
    "urinary_retention": {"en": "Urinary retention", "fr": "Rétention urinaire"},
    "nausea": {"en": "Nausea / vomiting", "fr": "Nausées / vomissements"},
    "sexual_dysfunction": {"en": "Sexual dysfunction", "fr": "Dysfonction sexuelle"},
    "insomnia": {"en": "Insomnia / activation", "fr": "Insomnie / activation"},
    "anxiety": {"en": "Anxiety / agitation", "fr": "Anxiété / agitation"},
    "euphoria": {"en": "Euphoria / reward", "fr": "Euphorie / récompense"},
    "dysphoria": {"en": "Dysphoria", "fr": "Dysphorie"},
    "respiratory_depression": {"en": "Respiratory depression",
                               "fr": "Dépression respiratoire"},
    "seizures": {"en": "Seizures", "fr": "Convulsions"},
    "psychosis": {"en": "Psychosis", "fr": "Psychose"},
    "cardiovascular": {"en": "Raised heart rate / blood pressure",
                       "fr": "Hausse de la fréquence cardiaque / tension"},
}


def _key(mode: str, effect: str) -> str:
    """The cache key of one node under its owner (``<mode>:<effect>``)."""
    return f"{mode}:{effect}"


@functools.lru_cache(maxsize=None)
def load_cache(path: Path = CACHE) -> dict[str, dict[str, list]]:
    """``{owner id: {"<mode>:<effect>": [source, ...]}}`` (empty when not built yet)."""
    return json.loads(path.read_text("utf-8")) if path.exists() else {}


def effect_nodes(owner: str, cache: dict[str, dict[str, list]],
                 owner_kind: str) -> list[dict[str, Any]]:
    """The ``effects`` list one receptor record / target entry carries, sorted.

    Each item ``{mode, effect, sources, grade}`` is ONE node (kind ``receptor_effect``).
    An unknown mode or effect in the cache fails the build: the vocabularies are closed.
    """
    out: list[dict[str, Any]] = []
    for key, srcs in sorted((cache.get(owner) or {}).items()):
        mode, _, effect = key.partition(":")
        if mode not in RECEPTOR_EFFECT_MODES or effect not in RECEPTOR_EFFECTS:
            raise KeyError(f"{owner_kind} {owner!r} effect {key!r}: mode or effect not "
                           f"in RECEPTOR_EFFECT_MODES / RECEPTOR_EFFECTS")
        what = f"{owner_kind} {owner!r} effect {key!r}"
        sources = _quote_sources(srcs, what)
        if not sources:
            continue
        out.append({"mode": mode, "effect": effect, "sources": sources,
                    "grade": "verified" if any(s["provenance"] == "verified"
                                               for s in sources) else "sourced"})
    return out


def meta_vocab() -> dict[str, Any]:
    """The two closed vocabularies, emitted into ``meta`` (labels stay bilingual: the
    serialization-time ``externalize`` pass collapses them like every other ``{en,fr}``)."""
    return {
        "receptor_effect_modes": {m: {"label": dict(v["label"]), "actions": list(v["actions"])}
                                  for m, v in RECEPTOR_EFFECT_MODES.items()},
        "receptor_effect_labels": {e: dict(v) for e, v in RECEPTOR_EFFECTS.items()},
    }
