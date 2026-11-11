// Cloudflare Worker 진입점.
// 정적 파일(web/)은 Cloudflare가 먼저 찾아 보내고, 맞는 파일이 없을 때만 이 코드가 실행된다.
// /api/* 만 여기서 처리하고 나머지는 정적 파일 처리(404 포함)에 넘긴다.
// 새 API: src/api/<이름>.js에 GET/PUT/POST/DELETE 함수를 만들고 아래 ROUTES에 한 줄 추가한다.
import * as doc from './api/doc.js';
import * as health from './api/health.js';
import { json } from './lib/http.js';

const ROUTES = { '/api/doc': doc, '/api/health': health };

export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname.replace(/\/+$/, '');
    const route = ROUTES[path];
    // Supabase 모드(D1 없음)에서는 /api/doc을 쓰지 않는다.
    if (!route || (route === doc && !env.DB)) return env.ASSETS.fetch(request);
    const handler = route[request.method];
    if (!handler) return json({ detail: '허용하지 않는 요청 방식입니다.' }, 405);
    try {
      return await handler({ request, env, ctx });
    } catch (e) {
      return json({ detail: '서버 오류: ' + (e && e.message || e) }, 500);
    }
  },
};
