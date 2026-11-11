# AI용 설치 안내서 (Claude Code · Codex 공통)

사용자가 "이 저장소(app_starter)로 앱 만들어서 배포까지 해 줘"라고 하면 이 순서를 따른다.
사용자는 개발 지식이 많지 않다. **한국어로, 쉬운 말로** 진행 상황을 알린다.
아래 "사람에게 물을 것"이 아닌 일은 묻지 말고 진행한다. 끝나면 실제 사이트를 직접 확인한 결과로 보고한다.

## 0. 원칙

- 이 문서에 적힌 명령과 도구만 쓴다. 각 명령이 무엇을 하는지 사용자에게 한 줄로 알린다.
- 토큰·비밀번호·편집 암호는 **채팅으로 받지 않는다.** 사용자가 브라우저 로그인(OAuth), 클라이언트의 비밀 입력 칸, 서비스 설정 화면에 직접 넣게 한다.
- 비밀값은 저장소에 넣지 않는다. 공개 키(Supabase publishable, 계정 ID, D1 ID)는 넣어도 된다.
- 모르는 서비스 사양은 추측하지 말고 공식 문서를 확인한다.
  - Cloudflare: `https://developers.cloudflare.com/<경로>/index.md`
  - Supabase: `https://supabase.com/docs/<경로>.md`, 관리 API 명세 `https://api.supabase.com/api/v1-json`

## 1. 연결 확인 (MCP 먼저, 없으면 명령줄)

| 서비스 | 1순위 | 2순위 |
|---|---|---|
| GitHub | 클라이언트에 기본 연결된 GitHub 도구 | `gh` (내 컴퓨터, `gh auth status`로 확인) |
| Cloudflare 배포 | 내 컴퓨터: `npx wrangler@4 login` (브라우저 로그인) | 클라우드 세션: 배포 토큰(아래)을 클라이언트의 비밀 입력 칸으로 받아 `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`로 `wrangler` 실행 |
| Cloudflare 조회·관리 | Cloudflare API MCP `https://mcp.cloudflare.com/mcp` (OAuth, Cloudflare 권장) | wrangler 명령 |
| Supabase (Supabase 모드만) | Supabase MCP `https://mcp.supabase.com/mcp` (OAuth) | 개인 액세스 토큰 `SUPABASE_ACCESS_TOKEN` + 관리 API |

- Claude Code: 저장소의 `.mcp.json`에 Cloudflare·Supabase MCP가 적혀 있다. 처음 열면 승인을 묻고, 첫 사용 때 브라우저 로그인 창이 뜬다.
- Codex: `codex mcp add supabase --url https://mcp.supabase.com/mcp` → `codex mcp login supabase` (Cloudflare도 같은 방식). 자세한 것은 `AGENTS.md`.
- 연결이 안 되면 무엇이 막혔는지 그대로 말하고, 2순위 방법을 안내한다.
- claude.ai(웹·클라우드 세션)에서 Cloudflare MCP 쓰기: 설정 › 커넥터 › **사용자 지정 커넥터 추가** › URL `https://mcp.cloudflare.com/mcp` → 로그인. 디렉터리의 "Cloudflare Developer Platform" 커넥터는 **지원 종료 예정**(D1·Worker 조회만, 배포 불가)이라 쓰지 않는다.
- **배포 토큰**(클라우드 세션용): Cloudflare › Account API tokens › 만들기 › 사용자 지정. 권한은 **Workers Scripts Edit**, **D1 Edit**, 범위는 내 계정. 값은 한 번만 보이니 바로 클라이언트의 비밀 입력 칸에 넣는다(채팅 금지). 같은 토큰을 GitHub 비밀 `CLOUDFLARE_API_TOKEN`으로도 쓸 수 있다.
- 토큰으로 wrangler를 쓸 때는 `CLOUDFLARE_ACCOUNT_ID`도 함께 준다(계정 ID는 비밀이 아니다. `wrangler.toml` 옆 워크플로나 대시보드 개요에 있다).

## 2. 사람에게 물을 것 (처음에 한 번에)

