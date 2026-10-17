"""data_generators.demographics: the ``receptor_demographic`` node kind (BETA).

One node = one sourced claim "in humans, the availability of this receptor (or
transporter / enzyme) **changes with age** or **differs by sex**", read off a human PET /
SPECT (or post-mortem autoradiography) abstract: D2 availability declines with age,
MAO-B rises with age, 5-HT1A binding is higher in women. Optional ``structure`` (a modeled
structure id, when the sentence names one) and ``magnitude`` (verbatim text of the
sentence, "6% per decade"). It is a statement about the receptor population, never about
any visitor: the panel words it conditionally ("reported to ...").

The closed vocabularies below are emitted into ``meta.demographics`` so the viewer and
``check_data.py`` read them instead of restating them. The nodes are written by
``tools/sourcing/apply_demographics.py`` (sole writer) into
``tools/generated_cache/receptor_demographics.json``; :func:`demographic_nodes` turns
that cache into the ``demographics`` list a receptor record / target entry carries.

Built with the help of Claude Code.
"""
from __future__ import annotations

from typing import Any

from . import caches
from .provenance import _quote_sources

CACHE = caches.CACHE_DIR / "receptor_demographics.json"

# factor -> bilingual label + the directions a node of that factor may state.
DEMOGRAPHIC_FACTORS: dict[str, dict[str, Any]] = {
    "age": {"label": {"en": "Age", "fr": "Âge"},
            "directions": ["decrease", "increase", "no_difference"]},
    "sex": {"label": {"en": "Sex", "fr": "Sexe"},
            "directions": ["higher_in_female", "higher_in_male", "no_difference"]},
}
# direction -> the glyph its panel chip wears (presentation lives here, not in the viewer).
DEMOGRAPHIC_DIRECTIONS: dict[str, str] = {
    "decrease": "↓", "increase": "↑", "higher_in_female": "♀ >", "higher_in_male": "♂ >",
    "no_difference": "=",
}
assert all(d in DEMOGRAPHIC_DIRECTIONS for v in DEMOGRAPHIC_FACTORS.values()
           for d in v["directions"])

_FIELDS = ("factor", "direction", "structure")


def node_key(factor: str, direction: str, structure: str | None) -> str:
    """The cache key of one node under its owner (``-`` = no structure stated)."""
    return ":".join((factor, direction, structure or "-"))


def parse_key(key: str) -> dict[str, Any]:
    """Inverse of :func:`node_key` (``structure`` back to ``None`` for ``-``)."""
    parts = key.split(":")
    if len(parts) != len(_FIELDS):
        raise KeyError(f"demographics key {key!r}: expected {len(_FIELDS)} fields")
    f = dict(zip(_FIELDS, parts))
    f["structure"] = None if f["structure"] == "-" else f["structure"]
    return f


def vocab_error(f: dict[str, Any], structures: set[str] | None = None) -> str | None:
    """Why ``f`` (``factor``, ``direction``, ``structure``) breaks the closed vocabulary,
    or ``None``. Shared by the applier, the emitter and ``check_data.py``."""
    spec = DEMOGRAPHIC_FACTORS.get(f.get("factor"))
    if spec is None:
        return f"factor {f.get('factor')!r} not in DEMOGRAPHIC_FACTORS"
    if f.get("direction") not in spec["directions"]:
        return f"direction {f.get('direction')!r} not allowed for factor {f['factor']!r}"
    if f.get("structure") and structures is not None and f["structure"] not in structures:
        return f"structure {f['structure']!r} is not a modeled structure"
    return None


def load_cache() -> dict[str, dict[str, list]]:
    """``{owner id: {node key: [source, ...]}}`` (empty when not built yet)."""
    return caches.load(CACHE.name, required=False)


def demographic_nodes(owner: str, cache: dict[str, dict[str, list]], owner_kind: str,
                      structures: set[str] | None = None) -> list[dict[str, Any]]:
    """The ``demographics`` list one receptor record / target entry carries, sorted by key.

    Each item ``{factor, direction, structure, magnitude?, sources, grade}`` is ONE node.
    ``magnitude`` rides the raw source that states it (the applier checked it is verbatim
    in that quote). A vocabulary break in the cache fails the build."""
    out: list[dict[str, Any]] = []
    for key, srcs in sorted((cache.get(owner) or {}).items()):
        f = parse_key(key)
        what = f"{owner_kind} {owner!r} demographics {key!r}"
        err = vocab_error(f, structures)
        if err:
            raise KeyError(f"{what}: {err}")
        sources = _quote_sources(srcs, what)
        if not sources:
            continue
        node = {**f, "sources": sources,
                "grade": "verified" if any(s["provenance"] == "verified"
                                           for s in sources) else "sourced"}
        magnitude = next((s["magnitude"] for s in srcs if s.get("magnitude")), None)
        if magnitude:
            node["magnitude"] = magnitude
        out.append(node)
    return out


def meta_vocab() -> dict[str, Any]:
    """The closed vocabularies, emitted as ``meta.demographics`` (labels stay bilingual:
    the serialization-time ``externalize`` pass collapses them)."""
    return {"demographics": {
        "factors": {k: {"label": dict(v["label"]), "directions": list(v["directions"])}
                    for k, v in DEMOGRAPHIC_FACTORS.items()},
        "glyphs": dict(DEMOGRAPHIC_DIRECTIONS),
    }}
