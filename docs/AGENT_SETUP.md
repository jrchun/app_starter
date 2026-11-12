# AI용 설치 안내서 (Claude Code · Codex 공통)

사용자가 "이 저장소(app_starter)로 앱 만들어서 배포까지 해 줘"라고 하면 이 순서를 따른다.
사용자는 개발 지식이 많지 않다. **모든 대화와 보고는 한국어로, 쉬운 말로** 한다(자세한 규칙은 `CLAUDE.md` 맨 위 "언어").
아래 "사람에게 물을 것"이 아닌 일은 묻지 말고 진행한다. 끝나면 실제 사이트를 직접 확인한 결과로 보고한다.

## 한눈에 보는 순서 (claude.ai 클라우드 세션 기준)

사람이 할 일은 ★. 시작할 때 이 표를 사용자에게 보여 주고, 지금 몇 번인지 알리며 진행한다. **사람에게 묻거나 부탁하는 일은 표의 ★ 말고는 만들지 않는다.**

| # | 누가 | 무엇을 | 이 문서 |
|---|---|---|---|
| 1 | ★사람 | 템플릿 링크로 내 저장소 만들기(**저장소 이름 = 앱 이름**), 그 저장소로 세션 열기 | 3 |
| 2 | ★사람 | (처음 한 번) claude.ai 설정 › 커넥터에 Cloudflare MCP 연결 | 1 |
| 3 | AI→★사람 | "무슨 앱인가요?" 한 번만 묻고, AI가 기획 요약(화면·기능·DB 모드)을 만들어 **한 번에** 확인받기 | 2 |
| 4 | AI→★사람 | MCP로 D1 만들기(`prepare`) → 사이트 주소가 정해지면 바로 주소 허용 승인 창(클라우드 세션만) | 5, 8 |
| 5 | AI | 앱 만들기, `npm test`, 로컬 화면 확인, `fill` → 커밋 | 4, 5 |
| 6 | AI→★사람 | PR 만들기 → 사람이 **Merge**해서 `main`에 반영 | 6-1 |
| 7 | ★사람 | Cloudflare › Workers 및 Pages › **만들기 › GitHub에서 가져오기** › 내 저장소 › 배포(처음이면 GitHub에서 Cloudflare 앱 허락). 이것으로 첫 배포와 자동 배포 연결이 한 번에 끝난다 | 6-2 |
| 8 | ★사람 | Worker › 설정 › 변수 및 비밀 › Secret `WRITE_TOKEN` = 편집 암호 (D1 모드) | 6-3 |
| 9 | AI | 사이트 검사·폰 폭 화면 확인 → 보고 | 7 |

- 이후 고칠 때: AI가 고치고 PR → 사람이 Merge → Cloudflare가 자동 배포 → AI가 검사.
- 순서가 중요한 이유: 7번은 가져오는 순간 `main`을 배포한다. 그래서 `main`에 앱 코드와 채운 `wrangler.toml`이 있어야 한다(6번이 먼저).
- 내 컴퓨터: 1번은 `gh repo create`, 4번 승인 창 없음, 6번은 AI가 `main`에 바로 올린다.
- MCP 첫 배포(`cf_mcp.mjs deploy`)는 예비 수단이다(6-4). 실제 앱은 파일이 커서 보통 쓸 수 없다.

## 0. 원칙

- **API 토큰 없이 진행한다.** Cloudflare·Supabase·GitHub는 각 서비스의 브라우저 로그인(MCP·OAuth)으로 연결한다. 사용자에게 토큰을 만들게 하지 않는다.
- **내 GitHub 저장소가 반드시 있다.** 앱마다 사용자 계정에 이 틀을 복사한 저장소를 두고, 배포는 그 저장소의 `main`을 기준으로 한다.
- 이 문서에 적힌 명령과 도구만 쓴다. 각 명령이 무엇을 하는지 사용자에게 한 줄로 알린다.
- 비밀값(편집 암호 등)은 **채팅으로 받지 않는다.** 사람이 서비스 설정 화면에 직접 넣는다.
- 비밀값은 저장소에 넣지 않는다. 공개 값(Supabase publishable 키, 계정 ID, D1 ID)은 넣어도 된다.
- 모르는 서비스 사양은 추측하지 말고 공식 문서를 확인한다.
  - Cloudflare: Cloudflare MCP의 `docs` 도구, 또는 `https://developers.cloudflare.com/<경로>/index.md`
  - Supabase: Supabase MCP의 `search_docs`, 또는 `https://supabase.com/docs/<경로>.md`

