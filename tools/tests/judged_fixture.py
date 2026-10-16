"""Test helper: write judged picks the way a judge does, echoing each candidate's qid.

Built with the help of Claude Code.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from pipeline.judged import qid, text_of  # noqa: E402


def fill(picks, cands, key="index"):
    """Echo the matching ``qid`` into every in-range pick (a dict or a list of them), in
    place; an out-of-range pick is left without one. Returns ``picks``."""
    for p in picks if isinstance(picks, list) else [picks]:
        i = p.get(key)
        if isinstance(i, int) and not isinstance(i, bool) and 0 <= i < len(cands):
            p.setdefault("qid", qid(text_of(cands[i])))
    return picks


def refs(cands, *indices):
    """The ``[{index, qid}]`` picks naming ``cands[i]`` for each index."""
    return fill([{"index": i} for i in indices], cands)


def lift(tree, cands):
    """``tree`` with every list of bare int indices turned into :func:`refs` (the shape a
    judged file of bare picks takes), walking nested dicts and lists."""
    if isinstance(tree, list) and tree and all(isinstance(i, int) for i in tree):
        return refs(cands, *tree)
    if isinstance(tree, list):
        return [lift(v, cands) for v in tree]
    if isinstance(tree, dict):
        return {k: lift(v, cands) for k, v in tree.items()}
    return tree


def lift_owners(judged, owners):
    """:func:`lift` per owner: ``judged[oid]`` against ``owners[oid]["candidates"]``."""
    return {oid: lift(v, (owners.get(oid) or {}).get("candidates", []))
            for oid, v in judged.items()}


def fill_tree(tree, cands, key="index"):
    """A copy of ``tree`` where every dict carrying an int ``key`` (at any depth) echoes
    its candidate's qid, the way a judge answers a record of nested picks."""
    if isinstance(tree, list):
        return [fill_tree(v, cands, key) for v in tree]
    if isinstance(tree, dict):
        out = {k: fill_tree(v, cands, key) for k, v in tree.items()}
        return fill(out, cands, key) if key in out else out
    return tree