1. 만들고 싶은 앱: 무엇을 기록·계산하는지, 누가 쓰는지, 주로 폰에서 쓰는지
2. **DB 모드**. 아래 기준으로 추천하고 확인받는다.
   - **D1 모드(기본)**: 나 혼자, 또는 편집 암호를 아는 몇 명이 같은 데이터를 함께 쓴다. 로그인 없음. 읽기는 공개.
   - **Supabase 모드**: 사람마다 로그인하고 **자기 데이터만** 본다(했냐처럼). 무료 플랜은 계정당 프로젝트 **2개**까지(일시 정지한 것은 세지 않음).
3. 앱 이름: 영문 소문자·숫자·하이픈. Worker 이름, D1 이름, 사이트 주소가 된다.

## 3. 내 저장소 만들기

지금 작업 폴더가 `jrchun/app_starter` 원본이면, 사용자 계정에 새 저장소를 만든다.

- 내 컴퓨터(`gh` 사용 가능): `gh repo create <앱이름> --template jrchun/app_starter --private --clone`, 그다음 그 폴더에서 작업
- 클라우드 세션 등 저장소를 만들 수 없을 때: 사용자에게 GitHub의 **Use this template** 버튼을 안내하고(README 1번), 새 저장소로 세션을 다시 열어 달라고 한다

## 4. 앱 만들기

- `CLAUDE.md`의 구조와 규칙을 따른다(정적 화면, 빌드 없음, CSS 변수, 폰 400px·라이트·다크 확인).
- 계산·규칙은 순수 함수로 두고 `tests/`에 테스트를 붙인다. `npm test`가 통과해야 한다.
- 로컬에서 띄워 브라우저로 폰 폭 화면을 직접 확인한 뒤 사용자에게 보여 준다.

## 5. 데이터 준비

### D1 모드
- wrangler 로그인 상태: `npx wrangler@4 d1 create <앱이름> --location apac` → 출력된 `database_id`를 `wrangler.toml`과 `.github/workflows/daily.yml`에 채우고, `npx wrangler@4 d1 execute <앱이름> --remote --file db/schema.sql`
- 토큰 사용: `CLOUDFLARE_API_TOKEN=... python3 scripts/setup_cloudflare.py --name <앱이름>` (D1 생성·스키마·ID 채우기를 한 번에)

### Supabase 모드 (Supabase MCP 기준)
1. `list_organizations` → 조직이 여러 개면 사람에게 고르게 한다.
2. `list_projects`로 활성 프로젝트 수를 확인한다. 무료 한도(2개)에 걸리면 사람에게 알리고, 어떤 프로젝트를 일시 정지할지 **반드시 확인받는다.** 정지하면 그 프로젝트의 서비스가 멈춘다. 최근 사용 여부는 `query_logs`로 확인해 함께 알린다.
3. `create_project`: 이름은 앱 이름, 지역은 `ap-northeast-2`(서울). 비용이 0이 아니면 사람의 확인을 받는다.
4. `get_project`로 상태가 `ACTIVE_HEALTHY`인지 확인한다.
5. `apply_migration`으로 `supabase/schema.sql` 전체를 적용한다.
6. `get_project_url`과 `get_publishable_keys`를 부른다. `sb_publishable_...` 키를 쓰고, 없으면 legacy anon 키를 쓴다. **secret, service_role 키는 쓰지 않는다.**
7. `python3 scripts/use_supabase.py --url <URL> --key <publishable 키>`: 화면을 로그인 + 내 메모 예제로 바꾸고, D1 연결을 빼고, 잠들기 방지 작업을 넣는다.
8. 사람에게 부탁할 것: Supabase 대시보드 › Authentication › Sign In / Providers › Email › **Confirm email 끄기**. 켜져 있으면 가입한 사람이 확인 메일 없이는 로그인하지 못하고, 기본 메일 발송은 제한이 크다.
9. `get_advisors`(security)로 RLS 누락이 없는지 확인한다. 표를 추가했다면 RLS와 정책이 있어야 한다.

## 6. 배포 (Cloudflare Workers)

- **Pages가 아니라 Workers다.** `wrangler.toml`이 Workers 형식(main + [assets])이다.
- 내 컴퓨터(wrangler 로그인) 또는 토큰: `npx wrangler@4 deploy` → 출력의 `https://<앱이름>.<하위도메인>.workers.dev` 주소를 기록한다.
  - 처음 쓰는 Cloudflare 계정은 `workers.dev` 하위 도메인이 없을 수 있다. 오류가 나면 사람에게 대시보드 › Workers 및 Pages를 한 번 열어 하위 도메인을 정해 달라고 한다.
