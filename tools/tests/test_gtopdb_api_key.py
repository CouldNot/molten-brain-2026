#!/usr/bin/env python
"""The GtoPdb API key rides the request header and never reaches a stored file.

GtoPdb's web services answer 401 without a per-user key, so ``fetch_gtopdb.py``
(corpus #7) and ``fetch_gtopdb_class.py`` (corpus #12) send one. The key is a
secret: these tests run both fetchers against a stubbed network with a sentinel
key and assert it is sent as the ``GTP-API-Key`` header and appears in no raw
cache, page (with its ``fetched:`` header stamp), worklist or proposal file.

Built with the help of Claude Code.
"""

import io
import json
import os
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fetch"))

import fetch_gtopdb  # noqa: E402
import fetch_gtopdb_class  # noqa: E402

SENTINEL = "SENTINEL-KEY-0123456789abcdef"


class _Resp(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def _fake_urlopen(sent_headers):
    def urlopen(req, timeout=30):
        sent_headers.append(dict(req.header_items()))
        url = req.full_url
        if "geneSymbol" in url:
            body = [{"targetId": 6, "name": "5-HT<sub>2A</sub> receptor", "type": "GPCR",
                     "familyNames": ["5-HT receptors"]}]
        elif url.endswith("/tissueDistribution"):
            body = [{"tissue": "cerebral cortex", "species": "Human", "technique": "ISH",
                     "refs": [{"pmid": 1}]}]
        else:
            body = [{"transducers": "Gq/G11 family", "effectors": "PLC"}]
        return _Resp(json.dumps(body).encode())
    return urlopen


class ApiKeyTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        self.sent = []
        patches = [
            mock.patch.dict(os.environ, {fetch_gtopdb.API_KEY_ENV: SENTINEL}),
            mock.patch("urllib.request.urlopen", _fake_urlopen(self.sent)),
            mock.patch.object(fetch_gtopdb, "DELAY_S", 0),
            mock.patch.object(fetch_gtopdb, "REPO", self.tmp),
            mock.patch.object(fetch_gtopdb_class, "REPO", self.tmp),
            mock.patch.object(fetch_gtopdb, "RAW", self.tmp / "raw"),
            mock.patch.object(fetch_gtopdb, "PAGES", self.tmp / "pages"),
            mock.patch.object(fetch_gtopdb, "WORKLIST", self.tmp / "worklist.json"),
            mock.patch.object(fetch_gtopdb_class, "RAW", self.tmp / "raw_class"),
            mock.patch.object(fetch_gtopdb_class, "PAGES", self.tmp / "pages_class"),
            mock.patch.object(fetch_gtopdb_class, "CACHE", self.tmp / "gtopdb_class.json"),
        ]
        for p in patches:
            p.start()
            self.addCleanup(p.stop)

    def _stored_text(self):
        return "".join(f.read_text(encoding="utf-8") for f in self.tmp.rglob("*") if f.is_file())

    def test_tissue_fetch_sends_key_and_never_stores_it(self):
        with mock.patch.object(sys, "argv", ["x", "--only", "5ht2a", "--refresh"]), \
                redirect_stdout(io.StringIO()):
            fetch_gtopdb.main()
        page = (self.tmp / "pages" / "6.md").read_text(encoding="utf-8")
        self.assertTrue(page.startswith("fetched: "))
        self.assertNotIn(SENTINEL, page)
        self.assertNotIn(SENTINEL, self._stored_text())
        self.assertTrue(self.sent)
        self.assertTrue(all(h.get("Gtp-api-key") == SENTINEL for h in self.sent))

    def test_class_fetch_never_stores_key(self):
        with mock.patch.object(sys, "argv", ["x", "--only", "5ht2a", "--refresh"]), \
                redirect_stdout(io.StringIO()):
            fetch_gtopdb_class.main()
        page = (self.tmp / "pages_class" / "6.md").read_text(encoding="utf-8")
        self.assertTrue(page.startswith("fetched: "))
        self.assertNotIn(SENTINEL, self._stored_text())
        self.assertTrue(all(h.get("Gtp-api-key") == SENTINEL for h in self.sent))

    def test_missing_key_names_both_locations(self):
        with mock.patch.dict(os.environ, {fetch_gtopdb.API_KEY_ENV: ""}), \
                mock.patch.object(fetch_gtopdb, "API_KEY_FILE", self.tmp / "absent" / "api_key.txt"), \
                self.assertRaises(SystemExit) as ctx:
            fetch_gtopdb.api_key()
        msg = str(ctx.exception.code)
        self.assertIn("GTOPDB_API_KEY", msg)
        self.assertIn("api_key.txt", msg)
        self.assertNotIn(SENTINEL, msg)

    def test_key_file_is_whitespace_stripped(self):
        keyfile = self.tmp / "api_key.txt"
        keyfile.write_text(f"  {SENTINEL}\n", encoding="utf-8")
        with mock.patch.dict(os.environ, {fetch_gtopdb.API_KEY_ENV: ""}), \
                mock.patch.object(fetch_gtopdb, "API_KEY_FILE", keyfile):
            self.assertEqual(fetch_gtopdb.api_key(), SENTINEL)


if __name__ == "__main__":
    unittest.main()
