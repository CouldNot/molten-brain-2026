#!/usr/bin/env python
"""Apply judged elimination half-lives to the drugs Stahl gives none, quote-gated.

Second half of the pass ``tools/fetch/fetch_half_life.py`` starts. The LLM answered,
per drug, a candidate **index** plus the hours that line states into
``tools/generated_cache/half_life_judged.json``; this writes ``half_life`` +
a ``verified`` ``half_life_sources`` quote node through the very six gates
``apply_tmax.py`` documents (offered, index, duration re-parsed from the quote, ceiling,
verbatim on its page), only the ceiling differs: ``MAX_HALF_LIFE_HOURS``.

The applier writes no ``llm`` stamp, so run ``tools/sourcing/recheck_quotes.py``
afterwards or ``check_data.py`` family 5 flags the citations as extracted-but-unjudged.

Usage (from the repo root)::

    python tools/sourcing/apply_half_life.py --dry-run
    python tools/sourcing/apply_half_life.py

Built with the help of Claude Code.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools" / "sourcing"))

import apply_tmax                                                # noqa: E402
import fetch_half_life                                           # noqa: E402 (path set by apply_tmax)

JUDGED_PATH = ROOT / "tools" / "generated_cache" / "half_life_judged.json"

# A T½ past ~100 days is no drug's plasma elimination but a misread (a tissue store,
# a radiolabel, a misparsed unit). Generous on purpose: rubidium sits near 50 days.
MAX_HALF_LIFE_HOURS = 2400.0


def main() -> int:
    return apply_tmax.run(__doc__, JUDGED_PATH, fetch_half_life.build, "half_life",
                          MAX_HALF_LIFE_HOURS, "is not a plausible elimination half-life")


if __name__ == "__main__":
    raise SystemExit(main())
