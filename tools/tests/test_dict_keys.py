#!/usr/bin/env python
"""No dict literal under tools/ repeats a constant key.

Python keeps the LAST value of a repeated key and says nothing, so in a quote table
like ``quotes/kandel.py``'s ``STRUCTURE_QUOTES`` a second entry for the same
structure silently replaces the first (``nucleus_basalis`` was set twice; the
survivor happened to be the intended quote, the next collision may not be). Stdlib
``ast`` only, so it runs wherever the rest of the suite does.

Built with the help of Claude Code.
"""

import ast
import unittest
from pathlib import Path

TOOLS = Path(__file__).resolve().parent.parent


def repeated_keys(source: str) -> list[tuple[int, object]]:
    """``(line, key)`` for every constant key a dict literal in ``source`` repeats.

    Only literal keys (strings, numbers, tuples of them) are compared: a computed
    key cannot be checked statically, and ``**spread`` entries (key ``None`` in the
    AST) are skipped.
    """
    out = []
    for node in ast.walk(ast.parse(source)):
        if not isinstance(node, ast.Dict):
            continue
        seen = set()
        for k in node.keys:
            if k is None:
                continue
            try:
                value = ast.literal_eval(k)
            except ValueError:
                continue
            if value in seen:
                out.append((k.lineno, value))
            seen.add(value)
    return out


class DictKeysTest(unittest.TestCase):
    def test_detects_a_repeat(self):
        self.assertEqual(repeated_keys('D = {"a": 1,\n "b": 2,\n "a": 3}'), [(3, "a")])

    def test_no_tool_repeats_a_key(self):
        bad = []
        for path in sorted(TOOLS.rglob("*.py")):
            if "__pycache__" in path.parts:
                continue
            for line, key in repeated_keys(path.read_text(encoding="utf-8")):
                bad.append(f"{path.relative_to(TOOLS)}:{line}: {key!r}")
        self.assertEqual(bad, [], "dict literal repeats a key (the later value wins)")


if __name__ == "__main__":
    unittest.main(verbosity=2)
