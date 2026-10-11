"""Shared name/text folding for the author-side tools (stdlib only).

Two primitives every matcher here was re-implementing:

- :func:`strip_accents`: NFKD-decompose and drop the combining marks, so
  ``"Théralène"`` -> ``"Theralene"``. Case and punctuation are left to the caller,
  since each matcher keeps different separators (``target_aliases.fold`` needs word
  boundaries, ``apply_brand_names.brand_key`` drops them all).
- :func:`alnum_key`: lowercase alphanumerics only, the key a drug name is reconciled
  against a book ``INDEX.md`` with, so ``"Amphetamine (D)"`` and ``"Amphetamine D"``
  meet as ``"amphetamined"``.
"""
from __future__ import annotations

import unicodedata


def strip_accents(text: str) -> str:
    """``text`` with every combining mark removed after NFKD decomposition."""
    t = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in t if not unicodedata.combining(c))


def alnum_key(name: str) -> str:
    """Lowercase alphanumerics only (``str.isalnum``, so accented letters survive)."""
    return "".join(c for c in name.lower() if c.isalnum())
