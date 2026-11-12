# 새 프로젝트 배포 절차

쉬운 설명은 [README](../README.md). AI가 처음부터 끝까지 진행할 때는 [AGENT_SETUP.md](AGENT_SETUP.md). 이 문서는 사람이 할 일과 함정 모음이다.
**API 토큰은 쓰지 않는다.** 모든 서비스는 브라우저 로그인(MCP·OAuth)으로 연결한다.

이 틀로 만든 앱은 아래 구성으로 돈다. 처음 한 번만 설정하면 이후에는 `main`에 올릴 때마다 자동 배포된다.

```
아이폰·PC ──▶ Cloudflare Worker  ├─ web/ (정적 화면)
                                 ├─ src/worker.js (/api/*) ──▶ D1 (SQLite)
                                 └─ src/jobs.js (매일, Cron Trigger) ──▶ D1 또는 Supabase
내 GitHub 저장소 main ──(Workers Builds)──▶ Cloudflare가 npx wrangler deploy
```

## 순서

| # | 할 일 | 어디서 | 누가 |
|---|---|---|---|
| 1 | `https://github.com/new?template_name=app_starter&template_owner=jrchun` › Repository name = 앱 이름 › Create. 기본 브랜치는 `main` | GitHub | 사람 |
| 2 | Claude Code·Codex에 Cloudflare MCP 연결(브라우저 로그인, **Workers CI 쓰기**까지 허용). claude.ai는 설정 › 커넥터 › 사용자 지정 커넥터 › `https://mcp.cloudflare.com/mcp` | 클라이언트 | 사람(처음 한 번) |
| 3 | `cf_mcp.mjs prepare` → MCP 실행(D1·사이트 주소) → 클라우드 세션은 사이트 주소 허용 승인 창 → 앱 만들기 → `fill` → 커밋 | Claude | Claude(승인은 사람) |
| 4 | PR → `npm test` 통과 → Claude가 Merge(내 컴퓨터면 `main`에 바로) | GitHub | Claude |
| 5 | `cf_mcp.mjs connect` → MCP 실행: Cloudflare에 저장소 연결·첫 빌드. 실패하면 사람이 Workers 및 Pages › **만들기** › **GitHub** › 저장소 › 배포(처음이면 GitHub에서 Cloudflare 앱 설치, "모든 저장소" 허용 권장) | Cloudflare | Claude(안 되면 사람) |
| 6 | `node scripts/check_site.mjs https://<이름>.<계정>.workers.dev` 전부 ok, `cf_mcp.mjs status`로 빌드·예약 작업 확인 | 터미널·MCP | Claude |
| 7 | 폰에서 열어 아무 값이나 고치고 **편집 암호 정하기**(처음 한 번, 6자 이상) → "저장됨" | 폰 | 사람 |

## 함정 (실제로 겪은 것)

