// Worker 라우팅과 편집 암호(가짜 D1·정적 자산으로 확인). 실행: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { canWrite, hashPassword, verifyPassword } from '../src/lib/http.js';

// 이 앱이 쓰는 SQL만 흉내 내는 가짜 D1. settings(편집 암호)는 실제처럼 기억한다.
// usage: usage_log 행 목록(ts 문자열). null이면 그 표 질의가 실패하는 것으로 흉내 낸다.
function fakeEnv({ token = 'secret', row = null, changes = 1, settings = {}, usage = [] } = {}) {
  const log = [], store = { ...settings };
  const run = (sql, args) => {
    log.push([sql, args]);
    if (sql.startsWith('INSERT OR IGNORE INTO settings')) {
      if (store[args[0]]) return { meta: { changes: 0 } };
      store[args[0]] = args[1]; return { meta: { changes: 1 } };
    }
    return { meta: { changes } };
  };
  const first = (sql, args) => {
    if (sql.includes('SELECT 1')) return { one: 1 };
    if (sql.includes('FROM settings')) return store[args[0]] ? { value: store[args[0]] } : null;
    if (sql.includes('FROM usage_log')) {
      if (!usage) throw new Error('no such table: usage_log');
      return { n: usage.filter(ts => ts >= args[0]).length, last: usage.length ? [...usage].sort().at(-1) : null };
    }
    return row;
  };
  const prepare = sql => ({
    bind: (...args) => ({ first: async () => first(sql, args), run: async () => run(sql, args) }),
    first: async () => first(sql, []),
  });
  const env = { DB: { prepare }, ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } };
  if (token) env.WRITE_TOKEN = token;
  return { log, store, env };
}
const req = (path, init) => new Request('https://x.test' + path, init);
const put = (env, auth, version = 3) => worker.fetch(req('/api/doc', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify({ doc: { a: 2 }, version }) }), env);
const claim = (env, password) => worker.fetch(req('/api/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }), env);

test('정적 파일은 ASSETS로, /api/health는 D1과 편집 암호 상태', async () => {
  const { env } = fakeEnv();
  assert.equal(await (await worker.fetch(req('/'), env)).text(), 'asset');
  const h = await worker.fetch(req('/api/health'), env);
  assert.deepEqual(await h.json(), {
    ok: true, db: true, passwordSet: true, passwordSource: 'secret', passwordMinLength: 6, writeTokenSet: true,
    starter: 1, usage: { last30d: 0, lastUsedAt: null }, auth: 'password',
  });
});

test('/api/health 사용량(허브용): 최근 30일 건수와 마지막 기록 시각', async () => {
  const day = 86400000, iso = ms => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
  const now = Date.now();
  const usage = [iso(now - 40 * day), iso(now - 10 * day), iso(now - 2 * day), iso(now - 60000)];
  const { env } = fakeEnv({ usage });
  const j = await (await worker.fetch(req('/api/health'), env)).json();
  assert.deepEqual(j.usage, { last30d: 3, lastUsedAt: usage[3] });
  // 예전 필드는 그대로(예전 check_site.mjs·화면이 읽는다)
  for (const k of ['ok', 'db', 'passwordSet', 'passwordSource', 'passwordMinLength', 'writeTokenSet']) assert.ok(k in j, k);
  assert.equal(j.starter, 1);
});

test('/api/health: 사용량 질의가 실패해도 health는 200, usage는 null', async () => {
  const { env } = fakeEnv({ usage: null });
  const h = await worker.fetch(req('/api/health'), env);
  assert.equal(h.status, 200);
  const j = await h.json();
  assert.equal(j.db, true);
  assert.equal(j.usage, null);
});

test('/api/health Supabase 모드(D1 없음): starter는 있고 usage는 null', async () => {
  const h = await worker.fetch(req('/api/health'), { ASSETS: { fetch: async () => new Response('') } });
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { ok: true, db: null, mode: 'supabase', starter: 1, usage: null });
});

test('편집 암호(대시보드 Secret): 없거나 틀리면 401, 맞으면 저장', async () => {
  const { env, log } = fakeEnv({ row: { body: '{"a":1}', version: 3 } });
  assert.equal((await put(env)).status, 401);
  assert.equal((await put(env, 'wrong')).status, 401);
  const ok = await put(env, 'secret');
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { version: 4 });
  assert.match(log[0][0], /UPDATE doc/);
});

