// 허브 로그인(docs/HUB.md): 앱은 쿠키 hub_session을 허브 /api/session에 물어 쓰기를 허락한다. 바깥 요청은 가짜 fetch. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWrite, hubSession, claimPassword, passwordState, readCookie } from '../src/lib/http.js';
import * as health from '../src/api/health.js';
import { parseHubLine, hubUrlFor, setHubToml, parseToml } from '../scripts/cf_mcp.mjs';

const HUB = 'https://hub.woongstudio.com';
const req = (headers = {}) => new Request('https://gym.woongstudio.com/api/doc', { method: 'PUT', headers });
// 가짜 허브: good 토큰만 통과. 부른 횟수를 센다.
function fakeHub({ good = 'v1.9999999999.goodsig', down = false } = {}) {
  const fn = async (url, init) => {
    fn.calls.push({ url, body: JSON.parse(init.body) });
    if (down) throw new Error('연결 실패');
    const ok = JSON.parse(init.body).token === good;
    return new Response(JSON.stringify(ok ? { ok: true, exp: 9999999999 } : { ok: false }), { status: ok ? 200 : 401 });
  };
  fn.calls = [];
  return fn;
}
const cookie = t => ({ Cookie: `other=1; hub_session=${t}` });

test('허브 로그인: 쿠키가 진짜면 저장 허락, 가짜·없음·허브 멈춤이면 거절', async () => {
  const env = { HUB_URL: HUB + '/' };
  const net = fakeHub();
  assert.equal(await canWrite(req(cookie('v1.9999999999.goodsig')), env, net), true);
  assert.equal(net.calls[0].url, HUB + '/api/session');
  assert.equal(await canWrite(req(cookie('v1.9999999999.badsig')), env, net), false);
  assert.equal(await canWrite(req(), env, net), false);
  assert.equal(await canWrite(req(cookie('v1.1.other')), env, fakeHub({ down: true })), false);
  assert.equal(readCookie(req(cookie('abc'))), 'abc');
});

test('허브 로그인: 확인 결과를 잠시 기억해 허브를 매번 부르지 않는다', async () => {
  const env = { HUB_URL: HUB }, net = fakeHub({ good: 'v1.9999999999.cached' }), r = req(cookie('v1.9999999999.cached'));
  const t0 = Date.now();
  assert.equal(await hubSession(r, env, net, t0), true);
  assert.equal(await hubSession(r, env, net, t0 + 60_000), true);
  assert.equal(net.calls.length, 1);
  await hubSession(r, env, net, t0 + 6 * 60_000); // 5분이 지나면 다시 묻는다
  assert.equal(net.calls.length, 2);
});

test('허브 로그인: 대시보드 비밀값은 비상용으로 계속 통하고, 앱별 암호는 쓰지 않는다', async () => {
  const net = fakeHub();
  assert.equal(await canWrite(req({ Authorization: 'Bearer dash-1' }), { HUB_URL: HUB, WRITE_TOKEN: 'dash-1' }, net), true);
  assert.equal(await canWrite(req({ Authorization: 'Bearer wrong' }), { HUB_URL: HUB, WRITE_TOKEN: 'dash-1' }, net), false);
  assert.equal(await claimPassword({ HUB_URL: HUB }, 'site-pass-1'), false);
  assert.deepEqual(await passwordState({ HUB_URL: HUB }), { set: true, source: 'hub' });
});

test('/api/health: 허브 로그인이면 auth=hub와 로그인 주소를 알려 준다', async () => {
  const DB = { prepare: sql => ({ bind: () => ({ first: async () => ({ n: 0, last: null }) }), first: async () => (sql.includes('SELECT 1') ? { one: 1 } : null) }) };
  const h = await (await health.GET({ env: { DB, HUB_URL: HUB } })).json();
  assert.deepEqual([h.auth, h.hubLogin, h.passwordSet, h.passwordSource], ['hub', HUB + '/?login=1', true, 'hub']);
  const p = await (await health.GET({ env: { DB } })).json();
  assert.equal(p.auth, 'password');
});

test('fill: 허브가 내 도메인 아래이고 D1 모드일 때만 HUB_URL을 넣는다', () => {
  assert.equal(parseHubLine('허브 주소: https://hub.woongstudio.com\n- 설명'), HUB);
  assert.equal(parseHubLine('허브 주소: (아직 없음)'), null);
  const base = { hub: HUB, domain: 'woongstudio.com', host: 'gym.woongstudio.com', d1: true };
  assert.equal(hubUrlFor(base), HUB);
  assert.equal(hubUrlFor({ ...base, d1: false }), null);                                  // Supabase 모드
  assert.equal(hubUrlFor({ ...base, domain: null, host: null }), null);                  // 내 도메인 없음
  assert.equal(hubUrlFor({ ...base, hub: 'https://hub.tedcheon.workers.dev' }), null);   // 쿠키를 같이 못 씀
  assert.equal(hubUrlFor({ ...base, host: 'hub.woongstudio.com' }), null);                // 허브 자신
  const t = 'name = "gym"\n[assets]\ndirectory = "./web"\n';
  const a = setHubToml(t, HUB);
  assert.deepEqual(parseToml(a).tables.vars, { HUB_URL: HUB });
  assert.equal(setHubToml(a, HUB), a);
  assert.equal(setHubToml(a, null), t);
  assert.deepEqual(parseToml(setHubToml(t + '[vars]\nX = "1"\n', HUB)).tables.vars, { HUB_URL: HUB, X: '1' });
});
