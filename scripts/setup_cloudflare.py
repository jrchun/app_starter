"""새 프로젝트의 Cloudflare 준비를 한 번에 한다.

  1) 프로젝트 이름을 wrangler.toml(Worker 이름, D1 이름)에 넣는다
  2) 같은 이름의 D1 데이터베이스가 없으면 만든다(아시아·태평양 지역)
  3) db/schema.sql을 D1에 적용한다(여러 번 실행해도 안전)
  4) D1 ID와 계정 ID를 wrangler.toml과 .github/workflows/*.yml에 채운다

사용법: CLOUDFLARE_API_TOKEN=... python3 scripts/setup_cloudflare.py --name my-app
        (--dry-run: 무엇을 할지 보여 주기만 한다)
필요한 토큰 권한: Account › D1 › Edit
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from jobs import cloudflare  # noqa: E402

WRANGLER = ROOT / "wrangler.toml"
WORKFLOWS = ROOT / ".github" / "workflows"
NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")


def read_toml_value(text: str, key: str) -> str | None:
    m = re.search(rf'^{key}\s*=\s*"([^"]*)"', text, re.M)
    return m.group(1) if m else None


def set_toml_value(text: str, key: str, value: str) -> str:
    return re.sub(rf'^({key}\s*=\s*)"[^"]*"', lambda m: f'{m.group(1)}"{value}"', text, count=1, flags=re.M)


def pick_account(explicit: str | None) -> str:
    if explicit:
        return explicit
    accounts = cloudflare.call("GET", "/accounts")["result"]
    if len(accounts) != 1:
        names = ", ".join(f"{a['name']}({a['id']})" for a in accounts) or "없음"
        raise SystemExit(f"계정이 하나가 아닙니다: {names}. --account로 골라 주세요.")
    print(f"계정: {accounts[0]['name']}")
    return accounts[0]["id"]


def find_or_create_db(account: str, name: str, dry: bool) -> str | None:
    q = urllib.parse.urlencode({"name": name})
    found = [d for d in cloudflare.call("GET", f"/accounts/{account}/d1/database?{q}")["result"] if d["name"] == name]
    if found:
        print(f"D1 '{name}' 이미 있음: {found[0]['uuid']}")
        return found[0]["uuid"]
    if dry:
        print(f"[dry-run] D1 '{name}'을 만들 것입니다")
        return None
    r = cloudflare.call("POST", f"/accounts/{account}/d1/database", {"name": name, "primary_location_hint": "apac"})
    print(f"D1 '{name}' 만듦: {r['result']['uuid']}")
    return r["result"]["uuid"]


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", help="프로젝트 이름(영문 소문자·숫자·하이픈). Worker 이름과 D1 이름이 된다")
    ap.add_argument("--account", help="Cloudflare 계정 ID(계정이 하나면 생략)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)

    text = WRANGLER.read_text(encoding="utf-8")
    name = args.name or read_toml_value(text, "name")
    if not name or name == "my-app" and not args.name:
        raise SystemExit("--name으로 프로젝트 이름을 정해 주세요(예: --name budget-board).")
    if not NAME_RE.match(name):
        raise SystemExit("이름은 영문 소문자, 숫자, 하이픈만 쓸 수 있습니다.")

    account = pick_account(args.account)
    db_id = find_or_create_db(account, name, args.dry_run)
    if args.dry_run:
        print("[dry-run] 스키마 적용과 파일 수정은 하지 않았습니다.")
        return 0

    schema = (ROOT / "db" / "schema.sql").read_text(encoding="utf-8")
    res = cloudflare.call("POST", f"/accounts/{account}/d1/database/{db_id}/query", {"sql": schema})["result"]
    print(f"스키마 적용: 문장 {len(res)}개")

    for key, value in (("name", name), ("database_name", name), ("database_id", db_id)):
        text = set_toml_value(text, key, value)
    WRANGLER.write_text(text, encoding="utf-8")
    for wf in WORKFLOWS.glob("*.yml"):
        s = wf.read_text(encoding="utf-8")
        s2 = re.sub(r"(CF_ACCOUNT_ID:\s*)\S+", rf"\g<1>{account}", s)
        s2 = re.sub(r"(CF_D1_DATABASE_ID:\s*)\S+", rf"\g<1>{db_id}", s2)
        if s2 != s:
            wf.write_text(s2, encoding="utf-8")
    print("wrangler.toml과 워크플로에 ID를 채웠습니다.")
    print(json.dumps({"worker": name, "d1": name, "database_id": db_id, "account_id": account}, ensure_ascii=False))
    print("\n다음: 변경을 커밋·푸시한 뒤 docs/SETUP.md 4단계(Worker 연결)부터 진행하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
