"""Cloudflare API 호출(표준 라이브러리만 사용). 설정 스크립트와 매일 작업이 함께 쓴다.

토큰은 환경 변수 CLOUDFLARE_API_TOKEN에서 읽는다. 필요한 권한: Account › D1 › Edit
(배포 상태까지 보려면 Workers Scripts › Read 추가).
속도 제한(429)이나 일시 오류(5xx)면 기다렸다 다시 시도한다.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

BASE = "https://api.cloudflare.com/client/v4"
RETRY_WAITS = (5, 15, 30, 60)


def token() -> str:
    t = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    if not t:
        raise SystemExit(
            "CLOUDFLARE_API_TOKEN이 없습니다. Cloudflare 대시보드 › Account API tokens에서 "
            "D1 Edit 권한 토큰을 만들어 환경 변수로 넣어 주세요. (docs/SETUP.md 2단계)"
        )
    return t


def call(method: str, path: str, body: dict | None = None, sleep=time.sleep) -> dict:
    """{'success': True, 'result': ...} 형태의 응답 전체를 돌려준다. 실패하면 RuntimeError."""
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(len(RETRY_WAITS) + 1):
        req = urllib.request.Request(
            BASE + path, data=data, method=method,
            headers={"Authorization": "Bearer " + token(), "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                out = json.loads(r.read().decode())
            break
        except urllib.error.HTTPError as e:
            if (e.code == 429 or e.code >= 500) and attempt < len(RETRY_WAITS):
                wait = RETRY_WAITS[attempt]
                try:
                    wait = max(wait, int(e.headers.get("Retry-After") or 0))
                except (ValueError, AttributeError):
                    pass
                sleep(wait)
                continue
            try:
                detail = json.loads(e.read().decode()).get("errors")
            except Exception:
                detail = str(e)
            raise RuntimeError(f"Cloudflare API {method} {path} 실패 ({e.code}): {detail}") from None
    if not out.get("success", False):
        raise RuntimeError(f"Cloudflare API {method} {path} 실패: {out.get('errors')}")
    return out
