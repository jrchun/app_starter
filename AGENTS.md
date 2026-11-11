# AGENTS.md (Codex 등 AI 에이전트용)

이 저장소는 작은 웹 앱 시작 틀이다. 규칙과 구조는 `CLAUDE.md`, 설치·배포 순서는 **`docs/AGENT_SETUP.md`**를 따른다.
사용자는 개발 지식이 많지 않다. 답변은 한국어로, 쉬운 말로 한다.

## Codex에서 서비스 연결 (MCP, 브라우저 로그인)

```
codex mcp add supabase --url https://mcp.supabase.com/mcp
codex mcp login supabase
codex mcp add cloudflare --url https://mcp.cloudflare.com/mcp
codex mcp login cloudflare
```

Codex 안에서 `/mcp`로 연결을 확인한다. Cloudflare 배포는 `npx wrangler@4 login` 후 `npx wrangler@4 deploy`가 가장 단순하다.
토큰·비밀번호는 채팅으로 받지 않는다.

## 확인 명령

- 테스트: `npm test`
- 로컬 실행: `cp .dev.vars.example .dev.vars && npx wrangler@4 dev`
- 배포 검사: `node scripts/check_site.mjs <사이트 주소>`
