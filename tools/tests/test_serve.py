"""Tests for ``tools/serve.py``'s ``/derived/`` route: effects.json is built once per
data change, renamed into place, and nothing else under ``/derived/`` is served.

Built with the help of Claude Code.
"""
import json
import os
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import render_api  # noqa: E402
import serve  # noqa: E402

DATA = Path(__file__).resolve().parents[2] / "public" / "data"


class DerivedRouteTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        root = Path(tmp.name) / "site"
        (root / "data").mkdir(parents=True)
        for p in DATA.iterdir():
            if p.is_file():
                shutil.copy2(p, root / "data" / p.name)
        self.data = root / "data"
        derived = Path(tmp.name) / "derived"
        derived.mkdir()
        self.builds = 0
        real = render_api.write_effects

        def counting(data_dir, path):
            self.builds += 1
            return real(data_dir, path)
        render_api.write_effects = counting
        self.addCleanup(setattr, render_api, "write_effects", real)
        serve.NoCacheHandler.derived_dir = derived
        serve.NoCacheHandler._built_from = None
        self.addCleanup(setattr, serve.NoCacheHandler, "derived_dir", None)
        self.server = ThreadingHTTPServer(
            ("127.0.0.1", 0), partial(serve.NoCacheHandler, directory=str(root)))
        serve.NoCacheHandler.log_message = lambda *a, **k: None
        self.addCleanup(delattr, serve.NoCacheHandler, "log_message")
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

    def get(self, path):
        url = f"http://127.0.0.1:{self.server.server_address[1]}{path}"
        try:
            with urllib.request.urlopen(url) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, b""

    def test_effects_built_once_until_the_data_changes(self):
        status, body = self.get("/derived/effects.json")
        self.assertEqual(status, 200)
        json.loads(body)
        self.get("/derived/effects.json?x=1")
        self.assertEqual(self.builds, 1)
        drugs = self.data / "drugs.jsonl"
        st = drugs.stat()
        os.utime(drugs, ns=(st.st_atime_ns, st.st_mtime_ns + 10**9))
        self.assertEqual(self.get("/derived/effects.json")[0], 200)
        self.assertEqual(self.builds, 2)

    def test_nothing_else_under_derived_is_served(self):
        self.get("/derived/effects.json")
        (serve.NoCacheHandler.derived_dir / "secret.txt").write_text("x", encoding="utf-8")
        for path in ("/derived/", "/derived/secret.txt", "/derived/effects.json.tmp",
                     "/derived/../data/meta.json"):
            with self.subTest(path):
                self.assertEqual(self.get(path)[0], 404)

    def test_the_writer_renames_a_finished_file_into_place(self):
        out = serve.NoCacheHandler.derived_dir / "effects.json"
        render_api.write_effects(self.data, out)
        self.assertTrue(out.exists())
        self.assertFalse(out.with_name("effects.json.tmp").exists())


if __name__ == "__main__":
    unittest.main()
