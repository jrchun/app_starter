"""매일 작업 예제. GitHub Actions(.github/workflows/daily.yml)가 하루 한 번 실행한다.

실행: python3 -m jobs.daily                (운영: D1에 기록, CF_* 환경 변수 필요)
      python3 -m jobs.daily --sqlite x.db  (시험: 로컬 SQLite 파일)
새 프로젝트에서는 run()의 내용을 바꾼다(예: 시세 받기, 알림 만들기).
GitHub에 비밀 CLOUDFLARE_API_TOKEN을 아직 넣지 않았으면 실패하지 않고 건너뛴다.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

from .store import D1Store, SqliteStore


def run(store) -> str:
    rows = store.query("SELECT COUNT(*) AS n FROM usage_log")
    note = f"사용 기록 {rows[0]['n']}건"
    store.execute_many([(
        "INSERT INTO job_log (ts, job, note) VALUES (?, ?, ?)",
        (datetime.now(timezone.utc).isoformat(timespec="seconds"), "daily", note),
    )])
    return note


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sqlite", help="D1 대신 이 SQLite 파일에 기록(시험용)")
    args = ap.parse_args(argv)
    if not args.sqlite and not os.environ.get("CLOUDFLARE_API_TOKEN"):
        print("CLOUDFLARE_API_TOKEN이 없어 건너뜁니다. GitHub › Settings › Secrets and variables › Actions에 넣으세요.")
        return 0
    store = SqliteStore(args.sqlite) if args.sqlite else D1Store.from_env()
    try:
        print("완료:", run(store))
    finally:
        store.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