## 1. 연결 확인 (모두 브라우저 로그인)

| 서비스 | 쓰는 것 | 확인 방법 |
|---|---|---|
| GitHub | 클라이언트에 기본 연결된 GitHub 도구, 내 컴퓨터는 `gh`(`gh auth login`은 브라우저 로그인) | 저장소 읽기·푸시가 되는지 |
| Cloudflare | Cloudflare MCP `https://mcp.cloudflare.com/mcp` | `whoami`, 그리고 `execute`로 `GET /accounts` |
| Supabase (Supabase 모드만) | Supabase MCP `https://mcp.supabase.com/mcp` | `list_organizations` |

- Claude Code(내 컴퓨터): 저장소의 `.mcp.json`에 Cloudflare·Supabase MCP가 적혀 있다. 처음 열면 승인을 묻고, 첫 사용 때 브라우저 로그인 창이 뜬다.
- claude.ai(웹·클라우드 세션): 설정 › 커넥터 › **사용자 지정 커넥터 추가** › URL `https://mcp.cloudflare.com/mcp` → 로그인. Supabase는 디렉터리의 Supabase 커넥터를 쓴다. 클라우드 세션에서는 저장소의 `.mcp.json` 연결이 네트워크 정책으로 실패할 수 있다(그래도 claude.ai 커넥터는 된다). 디렉터리의 "Cloudflare Developer Platform" 커넥터는 **지원 종료 예정**(배포 불가)이라 쓰지 않는다.
- Codex: `AGENTS.md`의 `codex mcp add` / `codex mcp login`.
- Cloudflare 로그인 화면에서 권한을 고를 수 있으면 **Workers Scripts, D1 쓰기**와 **Workers CI(Builds) 읽기**를 허용한다. Workers CI 읽기가 없으면 Git 자동 배포 결과를 AI가 볼 수 없다(배포 자체는 된다).
- 계정이 여러 개면 `execute`를 부를 때 `account_id`를 넘긴다(`GET /accounts`로 목록을 본 뒤 사람에게 고르게 한다).
- 연결이 안 되면 무엇이 막혔는지 그대로 말한다. 대안으로 내 컴퓨터에서 `npx wrangler@4 login`(이것도 브라우저 로그인)을 안내한다.

## 2. 사람에게 물을 것 (한 번에 끝낸다)

묻는 것은 **"무슨 앱인가요?"** 하나다. 나머지는 AI가 정해서 아래 기획 요약으로 한 번에 보여 주고 "이대로 진행할까요?"만 확인받는다. 사용자가 처음 요청에 앱 설명을 이미 적었으면 묻지 않고 바로 기획 요약을 보여 준다.

기획 요약에 넣을 것(짧게):
1. 한 줄 설명, 누가 쓰는지, 주 사용 기기(기본: 폰)
2. 화면과 기능 목록(첫 버전에 넣을 것만)
3. **DB 모드**(AI가 정한다)
   - **D1 모드(기본)**: 나 혼자, 또는 편집 암호를 아는 몇 명이 같은 데이터를 함께 쓴다. 로그인 없음. 읽기는 공개.
   - **Supabase 모드**: 사람마다 로그인하고 **자기 데이터만** 본다. 무료 플랜은 계정당 프로젝트 **2개**까지(일시 정지한 것은 세지 않음).
