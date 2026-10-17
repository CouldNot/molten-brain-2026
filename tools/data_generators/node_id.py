"""The one shape a node id may take, shared by ``check_data.py`` and ``render_api.py``.

An id ends up as a file name (``/api/<kind>/<id>.md``), a URL segment and a ``?param``
value, so it is held to ``[A-Za-z0-9_]`` (``putamen_R``, ``amphetamine_dl``). A
projection's page id joins two such ids with ``--`` (``raphe--frontal_R``). Stdlib only:
the Docker ``api`` stage copies this file next to ``render_api.py``.
"""

from __future__ import annotations

import re

NODE_ID_RE = re.compile(r"[A-Za-z0-9_]+")
PAGE_ID_RE = re.compile(r"[A-Za-z0-9_]+(?:--[A-Za-z0-9_]+)?")


def is_node_id(value: object) -> bool:
    """True when ``value`` is a string ``NODE_ID_RE`` matches whole."""
    return isinstance(value, str) and NODE_ID_RE.fullmatch(value) is not None