- 이후 자동 배포(선택): 사람이 대시보드 › Workers 및 Pages › 만들기 › Workers › Git 연결로 이 저장소를 연결하면, `main`에 올릴 때마다 Cloudflare가 배포한다. Worker 이름은 `wrangler.toml`의 `name`과 같아야 한다.
- **D1 모드의 편집 암호**: `npx wrangler@4 secret put WRITE_TOKEN`를 실행하고, 사람이 터미널 입력 칸에 직접 넣게 한다(AI는 값을 보지 않는다). 대시보드 › Worker › 설정 › 변수 및 비밀 › Secret으로 넣어도 된다.
- **매일 작업(D1 모드, 선택)**: GitHub 비밀 `CLOUDFLARE_API_TOKEN`이 필요하다. `gh secret set CLOUDFLARE_API_TOKEN`(사람이 값 입력) 또는 GitHub › Settings › Secrets and variables › Actions › **Secrets 탭**.

## 7. 확인하고 보고하기

1. `node scripts/check_site.mjs https://<앱이름>.<하위도메인>.workers.dev`: 모든 항목이 ok여야 한다. 프록시 뒤라면 `NODE_USE_ENV_PROXY=1`을 붙인다. 이 검사는 모드를 스스로 알아본다.
2. 브라우저로 실제 주소를 폰 폭(400px) 라이트·다크로 열어 본다.
3. 보고에 넣을 것: 사이트 주소, 사람이 폰에서 확인할 것(D1: 아무 값이나 고치고 편집 암호 입력 → "저장됨" / Supabase: 가입 → 메모 추가 → 다른 계정에서는 안 보임), 남은 선택 작업(자동 배포 연결, 매일 작업).
4. `docs/SETUP.md`의 "함정" 중 이번에 실제로 겪은 것이 있으면 사용자에게 알린다. 새로 겪은 함정이면 그 문서에 추가를 제안한다.

## 시험 기록 (2026-11-11, 이 틀을 만들며 확인한 것)

- D1 모드: 로컬 실행에서 저장·편집 암호·충돌·400px 확인. 같은 구성의 실제 배포(리밸런싱 보드)에서 `workers.dev` 동작 확인.
- Supabase 모드: Supabase MCP로 프로젝트 생성(서울) → 스키마 적용 → 키 조회 → `use_supabase.py` → 로컬 실행. 로그인, 메모 추가·삭제, 다른 계정에서는 안 보임(RLS), 새로고침 뒤 로그인 유지, `check_site.mjs` 전부 ok.
- D1 모드 클라우드 세션 배포(`starter-test`, 배포 토큰 없이 Cloudflare MCP만 사용): `whoami`·계정·Worker·D1 조회 → D1 생성(apac)·스키마 적용 → Worker 업로드 → `workers.dev` 켜기까지 MCP로 됨. `check_site.mjs` 전부 ok(편집 암호 미설정 경고만), 400px 라이트·다크 확인.
  - 함정 1: MCP 실행 환경은 api.cloudflare.com 요청에 로그인 정보를 강제로 붙여서, 정적 자산 업로드(`/workers/assets/upload`, 업로드용 JWT만 받음)가 401로 실패한다. 그래서 `web/` 파일을 텍스트 모듈로 Worker에 묶고 `env.ASSETS`를 흉내 내는 연결 파일(entry.js)로 배포했다. 저장소 코드는 그대로이고, 나중에 Git 자동 배포나 `wrangler deploy`를 하면 정상 정적 자산 구성으로 바뀐다.
  - 함정 2: 클라우드 세션의 네트워크 정책이 api.cloudflare.com과 `*.workers.dev`를 막는다(wrangler·`check_site.mjs` 모두 실패). MCP 실행 환경의 fetch도 Cloudflare API 밖으로는 403. 확인하려면 이 저장소용 환경에 사이트 주소(예: `starter-test.jrchun1.workers.dev`)를 허용 호스트로 넣는다.
  - 편집 암호(WRITE_TOKEN)는 MCP로 넣지 않는다(AI가 값을 보게 되므로). 사람이 대시보드 › Worker › 설정 › 변수 및 비밀 › Secret으로 넣는다.
- 아직 확인하지 못한 것: `gh repo create --template`, `wrangler login`·`wrangler deploy`를 이 흐름에서 처음부터 실행, Codex에서 MCP 연결.