4. 앱 이름: **저장소 이름을 그대로 쓴다**(영문 소문자·숫자·하이픈으로 맞춘다). Worker 이름, D1 이름, 사이트 주소(`https://<앱이름>.<하위도메인>.workers.dev`)가 된다. 이름이 다르면 7번 가져오기에서 사람이 이름을 고쳐야 해서 실수가 생긴다.
5. 매일 작업이 필요한지(필요 없으면 `crons = []`로 끈다. 무료 플랜은 계정 전체 5개)

## 3. 내 저장소 만들기 (필수)

지금 작업 폴더가 `jrchun/app_starter` 원본이면, 사용자 계정에 새 저장소를 만들고 거기서 작업한다. 원본에 앱을 만들지 않는다.
(단순히 내려받기(clone)만 해서는 안 된다. Cloudflare가 사용자 계정의 저장소를 보고 자동 배포하기 때문이다.)

- 내 컴퓨터: `gh repo create <앱이름> --template jrchun/app_starter --private --clone`, 그다음 그 폴더에서 작업
- 클라우드 세션: 사람에게 이 링크를 주고 저장소를 만들어 달라고 한다: `https://github.com/new?template_name=app_starter&template_owner=jrchun` (Repository name = 앱 이름). 그 저장소로 세션을 다시 열어 달라고 한다.

## 4. 앱 만들기

- `CLAUDE.md`의 구조와 규칙을 따른다(정적 화면, 빌드 없음, CSS 변수, 폰 400px·라이트·다크 확인).
- 계산·규칙은 순수 함수로 두고 `tests/`에 테스트를 붙인다. `npm test`가 통과해야 한다.
- 로컬에서 띄워 브라우저로 폰 폭 화면을 직접 확인한 뒤 사용자에게 보여 준다.
- 매일 할 일(시세 받기, 정리 등)이 있으면 `src/jobs.js`의 `daily()`를 바꾼다. 시각은 `wrangler.toml`의 `[triggers] crons`(UTC).

## 5. 데이터 준비

### D1 모드 (Cloudflare MCP)
1. `node scripts/cf_mcp.mjs prepare --name <앱이름>` → `.wrangler/mcp/prepare.js`가 생긴다.
2. 그 파일 내용을 그대로 Cloudflare MCP `execute`의 `code`로 넘긴다. D1을 찾거나 만들고(apac), `db/schema.sql`을 적용하고, `database_id`와 사이트 주소(`url`)를 돌려준다. 여러 번 실행해도 안전하다.
   - `subdomain`이 `null`이면 처음 쓰는 계정이다. 사람에게 대시보드 › Workers 및 Pages를 한 번 열어 `workers.dev` 하위 도메인을 정해 달라고 한다.
3. `node scripts/cf_mcp.mjs fill --name <앱이름> --database-id <위의 database_id>` → `wrangler.toml`이 채워진다. 커밋한다.
- 표를 바꿨으면 1~2를 다시 한다(`CREATE TABLE IF NOT EXISTS`만 쓰므로 안전).

