"""매일 작업이 읽고 쓰는 저장소.

- D1Store: 운영. D1 REST API(POST /accounts/{account_id}/d1/database/{database_id}/query).
  환경 변수 CF_ACCOUNT_ID, CF_D1_DATABASE_ID, CLOUDFLARE_API_TOKEN을 쓴다.
- SqliteStore: 테스트·로컬 시험용. 같은 스키마(db/schema.sql).
두 저장소 모두 query(sql, params) → 행 목록, execute_many([(sql, params), ...])를 제공한다.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from . import cloudflare

ROOT = Path(__file__).resolve().parent.parent
SCHEMA = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")


class SqliteStore:
    def __init__(self, path):
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)

    def query(self, sql, params=()):
        return [dict(r) for r in self.conn.execute(sql, params)]

    def execute_many(self, statements):
        with self.conn:
            for sql, params in statements:
                self.conn.execute(sql, params)

    def close(self):
        self.conn.close()


class D1Store:
    def __init__(self, account_id: str, database_id: str):
        self.path = f"/accounts/{account_id}/d1/database/{database_id}/query"

    @classmethod
    def from_env(cls) -> "D1Store":
        missing = [k for k in ("CF_ACCOUNT_ID", "CF_D1_DATABASE_ID") if not os.environ.get(k)]
        if missing:
            raise SystemExit("환경 변수가 없습니다: " + ", ".join(missing))
        cloudflare.token()
        return cls(os.environ["CF_ACCOUNT_ID"], os.environ["CF_D1_DATABASE_ID"])

    @staticmethod
    def _stmt(sql, params=()):
        # REST API의 params는 문자열 목록이다. 숫자 열은 SQLite 자료형 규칙에 따라 숫자로 저장된다.
        return {"sql": sql, "params": [str(p) for p in params]}

    def query(self, sql, params=()):
        return cloudflare.call("POST", self.path, self._stmt(sql, params))["result"][0]["results"]

    def execute_many(self, statements):
        if statements:
            cloudflare.call("POST", self.path, {"batch": [self._stmt(s, p) for s, p in statements]})

    def close(self):
        pass