test('편집 암호를 사이트에서 처음 정하기: 한 번만 되고, 정한 암호로 저장된다', async () => {
  const { env, store } = fakeEnv({ token: null, row: { body: '{"a":1}', version: 3 } });
  assert.equal((await put(env, 'anything')).status, 401);
  assert.equal((await (await worker.fetch(req('/api/health'), env)).json()).passwordSet, false);
  assert.equal((await claim(env, '123')).status, 422);           // 너무 짧음
  assert.equal((await claim(env, 'x'.repeat(201))).status, 422); // 너무 김
  assert.equal((await claim(env, 'my-pass-1')).status, 201);
  assert.ok(!store.write_hash.includes('my-pass-1'));             // 원문은 저장하지 않는다
  assert.equal((await claim(env, 'other-pass')).status, 409);    // 두 번째는 거절
  assert.equal((await put(env, 'other-pass')).status, 401);
  assert.equal((await put(env, 'my-pass-1')).status, 200);
  const h = await (await worker.fetch(req('/api/health'), env)).json();
  assert.equal(h.passwordSet, true); assert.equal(h.passwordSource, 'site');
});

test('대시보드 Secret이 있으면 사이트에서 정할 수 없고, Secret이 우선한다', async () => {
  const { env } = fakeEnv({ settings: { write_hash: await hashPassword('site-pass') } });
  assert.equal((await claim(env, 'new-pass-1')).status, 409);
  assert.equal(await canWrite(req('/', { headers: { Authorization: 'Bearer site-pass' } }), env), false);
  assert.equal(await canWrite(req('/', { headers: { Authorization: 'Bearer secret' } }), env), true);
});

test('암호 해시: 소금이 달라도 맞는 암호만 통과', async () => {
  const h1 = await hashPassword('abcdef'), h2 = await hashPassword('abcdef');
  assert.notEqual(h1, h2);
  assert.equal(await verifyPassword('abcdef', h1), true);
  assert.equal(await verifyPassword('abcdeg', h1), false);
  assert.equal(await verifyPassword('abcdef', 'broken'), false);
});

test('다른 기기에서 먼저 저장했으면 409와 최신 문서', async () => {
  const { env } = fakeEnv({ row: { body: '{"a":9}', version: 5 }, changes: 0 });
  const r = await put(env, 'secret', 4);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { doc: { a: 9 }, version: 5 });
});

test('편집 암호가 아무 데도 없으면 쓰기를 모두 막는다', async () => {
  const { env } = fakeEnv({ token: null });
  assert.equal(await canWrite(req('/api/doc', { headers: { Authorization: 'Bearer ' } }), env), false);
  assert.equal(await canWrite(req('/api/doc', { headers: { Authorization: 'Bearer x' } }), {}), false);
});

test('허용하지 않는 요청 방식은 405, Supabase 모드(D1 없음)에서는 /api/password가 없다', async () => {
  const { env } = fakeEnv();
  assert.equal((await worker.fetch(req('/api/doc', { method: 'DELETE' }), env)).status, 405);
  const noDb = { ASSETS: { fetch: async () => new Response('asset', { status: 404 }) } };
  assert.equal((await claim(noDb, 'my-pass-1')).status, 404);
});

test('문서 크기는 바이트로 잰다(한글은 글자당 3바이트)', async () => {
  const { env } = fakeEnv({ row: { body: '{}', version: 1 } });
  const big = '가'.repeat(90 * 1024); // 글자 수는 한도(256K)보다 작지만 바이트는 넘는다
  const r = await worker.fetch(req('/api/doc', { method: 'PUT', headers: { Authorization: 'Bearer secret' }, body: JSON.stringify({ doc: { big }, version: 1 }) }), env);
  assert.equal(r.status, 413);
});

test('서버 오류는 안내 문구만 보여 주고 내부 내용은 감춘다', async () => {
  const env = { WRITE_TOKEN: 'secret', DB: { prepare: () => { throw new Error('비밀 내부 정보'); } }, ASSETS: { fetch: async () => new Response('') } };
  const errs = []; const orig = console.error; console.error = (...a) => errs.push(a);
  try {
    const r = await worker.fetch(req('/api/doc'), env);
    assert.equal(r.status, 500);
    assert.doesNotMatch(await r.text(), /비밀 내부 정보/);
    assert.ok(errs.length > 0); // 내용은 로그에 남는다
  } finally { console.error = orig; }
});
