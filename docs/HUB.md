# 앱 허브 연결

앱 허브는 app_starter로 만든 앱들을 한 페이지에 모아 보여 주는 별도 사이트다(허브 자체는 다른 저장소).
허브 주소는 `CLAUDE.md`의 "허브 주소" 줄 한 곳에 있다. 비어 있으면 허브 등록은 건너뛴다.

## 허브가 앱에서 읽는 것

| 주소 | 무엇 | 만드는 곳 |
|---|---|---|
| `/app.json` | 이름·설명·상태(카드에 보임) | `web/app.json` (정적 파일) |
| `/api/health` | 살아 있는지, 허브 연동 버전(`starter`), 사용량(`usage`) | `src/api/health.js` |
| `/og.png` | 대표 화면(카드 그림, 카톡 링크 미리보기) | `web/og.png` (`node scripts/og_shot.mjs <주소>`로 찍음) |

### `web/app.json`

```json
{ "schema": 1, "name": "내 앱", "emoji": "🧩", "summary": "한 줄 설명", "category": "기타",
  "status": "개발중", "public": true, "mode": "d1", "repo": "소유자/저장소", "createdAt": "2026-11-15", "updatedAt": "" }
```

| 필드 | 뜻 | 값 |
|---|---|---|
| `schema` | 형식 버전. 필드가 바뀔 때 허브가 구분한다 | 지금은 `1` |
| `name` / `emoji` / `summary` | 카드의 이름, 아이콘, 한 줄 설명 | 기획 요약에서 |
| `category` | 분류 | `생활`, `건강`, `돈`, `모임`, `업무`, `기타` |
| `status` | 앱 상태 | `개발중`(만드는 중), `운영중`(첫 배포 성공 뒤), `중단` |
| `public` | `false`면 허브가 카드만 보여 주고 링크는 숨긴다 | `true` / `false` |
| `mode` | 데이터 저장 방식 | `d1` / `supabase` (`use_supabase.py`가 바꿔 준다) |
| `repo` | GitHub 저장소 | `소유자/저장소` |
| `createdAt` / `updatedAt` | 만든 날, 마지막으로 크게 바꾼 날 | `YYYY-MM-DD` |

- **`public: false`는 보안 장치가 아니다.** 허브 화면에서 링크를 숨기는 표시일 뿐이다. `app.json`도 앱도 주소를 아는 사람은 누구나 볼 수 있다.
- 큰 기능을 바꾸면 `updatedAt`을 그날로 고친다. 화면이 크게 바뀌면 `og.png`도 다시 찍는다.

### `/api/health`의 새 값

```json
{ "ok": true, "db": true, "passwordSet": true, "...": "예전 값은 그대로",
  "starter": 1, "usage": { "last30d": 42, "lastUsedAt": "2026-11-14T09:12:00Z" } }
```

- `starter`: 허브 연동 기능의 버전(지금 `1`). 없으면 허브는 "허브 준비 전 예전 앱"으로 본다.
- `usage`: `usage_log` 표의 최근 30일 건수와 마지막 기록 시각. `usage_log`는 **편집 암호를 가진 기기**에서 열거나 저장했을 때만 쌓이므로, 방문자 수가 아니라 "주인이 실제로 쓰는지"를 보여 준다.
- Supabase 모드(D1 없음)이거나 질의가 실패하면 `usage: null`. 그래도 health 자체는 성공한다.
- 예전 필드는 지우거나 이름을 바꾸지 않는다(예전 `check_site.mjs`·허브가 읽는다).

## 이미 만든 앱을 허브에 붙이기 ("허브 연결해 줘")

틀(app_starter)을 고쳐도 이미 만든 앱에는 반영되지 않는다. 그 앱의 세션에서 "허브 연결해 줘"라고 하면 AI가 아래 순서로 옮긴다. 원본 코드는 GitHub `jrchun/app_starter`의 `main`에서 읽는다.

1. **`web/app.json` 만들기.** 그 저장소의 README·`CLAUDE.md`·화면을 보고 AI가 채운다. `status`는 이미 배포돼 있으면 `운영중`, `createdAt`은 첫 커밋 날짜, `updatedAt`은 오늘. 사람에게는 채운 내용을 보여 주고 **확인만** 받는다.
2. **`src/api/health.js`에 `starter`·`usage` 추가.** app_starter의 `src/api/health.js`에서 `STARTER_VERSION`·`usageSummary`와 응답에 두 값을 더하는 부분을 그대로 옮긴다. 그 앱이 health에 따로 넣은 값은 그대로 둔다. `usage_log` 표가 없는 앱이면 `usage`는 `null`로 나온다(표를 새로 만들지 않는다). 테스트(`tests/worker.test.js`)에 `starter`·`usage` 확인을 하나 넣는다.
3. **대표 화면.** app_starter의 `scripts/og_shot.mjs`를 복사해 `node scripts/og_shot.mjs <사이트 주소>`로 `web/og.png`를 찍는다. `web/index.html`의 `<title>` 아래에 `og:title`·`og:description`·`og:image`(`/og.png`) 태그를 넣는다. `scripts/check_site.mjs`도 app_starter 것으로 바꾼다(허브 항목을 경고로 검사한다).
4. **테스트 → PR → Merge → 확인.** `npm test`, 자동 배포 뒤 `node scripts/check_site.mjs <사이트 주소>`에서 "앱 허브" 세 줄이 `ok`인지 본다.
5. **허브 등록.** 허브 주소가 있으면 `POST <허브 주소>/api/register`에 `{"url": "<앱 주소>"}` (`docs/AGENT_SETUP.md` 7절 7번과 같다). 없거나 실패하면 "허브 등록은 건너뜀"이라고만 보고한다.
