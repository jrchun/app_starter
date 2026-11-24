# 내 도메인 주소 (`<앱이름>.<내 도메인>`)

앱 주소를 `https://gym-log.tedcheon.workers.dev` 대신 `https://gym-log.woongstudio.com`처럼 쓴다.
도메인은 하나만 사고(연 10달러 정도), 앱마다 앞에 이름을 붙인다(하위 주소). 하위 주소는 무료이고 개수 제한이 없다.

- 내 도메인은 `CLAUDE.md`의 **"내 도메인:" 줄 한 곳**에만 둔다. 비어 있으면(`(아직 없음)`) 예전처럼 workers.dev 주소만 쓴다.
- 도메인은 앱과 **같은 Cloudflare 계정**에 있어야 한다(Cloudflare에서 샀거나, 다른 곳에서 사고 네임서버를 Cloudflare로 바꾼 것).
- 옛 workers.dev 주소는 **예비로 계속 열린다**(`wrangler.toml`의 `workers_dev = true`). 이미 나눠 준 링크가 깨지지 않는다.
- 사이트는 Cloudflare 서버에서 돈다. 도메인은 "주소"일 뿐이라 PC를 켜 둘 필요가 없다.

## 어떻게 붙는가

`cf_mcp.mjs fill`이 `wrangler.toml` 맨 아래에 이렇게 넣는다(표시 줄 안은 fill이 다시 쓰므로 손으로 고치지 않는다).

```toml
# >>> 내 도메인 주소 (scripts/cf_mcp.mjs fill이 관리한다. 손으로 고치지 않는다)
[[routes]]
pattern = "gym-log.woongstudio.com"
custom_domain = true
# <<< 내 도메인 주소
```

`main`에 들어가면 Cloudflare 자동 배포(`npx wrangler deploy`)가 이 주소를 Worker에 붙이고, **DNS 기록과 인증서(https)를 스스로 만든다.** 사람이 DNS를 만질 일은 없다.
배포를 기다리지 않고 바로 붙이거나 붙었는지 확인하려면 `node scripts/cf_mcp.mjs domain` → 생긴 `.wrangler/mcp/domain.js`를 MCP `execute`로 넘긴다(여러 번 실행해도 안전).

공식 문서: Cloudflare Workers › Configuration › Routing › Custom Domains, workers.dev.

## 새 앱

`docs/AGENT_SETUP.md` 순서 그대로다. 달라지는 것만:
- 2절 기획 요약의 주소: `address` 결과의 `url`(내 도메인 주소)을 보여 준다.
- 5절 `fill`이 내 도메인 주소를 함께 넣는다.
- 6-2 첫 빌드 뒤 `domain`으로 붙었는지 확인한다.
- 7절 검사·허브 등록은 내 도메인 주소로 한다.
- 8절(클라우드 세션) 허용 호스트도 내 도메인 주소의 호스트를 넣는다.

## 이미 있는 앱 옮기기 (workers.dev → 내 도메인)

1. 그 앱 저장소의 `CLAUDE.md`에 `내 도메인: <도메인>` 줄을 넣는다(이 틀의 줄과 설명을 그대로 복사).
2. `scripts/cf_mcp.mjs`·`scripts/cf_mcp/remote.js`·`tests/domain.test.js`를 이 틀의 최신 것으로 바꾼다(예전 앱이면).
3. `node scripts/cf_mcp.mjs fill --name <wrangler.toml의 name>` → `wrangler.toml`에 `workers_dev = true`와 주소 칸이 들어간다. D1 ID는 그대로 둔다.
4. `npm test` → PR → Merge. 1~2분 뒤 `cf_mcp.mjs domain` → `execute`로 붙었는지 확인(`already: true`).
5. `node scripts/check_site.mjs https://<앱이름>.<도메인>`과 옛 workers.dev 주소 둘 다 검사한다.
6. 허브에 등록돼 있던 앱이면 허브의 줄을 새 주소로 바꾼다(아래).
7. `web/app.json`의 `updatedAt`은 그대로 둬도 된다(기능 변경이 아니다).

### 허브의 주소 바꾸기
`curl -sS -X POST <허브 주소>/api/register -H 'Content-Type: application/json' -d '{"url":"<새 주소>","replaces":"<옛 주소>"}'`
- 허브가 새 주소와 옛 주소의 `app.json`을 둘 다 읽어 **글자까지 같으면**(같은 Worker가 두 주소로 열린다는 뜻) 옛 줄을 지우고 새 주소로 옮긴다. 숨김 표시·처음 등록한 날은 이어받는다.
- 다르면 옛 줄은 그대로 두고 새 주소만 등록한다(`replaced: false`와 이유). 그때는 사람이 허브에서 옛 줄을 지운다.
- 비밀값이 없어도 안전한 이유: 남이 이 요청을 보내도, 두 주소가 정말 같은 앱일 때만 바뀌기 때문이다.

## 함정

- **`[[routes]]`를 넣으면 Cloudflare가 workers.dev 주소를 끈다.** `workers_dev = true`를 꼭 같이 둔다(fill이 넣는다). 대시보드에서만 바꾸면 다음 배포 때 `wrangler.toml` 기준으로 돌아간다.
- **같은 이름의 CNAME 기록이 이미 있으면 붙지 않는다.** 대시보드 › 도메인 › DNS에서 그 이름의 기록을 확인한다(Workers가 만든 기록은 읽기 전용으로 보인다).
- **도메인이 이 계정에 없거나 `active`가 아니면** `domain`이 `step: 도메인`으로 알려 준다. 산 직후에는 몇 분 걸릴 수 있다.
- **같은 주소를 다른 Worker가 쓰고 있으면** `step: 겹침`. 다른 앱 이름을 쓰거나 그쪽 연결을 먼저 뗀다.
- **클라우드 세션은 새 주소에도 막혀 있다.** workers.dev처럼 허용 호스트에 `<앱이름>.<도메인>`을 넣어야 검사·화면 확인을 할 수 있다(`AGENT_SETUP.md` 8절).
- **브라우저 저장소는 주소마다 따로다.** 이 틀의 D1 앱은 편집 암호를 기기에 기억해 두므로, 새 주소에서는 편집 암호를 한 번 다시 입력한다(암호 자체는 그대로).
- 허브는 `woongstudio.com`처럼 **자기와 같은 도메인의 앱**(또는 `wrangler.toml` `OWNER_DOMAINS`에 적은 도메인)만 등록받는다.
- Cloudflare **Pages** 프로젝트(예: 했냐)는 이 방법이 아니다. Pages는 프로젝트 › 사용자 지정 도메인에서 붙이고, 로그인·공유 설정(카카오·Supabase 등)의 주소 목록도 함께 바꿔야 한다. 그 앱 저장소의 문서를 따른다.