### Supabase 모드 (Supabase MCP)
1. `list_organizations` → 조직이 여러 개면 사람에게 고르게 한다.
2. `list_projects`로 활성 프로젝트 수를 확인한다. 무료 한도(2개)에 걸리면 사람에게 알리고, 어떤 프로젝트를 일시 정지할지 **반드시 확인받는다.** 정지하면 그 프로젝트의 서비스가 멈춘다. 최근 사용 여부는 `query_logs`로 확인해 함께 알린다.
3. `create_project`: 이름은 앱 이름, 지역은 `ap-northeast-2`(서울). 비용이 0이 아니면 사람의 확인을 받는다.
4. `get_project`로 상태가 `ACTIVE_HEALTHY`인지 확인한다.
5. `apply_migration`으로 `supabase/schema.sql` 전체를 적용한다.
6. `get_project_url`과 `get_publishable_keys`를 부른다. `sb_publishable_...` 키를 쓰고, 없으면 legacy anon 키를 쓴다. **secret, service_role 키는 쓰지 않는다.**
7. `python3 scripts/use_supabase.py --url <URL> --key <publishable 키>`: 화면을 로그인 + 내 메모 예제로 바꾸고, D1 연결을 빼고, `wrangler.toml`의 `[vars]`에 주소·공개 키를 넣는다(매일 잠들기 방지 예약 작업이 쓴다).
8. `node scripts/cf_mcp.mjs fill --name <앱이름>`으로 Worker 이름을 정한다. (Cloudflare `prepare`는 D1 없이 사이트 주소만 확인한다.)
9. 사람에게 부탁할 것: Supabase 대시보드 › Authentication › Sign In / Providers › Email › **Confirm email 끄기**. 켜져 있으면 가입한 사람이 확인 메일 없이는 로그인하지 못하고, 기본 메일 발송은 제한이 크다.
10. `get_advisors`(security)로 RLS 누락이 없는지 확인한다. 표를 추가했다면 RLS와 정책이 있어야 한다.

## 6. 배포 (Cloudflare Workers)

**Pages가 아니라 Workers다.** `wrangler.toml`이 Workers 형식(main + [assets] + [triggers])이다.

### 6-1. `main`에 반영 (PR → Merge)
- 클라우드 세션: 작업 브랜치에 올리고 **PR을 만든다.** 사용자가 배포를 요청했으면 PR 생성까지 요청한 것으로 본다. PR 링크를 주고 "Merge 버튼을 눌러 주세요"라고 부탁한다. Merge 전에는 6-2로 넘어가지 않는다.
- 내 컴퓨터: `main`에 바로 올린다.

### 6-2. Cloudflare에서 저장소 가져오기: 사람이 앱마다 한 번 (기본 경로)
첫 배포와 자동 배포 연결(Workers Builds)이 한 번에 끝난다. 이후 `main`에 올릴 때마다 Cloudflare가 저장소를 가져가 `npx wrangler deploy`로 배포한다. 토큰은 Cloudflare가 스스로 만든다.
- 사람에게 부탁: 대시보드 › Workers 및 Pages › **만들기(Create application)** › **GitHub** › 저장소 선택 › 이름이 `wrangler.toml`의 `name`과 같은지 확인 › 빌드 명령 비움, 배포 명령 `npx wrangler deploy`(기본값) › **배포**.
  - 처음이면 GitHub 화면이 뜨고 Cloudflare 앱 설치를 묻는다. 그 저장소(또는 모든 저장소)를 허용한다. 계정당 처음 한 번만 묻는다.
  - 화면 이름은 바뀔 수 있다. 다르면 Cloudflare MCP `docs`로 "Workers Builds connect a new Worker"를 찾아 현재 순서를 안내한다.
- 끝나면 `node scripts/cf_mcp.mjs status` → `execute`로 Worker·예약 작업이 생겼는지 보고, 7절대로 사이트를 검사한다.
- Worker 이름과 `wrangler.toml`의 `name`이 다르면 빌드가 실패한다.
- AI가 API로 대신하지 않는 이유: GitHub 쪽 앱 설치 승인은 사람만 할 수 있고(공식 문서도 대시보드에서 한 번 하라고 한다), 연결에 필요한 배포용 토큰(build token)도 대시보드가 만들어 준다.

### 6-4. (예비) MCP 첫 배포
사람이 7번을 하기 전에 화면을 먼저 띄워 보고 싶을 때, 또는 Git 배포가 깨졌을 때만 쓴다.
1. `node scripts/cf_mcp.mjs deploy` → `.wrangler/mcp/deploy.js` 내용을 그대로(다시 타이핑하지 말고 파일을 읽어서) `execute`의 `code`로 넘긴다. Worker 올리기, 예약 작업 시각 등록, `workers.dev` 켜기를 하고 `url`을 돌려준다.
   - MCP로는 정적 자산 업로드를 할 수 없어서(아래 시험 기록) `web/`을 Worker 안에 묶어 올린다. 화면과 동작은 같다. Git 배포가 한 번 돌면 원래 구성(정적 자산)으로 바뀐다.
   - 스크립트가 "너무 큽니다"라고 하면(100KB 넘음. 큰 데이터 파일이 있거나 Supabase 모드면 넘는다) 쓰지 않는다.
