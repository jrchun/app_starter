// 배포된 사이트를 검사한다. 사용법: node scripts/check_site.mjs https://my-app.<계정>.workers.dev
// 화면·API·D1 연결·편집 암호 보호를 확인하고, 하나라도 실패하면 종료 코드 1.
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) { console.error('사이트 주소를 넣어 주세요. 예: node scripts/check_site.mjs https://my-app.me.workers.dev'); process.exit(2); }

const checks = [];
async function check(name, fn) {
  try { const note = await fn(); checks.push([true, name, note || '']); }
  catch (e) { checks.push([false, name, e.message]); }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await check('첫 화면', async () => {
  const r = await fetch(base + '/'); expect(r.ok, 'HTTP ' + r.status);
  expect((r.headers.get('content-type') || '').includes('text/html'), 'HTML이 아님');
});
await check('API·D1 연결 (/api/health)', async () => {
  const r = await fetch(base + '/api/health'); const j = await r.json().catch(() => ({}));
  expect(r.ok && j.db, 'D1에 연결되지 않음: HTTP ' + r.status + ' ' + JSON.stringify(j));
  return j.writeTokenSet ? '편집 암호 설정됨' : '경고: 편집 암호(WRITE_TOKEN)가 아직 없음 — 저장이 모두 막힌다';
});
await check('문서 읽기 (/api/doc)', async () => {
  const r = await fetch(base + '/api/doc'); const j = await r.json(); expect(r.ok && 'version' in j, 'HTTP ' + r.status);
  return 'version ' + j.version;
});
await check('암호 없이 저장하면 거절', async () => {
  const r = await fetch(base + '/api/doc', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{"doc":{},"version":0}' });
  expect(r.status === 401, '401이어야 하는데 ' + r.status);
});
await check('없는 주소는 404', async () => {
  const r = await fetch(base + '/no-such-page-' + Date.now()); expect(r.status === 404, 'HTTP ' + r.status);
});

for (const [ok, name, note] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${note ? ' — ' + note : ''}`);
process.exit(checks.every(c => c[0]) ? 0 : 1);