- **Pages가 아니라 Workers로 만든다.** 대시보드 기본 흐름이 Workers다. 이 틀의 `wrangler.toml`은 Workers 형식이라 Pages로 만들면 배포가 실패한다.
- **`workers.dev` 하위 도메인은 계정당 하나이고 전 세계에서 겹치면 안 된다.** 처음 쓰는 계정이면 `cf_mcp.mjs prepare`가 GitHub 아이디로 만들어 준다. 한 번 정하면 바꾸지 않는다(모든 앱 주소가 바뀐다).
- **Git 연결은 Worker 이름 = `wrangler.toml`의 `name`이어야 한다.** 다르면 빌드가 실패한다.
- **자동 배포는 `main` 기준.** 클라우드 세션의 작업 브랜치에 올린 것은 배포되지 않는다. `main`에 합쳐야 한다.
- **MCP 첫 배포는 실제 앱에서는 보통 못 쓴다.** 코드가 100KB를 넘으면(큰 데이터 파일, Supabase 라이브러리) MCP로 넘길 수 없다. 기본 경로는 Merge → Cloudflare에서 GitHub 가져오기다.
- **Git 연결 뒤에는 MCP `deploy`를 쓰지 않는다.** 다음 `main` 푸시 때 Git 배포가 다시 덮어쓰지만, 그 사이 저장소와 사이트가 달라진다.
- **MCP로는 정적 자산 업로드를 못 한다.** MCP가 요청마다 로그인 정보를 붙여 업로드 전용 임시 토큰이 무시된다(401). `cf_mcp.mjs deploy`는 `web/`을 Worker 안에 묶어 올린다. Git 배포가 한 번 돌면 원래 구성으로 바뀐다.
- **무료 플랜은 계정 전체에서 Cron Trigger 5개까지.** 매일 작업이 필요 없는 D1 앱은 `wrangler.toml`에서 `crons = []`로 끈다. Supabase 앱은 끄지 않는다(7일간 요청이 없으면 프로젝트가 멈춘다).
- **예약 작업의 시각은 UTC.** `30 22 * * *`는 한국 시각 07:30이다. 결과와 오류는 대시보드 › Worker › 로그에서 본다.
- **편집 암호는 먼저 정한 사람이 임자다.** 사이트에서 처음 저장할 때 정하므로, 주소를 공유하기 전에 본인이 먼저 정한다. 아직이면 `check_site.mjs`가 "편집 암호가 아직 없음"으로 알려 준다. 잊으면 D1 `settings`의 `write_hash` 행을 지우면 다시 정할 수 있다.
- **예전 앱에 이 기능을 넣을 때는 스키마를 다시 적용한다.** `settings` 표가 없으면 사이트에서 암호를 정할 수 없다(`cf_mcp.mjs prepare`를 다시 실행).
- **Worker 이름과 `wrangler.toml`의 `name`이 달라도** 문제가 생길 수 있다. 같은 이름을 쓴다.
- **공개 저장소에 비밀을 올리지 않는다.** 계정 ID, D1 ID, Supabase publishable 키는 비밀이 아니다. 편집 암호만 비밀이다.
- **Claude Code 클라우드 세션에서 작업할 때**: 컨테이너는 api.cloudflare.com과 `*.workers.dev`에 나갈 수 없다. Cloudflare 작업은 MCP로 하고, 사이트 검사를 위해 이 저장소 전용 환경에 사이트 주소를 허용한다(AGENT_SETUP 8). 저장소 `.mcp.json`의 Supabase 연결은 실패할 수 있으니 claude.ai의 Supabase 커넥터를 쓴다.
- **Supabase 무료 플랜은 계정당 프로젝트 2개.** 조직이 달라도 합쳐서 센다. 일시 정지한 프로젝트는 세지 않지만, 정지하면 그 서비스가 멈추고 90일이 지나면 복구가 어려울 수 있다.
- **Supabase "Confirm email"은 꺼 둔다.** 켜져 있으면 가입해도 확인 메일 없이는 로그인할 수 없다. 기본 메일 발송은 제한이 크다.
- **Supabase 화면에는 publishable(또는 legacy anon) 키만 넣는다.** secret, service_role 키가 화면에 들어가면 RLS를 무시하고 모든 데이터를 읽고 쓸 수 있다. `check_site.mjs`가 이를 잡아낸다.
- **표를 만들면 RLS를 켠다.** 화면이 공개 키로 직접 연결하므로, RLS가 없는 표는 누구나 읽고 쓴다. Supabase MCP의 `get_advisors`(security)로 확인한다.
- **claude.ai의 "Cloudflare Developer Platform" 커넥터는 지원 종료 예정이다.** D1과 Worker 조회만 되고 배포는 안 된다. 사용자 지정 커넥터로 `https://mcp.cloudflare.com/mcp`를 붙인다.
- **`workers.dev`는 브라우저 검사를 한다.** 기본 Python `urllib` 요청은 1010 오류로 막힌다. 스크립트에서 사이트를 부를 때는 앱 이름이 담긴 User-Agent를 붙인다.
