"""매일 작업·저장소·Cloudflare 호출 테스트(네트워크 없이). 실행: python3 -m unittest discover -s tests"""
import io
import json
import os
import tempfile
import unittest
import urllib.error
from unittest import mock

from jobs import cloudflare, daily
from jobs.store import D1Store, SqliteStore


class Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): pass


def ok_body(results=()):
    return Resp(json.dumps({"success": True, "result": [{"results": list(results), "success": True}]}).encode())


class JobTests(unittest.TestCase):
    def test_daily_writes_job_log(self):
        with tempfile.TemporaryDirectory() as d:
            st = SqliteStore(os.path.join(d, "t.db"))
            self.assertEqual(daily.run(st), "사용 기록 0건")
            self.assertEqual(st.query("SELECT job, note FROM job_log"), [{"job": "daily", "note": "사용 기록 0건"}])
            st.close()

    def test_daily_skips_without_token(self):
        with mock.patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": ""}):
            self.assertEqual(daily.main([]), 0)


@mock.patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": "tok"})
class CloudflareTests(unittest.TestCase):
    def test_d1_request_shape(self):
        sent = []

        def fake(req, timeout):
            sent.append((req.full_url, req.get_header("Authorization"), json.loads(req.data)))
            return ok_body([{"n": 1}])

        with mock.patch("urllib.request.urlopen", fake):
            st = D1Store("acc", "db")
            self.assertEqual(st.query("SELECT ? AS n", (1,)), [{"n": 1}])
            st.execute_many([("INSERT INTO job_log VALUES (?, ?, ?)", ("t", "j", 2.5))])
        self.assertEqual(sent[0][0], "https://api.cloudflare.com/client/v4/accounts/acc/d1/database/db/query")
        self.assertEqual(sent[0][1], "Bearer tok")
        self.assertEqual(sent[0][2], {"sql": "SELECT ? AS n", "params": ["1"]})
        self.assertEqual(sent[1][2]["batch"][0]["params"], ["t", "j", "2.5"])

    def test_retries_on_rate_limit(self):
        calls, waits = [], []

        def flaky(req, timeout):
            calls.append(1)
            if len(calls) < 3:
                raise urllib.error.HTTPError(req.full_url, 429, "Too Many", {"Retry-After": "1"}, io.BytesIO(b"{}"))
            return ok_body()

        with mock.patch("urllib.request.urlopen", flaky):
            cloudflare.call("POST", "/x", {}, sleep=waits.append)
        self.assertEqual(len(calls), 3)
        self.assertEqual(waits, [5, 15])

    def test_permission_error_is_reported(self):
        def denied(req, timeout):
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"errors":[{"message":"Authentication error"}]}'))

        with mock.patch("urllib.request.urlopen", denied):
            with self.assertRaisesRegex(RuntimeError, "403.*Authentication error"):
                cloudflare.call("GET", "/accounts")


if __name__ == "__main__":
    unittest.main()
