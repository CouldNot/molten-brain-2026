#!/usr/bin/env python
"""Every docker/Dockerfile COPY source survives the .dockerignore allowlist.

The image builds from the repo root with a deny-all `.dockerignore` that re-includes
only what the Dockerfile copies, so a new COPY with no matching `!` line passes every
local test and only fails at `docker compose build` on the deploy host.
"""
from __future__ import annotations

import re
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _rules() -> list[tuple[re.Pattern[str], bool]]:
    """(.dockerignore pattern as regex, is an exclusion) in file order."""
    rules = []
    for line in (REPO / ".dockerignore").read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        keep = line.startswith("!")
        pat = line.lstrip("!").strip("/")
        rx = "".join("[^/]*" if c == "*" else re.escape(c) for c in pat)
        rules.append((re.compile(rx + r"\Z"), not keep))
    return rules


def ignored(rel: str, rules: list[tuple[re.Pattern[str], bool]]) -> bool:
    """Docker's MatchesOrParentMatches: the last rule matching the path or a parent wins."""
    parts = rel.split("/")
    prefixes = ["/".join(parts[: i + 1]) for i in range(len(parts))]
    out = False
    for rx, exclude in rules:
        if any(rx.match(p) for p in prefixes):
            out = exclude
    return out


def copy_sources() -> list[str]:
    """Build-context sources of every COPY (not COPY --from, which reads a stage)."""
    out = []
    for line in (REPO / "docker" / "Dockerfile").read_text().splitlines():
        words = line.split()
        if words[:1] != ["COPY"] or any(w.startswith("--from") for w in words):
            continue
        out += [w for w in words[1:-1] if not w.startswith("--")]
    return out


class DockerignoreTest(unittest.TestCase):
    def test_every_copy_source_reaches_the_build_context(self):
        rules = _rules()
        sources = copy_sources()
        self.assertTrue(sources)
        for src in sources:
            path = REPO / src
            files = [path] if path.is_file() else [p for p in path.rglob("*") if p.is_file()]
            kept = [f for f in files if not ignored(f.relative_to(REPO).as_posix(), rules)]
            self.assertTrue(kept, f"{src} is COPYed but .dockerignore excludes it")

    def test_matcher_follows_last_rule(self):
        rules = [(re.compile(r"[^/]*\Z"), True), (re.compile(r"tools/a\.py\Z"), False)]
        self.assertFalse(ignored("tools/a.py", rules))
        self.assertTrue(ignored("tools/b.py", rules))


if __name__ == "__main__":
    unittest.main()
