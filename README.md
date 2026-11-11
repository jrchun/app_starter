# 새 프로젝트 시작 틀

1명~수십 명이 쓰는 작은 웹 도구를 빠르게 배포하기 위한 틀. "내 리밸런싱 보드"를 배포하며 정리한 구성이다.

| 역할 | 무엇으로 | 위치 |
|---|---|---|
| 화면 | 정적 HTML·CSS·JS (빌드 없음) | `web/` |
| API | Cloudflare Worker | `src/` |
| 저장 | Cloudflare D1 (SQLite) | `db/schema.sql` |
| 매일 작업 | GitHub Actions + Python | `jobs/`, `.github/workflows/daily.yml` |

기본으로 들어 있는 것
- 문서 하나를 저장하는 API(`/api/doc`): 버전 관리, 다른 기기 동시 수정 시 409, 편집 암호 없으면 401
- 화면 쪽 동기화 모듈(`web/js/docsync.js`): 0.7초 뒤 자동 저장, 충돌 시 최신으로 교체, 화면 안 편집 암호 입력칸
- 라이트·다크 색 변수, 폰(400px) 기준 레이아웃
- Cloudflare 준비 스크립트, 배포 확인 스크립트, 테스트

비용: Workers·D1·공개 저장소 Actions 모두 무료 범위(작은 개인 도구 기준).

## 시작하기

[`docs/SETUP.md`](docs/SETUP.md)의 순서를 따른다. 사람이 할 일은 토큰 발급, 대시보드 연결, 비밀 두 개 넣기뿐이고 나머지는 Claude Code가 한다.

```
npm test                                                  # 테스트
cp .dev.vars.example .dev.vars
npx wrangler@4 d1 execute my-app --local --file db/schema.sql
npx wrangler@4 dev                                        # http://localhost:8787
npm run check -- https://my-app.<계정>.workers.dev        # 배포 확인
```