2. 이렇게 Worker를 먼저 만들었으면 6-2 대신 기존 Worker에 연결한다: Worker › 설정 › **Builds › Connect** › GitHub › 저장소, 브랜치 `main`.
3. Git 연결 뒤에는 MCP `deploy`를 쓰지 않는다.

### 6-3. 편집 암호 (D1 모드)
사람에게 부탁: 대시보드 › Worker › 설정 › 변수 및 비밀 › 추가 › 형식 **Secret**, 이름 `WRITE_TOKEN`, 값 = 편집 암호. AI는 값을 보지 않는다. (내 컴퓨터라면 `npx wrangler@4 secret put WRITE_TOKEN`으로 사람이 직접 입력해도 된다.)

### 예약 작업
- `wrangler.toml`의 `[triggers] crons`(기본: 매일 07:30 KST)에 Cloudflare가 `src/jobs.js`를 실행한다. D1 모드는 `daily()`, Supabase 모드는 잠들기 방지. GitHub Actions나 토큰이 필요 없다.
- **무료 플랜은 계정 전체에서 Cron Trigger 5개까지**다. 앱이 많으면 매일 작업이 필요 없는 앱(D1 모드)은 `crons = []`로 끈다. Supabase 모드는 끄지 않는다(7일 동안 요청이 없으면 프로젝트가 멈춘다).
- 로컬 시험: `npx wrangler@4 dev --test-scheduled` 후 `curl "http://localhost:8787/__scheduled?cron=30+22+*+*+*"`.

## 7. 확인하고 보고하기

1. `node scripts/check_site.mjs https://<앱이름>.<하위도메인>.workers.dev`: 모든 항목이 ok여야 한다. 프록시 뒤라면 `NODE_USE_ENV_PROXY=1`을 붙인다. 이 검사는 모드를 스스로 알아본다.
2. 브라우저로 실제 주소를 폰 폭(400px) 라이트·다크로 열어 본다.
3. `node scripts/cf_mcp.mjs status` → `execute`: 예약 작업 시각, 편집 암호 유무, Git 자동 배포 결과.
4. 보고에 넣을 것: 사이트 주소, 사람이 폰에서 확인할 것(D1: 아무 값이나 고치고 편집 암호 입력 → "저장됨" / Supabase: 가입 → 메모 추가 → 다른 계정에서는 안 보임), 자동 배포 연결 여부.
5. `docs/SETUP.md`의 "함정" 중 이번에 실제로 겪은 것이 있으면 사용자에게 알린다. 새로 겪은 함정이면 그 문서에 추가를 제안한다.

## 8. 클라우드 세션(claude.ai/code)에서 할 때

클라우드 세션의 컨테이너는 정해진 주소에만 나갈 수 있다. 처음 배포하는 앱이면 이렇게 한다.
- 새 세션은 보통 기본(Default) 환경에서 시작한다. 사이트 주소는 5번 `prepare` 결과(`url`)로 미리 알 수 있으니, **그때 바로** 아래처럼 허용을 요청한다(나중에 작업을 끊지 않게).
- **사이트 검사가 막히면**(`check_site.mjs`가 `fetch failed`, 프록시 403): 환경 도구(`get_environment` → 기본 환경이면 `create_environment`)로 **이 저장소 전용 개인 환경**을 만들고 허용 호스트에 `<앱이름>.<하위도메인>.workers.dev`만 넣는다. 사람이 승인 창에서 허락하면 이 세션에 바로 적용된다. 다른 저장소와 함께 쓰는 기본 환경은 건드리지 않는다.
- **Cloudflare API(api.cloudflare.com), `wrangler`는 컨테이너에서 쓰지 않는다.** 모든 Cloudflare 작업은 MCP `execute`로 한다. MCP 실행 환경도 Cloudflare API 밖(사이트 주소 포함)으로는 나갈 수 없으므로, 사이트 검사는 컨테이너에서 한다.
- **Supabase**: 저장소 `.mcp.json`의 연결은 실패할 수 있다. claude.ai의 Supabase 커넥터(도구 이름 `mcp__Supabase__...`)를 쓴다. 둘 다 없으면 사람에게 claude.ai 설정 › 커넥터에서 Supabase를 연결해 달라고 한다.
- 화면 확인은 컨테이너의 Playwright로 한다(사이트 주소가 허용된 뒤).

