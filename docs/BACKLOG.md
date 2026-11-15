# 나중에 할 일 (백로그)

지금 당장 하지 않고 미뤄 둔 일. 우선순위: **기능이 제대로 도는 것 > 디자인 통일성**.
사용자가 "백로그 진행"이라고 하면 위에서부터 하나씩 꺼내 PR로 처리하고, 끝나면 여기서 지운다.

## 확인이 남은 것 (다음 새 앱을 만들 때 같이)
- **`cf_mcp.mjs connect`를 새 저장소에서 처음부터 끝까지 실행해 보기.** 지금까지는 이미 연결된 앱(asset)과 가짜 Cloudflare 테스트로만 확인했다.
- **`gh repo create --template`으로 템플릿 저장소 만들기 확인.** 사람이 GitHub "Use this template"을 누르는 대신 AI가 만들 수 있는지.
- **Codex에서 Cloudflare MCP 연결 확인.** `AGENTS.md` 안내대로 되는지.

## 디자인 통일성 (나중에)
- **뎀브란트(Dembrandt) MCP로 디자인 초안 잡기.** 참고 사이트 주소를 주면 색·글꼴·간격 같은 디자인 값(토큰)을 뽑아 주는 도구. 로그인·API 키 없이 `npx -y dembrandt mcp`로 돈다.
  - 할 일: 저장소에 `.mcp.json` 추가(버전 고정) → `docs/AGENT_SETUP.md` 기획 단계에 "참고 사이트가 있나요?" 질문 추가 → 뽑은 값을 `web/styles.css` CSS 변수(라이트·다크)로 옮기고 400px 화면 캡처로 초안 보여 주기 → Codex용 설정은 `AGENTS.md`에 따로.
  - 주의: 분위기·간격 규칙만 참고하고 남의 로고·브랜드를 그대로 쓰지 않는다. 클라우드 세션에서는 참고 사이트 주소를 접속 허용 목록에 넣어야 하고, 컨테이너에서는 `noSandbox` 옵션을 켠다.
  - 출처: https://github.com/dembrandt/dembrandt (README의 "AI Agent Integration (MCP)")
- **앱들 사이 공통 디자인 규칙.** 여러 앱을 만든 뒤, 같은 색·글꼴·부품 모양을 쓰도록 `web/styles.css` 기본값을 정리.
