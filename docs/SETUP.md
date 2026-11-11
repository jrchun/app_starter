# 새 프로젝트 배포 절차

쉬운 설명은 [README](../README.md). AI가 처음부터 끝까지 진행할 때는 [AGENT_SETUP.md](AGENT_SETUP.md). 이 문서는 D1 모드를 토큰으로 설정하는 자세한 순서와 함정 모음이다.

이 틀로 만든 앱은 아래 구성으로 돈다. 처음 한 번만 설정하면 이후에는 `main`에 올릴 때마다 자동 배포된다.

```
아이폰·PC ──▶ Cloudflare Worker  ├─ web/ (정적 화면)
                                 └─ src/worker.js (/api/*) ──▶ D1 (SQLite)
GitHub Actions (매일) ── jobs/daily.py ──▶ D1 REST API
```

## 순서

| # | 할 일 | 어디서 | 누가 |
|---|---|---|---|
| 1 | GitHub에서 `app_starter` 페이지 › 초록색 **Use this template** › Create a new repository. 기본 브랜치는 `main` | GitHub | 사람 |
| 2 | Cloudflare API 토큰 만들기: Account API tokens › 만들기 › 권한 **D1 › Edit**, 범위 Entire Account. (배포 상태를 Claude가 보게 하려면 **Workers Scripts › Read**도) | Cloudflare | 사람 |
| 3 | `python3 scripts/setup_cloudflare.py --name <프로젝트이름>` → D1 생성, 스키마 적용, ID 채우기. 커밋·푸시 | 터미널 | Claude |
| 4 | Workers 및 Pages › 만들기 › **Workers** › Git 연결 › 이 저장소, 브랜치 `main`, 빌드 명령 없음, 배포 명령 `npx wrangler deploy`. **Worker 이름 = 3의 이름** | Cloudflare | 사람 |
| 5 | Worker › 설정 › 변수 및 비밀 › 추가 › 형식 **Secret**, 이름 `WRITE_TOKEN`, 값 = 편집 암호 | Cloudflare | 사람 |
| 6 | GitHub › Settings › Secrets and variables › Actions › **Secrets 탭 › New repository secret** › `CLOUDFLARE_API_TOKEN` = 2의 토큰 | GitHub | 사람 |
| 7 | `node scripts/check_site.mjs https://<이름>.<계정>.workers.dev` 전부 ok, Actions › daily › Run workflow 성공 | 터미널·GitHub | Claude |
| 8 | 폰에서 열어 아무 값이나 고치고, 편집 암호 넣고 "저장됨" 확인 | 폰 | 사람 |

## 함정 (실제로 겪은 것)

- **Pages가 아니라 Workers로 만든다.** 대시보드 기본 흐름이 Workers다. 이 틀의 `wrangler.toml`은 Workers 형식이라 Pages로 만들면 배포가 실패한다.
- **토큰 값은 만들 때 한 번만 보인다.** 놓쳤으면 토큰 목록 › `…` › **Roll**로 재발급(권한 유지, 예전 값은 바로 무효).
- **GitHub 비밀은 Secrets 탭에.** Variables 탭이나 Environment secrets, Codespaces/Dependabot 비밀에 넣으면 작업에서 빈 값이 된다(로그에 `CLOUDFLARE_API_TOKEN:` 뒤가 비어 보인다).
- **예약 실행은 기본 브랜치 기준.** 기본 브랜치가 `main`이 아니면 매일 작업이 돌지 않는다. 60일간 저장소 활동이 없으면 GitHub가 예약 실행을 멈춘다.
- **Cloudflare API 속도 제한(429).** 연속 호출하면 걸린다. `jobs/cloudflare.py`가 기다렸다 다시 시도한다.
- **편집 암호가 없으면 저장이 전부 막힌다.** `check_site.mjs`가 "편집 암호(WRITE_TOKEN)가 아직 없음" 경고로 알려 준다.
- **Worker 이름과 `wrangler.toml`의 `name`이 달라도** 문제가 생길 수 있다. 같은 이름을 쓴다.
- **공개 저장소에 비밀을 올리지 않는다.** 계정 ID와 D1 ID는 비밀이 아니다. 토큰과 편집 암호만 비밀이다.
- **Claude Code 클라우드 세션에서 작업할 때**: Cloudflare API, 사이트 주소는 환경의 허용 목록에 있어야 접속된다. 토큰은 채팅에 붙이지 말고 Claude가 띄우는 입력 카드에 넣는다.
- **Supabase 무료 플랜은 계정당 프로젝트 2개.** 조직이 달라도 합쳐서 센다. 일시 정지한 프로젝트는 세지 않지만, 정지하면 그 서비스가 멈추고 90일이 지나면 복구가 어려울 수 있다.
- **Supabase "Confirm email"은 꺼 둔다.** 켜져 있으면 가입해도 확인 메일 없이는 로그인할 수 없다. 기본 메일 발송은 제한이 크다.
- **Supabase 화면에는 publishable(또는 legacy anon) 키만 넣는다.** secret, service_role 키가 화면에 들어가면 RLS를 무시하고 모든 데이터를 읽고 쓸 수 있다. `check_site.mjs`가 이를 잡아낸다.
- **표를 만들면 RLS를 켠다.** 화면이 공개 키로 직접 연결하므로, RLS가 없는 표는 누구나 읽고 쓴다. Supabase MCP의 `get_advisors`(security)로 확인한다.
- **claude.ai의 "Cloudflare Developer Platform" 커넥터는 지원 종료 예정이다.** D1과 Worker 조회만 되고 배포는 안 된다. 배포는 `wrangler`로 한다.
- **`workers.dev`는 브라우저 검사를 한다.** 기본 Python `urllib` 요청은 1010 오류로 막힌다. 스크립트에서 사이트를 부를 때는 앱 이름이 담긴 User-Agent를 붙인다.