## 시험 기록 (2026-11-11, 이 틀을 만들며 확인한 것)

- D1 모드: 로컬 실행에서 저장·편집 암호·충돌·400px 확인. 같은 구성의 실제 배포(리밸런싱 보드)에서 `workers.dev` 동작 확인.
- Supabase 모드: Supabase MCP로 프로젝트 생성(서울) → 스키마 적용 → 키 조회 → `use_supabase.py` → 로컬 실행. 로그인, 메모 추가·삭제, 다른 계정에서는 안 보임(RLS), 새로고침 뒤 로그인 유지, `check_site.mjs` 전부 ok.
- D1 모드 클라우드 세션 배포(`starter-test`, 토큰 없이 Cloudflare MCP만): `cf_mcp.mjs prepare`(D1 생성·스키마) → `fill` → `deploy`(Worker·예약 작업·`workers.dev`) → `status`까지 MCP로 됨. `check_site.mjs` 전부 ok(편집 암호 미설정 경고만), 400px 라이트·다크 확인. 예약 작업은 `wrangler dev --test-scheduled`로 로컬에서 `job_log` 기록 확인(배포본의 실제 예약 실행 시각 확인은 아직).
  - MCP 실행 환경은 api.cloudflare.com 요청에 로그인 정보를 강제로 붙인다. 그래서 업로드 전용 임시 토큰만 받는 정적 자산 업로드(`/workers/assets/upload`)가 401로 실패한다 → `cf_mcp.mjs deploy`는 `web/`을 Worker 안에 묶는다.
  - 클라우드 세션 네트워크는 api.cloudflare.com과 `*.workers.dev`를 막는다. MCP 실행 환경의 fetch도 Cloudflare API 밖으로는 403 → 8절처럼 저장소 전용 환경에 사이트 주소를 허용했다.
  - Workers Builds API(Git 연결·빌드 기록)는 커넥터에 `workers-ci` 권한이 없으면 403이다. 연결 생성에는 GitHub 앱 설치와 배포용 토큰이 필요해서 대시보드 연결을 표준으로 정했다.
- 실제 앱(`jrchun/asset` → Worker `rebalance`, 2026-11-12): 템플릿 → 앱 구현(테스트 46개) → MCP `prepare` → `fill` → PR Merge → Cloudflare "만들기 › GitHub"로 첫 배포(정적 자산 구성으로 올라감, 예약 작업 등록) → 편집 암호 → `check_site.mjs` 전부 ok. 두 번째 Merge 때도 1분 안에 자동 배포되고 편집 암호가 유지됨을 확인.
  - MCP 첫 배포 코드는 954KB(종목 목록 파일 732KB)라 쓸 수 없었다 → "만들기 › GitHub"를 기본 경로로 바꿨다.
  - 앱 이름(`rebalance`)과 저장소 이름(`asset`)이 달랐다. 동작은 되지만 헷갈려서 "저장소 이름 = 앱 이름"을 기본으로 정했다.
  - 배포본의 예약 작업이 실제 시각(07:30 KST)에 돌아 `job_log`에 기록된 것을 `starter-test`에서 확인.
- 아직 확인하지 못한 것: `gh repo create --template`, Codex에서 MCP 연결.
