"""The viewer's source as one text, for the structural lints that read it.

The viewer is split across `public/js/**/*.js` (main.js is wiring, the panel, legends,
scene and search live in their own modules), so a lint that asserts "this call / this
landmark exists" reads every module rather than pinning one file a refactor can move it
out of. Files are joined in a stable order, each separated by a newline, so a landmark
pair (`section(opening, closing)`) still resolves within the file that holds it.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JS_DIR = ROOT / "public" / "js"


def viewer_js() -> str:
    """Every viewer module's source, concatenated (sorted path order)."""
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted(JS_DIR.rglob("*.js")))
