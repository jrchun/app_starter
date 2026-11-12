// scripts/cf_mcp.mjs: wrangler.toml 읽기·채우기, 묶음 만들기, MCP에 넘길 코드가 문법적으로 맞는지. 실행: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { parseToml, readConfig, fillToml, collectBundle, renderPrepare, renderDeploy, renderStatus, renderConnect, subdomainCandidates } from '../scripts/cf_mcp.mjs';
import { bundledAssets } from '../src/lib/bundled_assets.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const parses = code => assert.doesNotThrow(() => new vm.Script('(' + code + ')'));

test('wrangler.toml 읽기', () => {
  const c = readConfig(ROOT);
  assert.equal(c.main, './src/worker.js');
  assert.equal(c.assetsDir, './web');
  assert.equal(c.d1.binding, 'DB');
  assert.deepEqual(c.crons, ['30 22 * * *']);
  const t = parseToml('a = "x" # 주석\n[vars]\nK = "v"\n[[d1_databases]]\nid = "1"\n[[d1_databases]]\nid = "2"\n');
  assert.deepEqual(t, { top: { a: 'x' }, tables: { vars: { K: 'v' } }, arrays: { d1_databases: [{ id: '1' }, { id: '2' }] } });
});

test('fill: 이름과 D1 ID만 바꾸고 나머지는 그대로', () => {
  const src = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
  const out = fillToml(src, { name: 'gym-log', databaseId: 'abc-123' });
  assert.match(out, /^name = "gym-log"$/m);
  assert.match(out, /^database_name = "gym-log"$/m);
  assert.match(out, /^database_id = "abc-123"$/m);
  assert.equal(out.split('\n').length, src.split('\n').length);
  const noD1 = 'name = "my-app"\nmain = "./src/worker.js"\n';
  assert.equal(fillToml(noD1, { name: 'x' }), 'name = "x"\nmain = "./src/worker.js"\n');
});

test('묶음: Worker 모듈 전부 + web 파일 전부 + 진입 파일', () => {
  const b = collectBundle(ROOT);
  for (const m of ['worker.js', 'jobs.js', 'api/doc.js', 'lib/http.js', 'lib/bundled_assets.js', '__mcp_entry.js']) assert.ok(b.modules[m], m);
  for (const w of ['index.html', 'styles.css', 'js/app.js']) assert.ok(b.texts['__web/' + w], w);
  const entry = b.modules['__mcp_entry.js'];
  assert.match(entry, /import app from '\.\/worker\.js'/);
  assert.match(entry, /"\/index\.html": \[a\d+, "text\/html; charset=utf-8"\]/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfmcp-'));
  fs.writeFileSync(path.join(dir, 'entry.mjs'), entry);
  execFileSync(process.execPath, ['--check', path.join(dir, 'entry.mjs')]);
});

test('그림 등 이진 파일은 base64로 묶는다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfmcp-'));
  fs.mkdirSync(path.join(dir, 'src/lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'web'));
  fs.writeFileSync(path.join(dir, 'src/worker.js'), 'export default {}');
  fs.copyFileSync(path.join(ROOT, 'src/lib/bundled_assets.js'), path.join(dir, 'src/lib/bundled_assets.js'));
  fs.writeFileSync(path.join(dir, 'web/icon.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(dir, 'web/.assetsignore'), 'x');
  fs.writeFileSync(path.join(dir, 'wrangler.toml'), 'name = "t"\nmain = "./src/worker.js"\n[assets]\ndirectory = "./web"\n');
  const b = collectBundle(dir);
  assert.equal(b.binaries['__web/icon.png'], 'iVBORw==');
  assert.equal(Object.keys(b.texts).length, 0);
  assert.match(b.modules['__mcp_entry.js'], /"\/icon\.png": \[a\d+, "image\/png"\]/);
});

test('MCP에 넘길 코드는 문법이 맞고 필요한 값을 담는다', () => {
  const config = { ...readConfig(ROOT), name: 'gym-log', d1: { binding: 'DB', name: 'gym-log', id: 'id-1' }, vars: { SUPABASE_URL: 'u' } };
  const deploy = renderDeploy(config, collectBundle(ROOT, config));
  parses(deploy);
  assert.match(deploy, /"type":"d1","name":"DB","id":"id-1"/);
  assert.match(deploy, /"type":"plain_text","name":"SUPABASE_URL","text":"u"/);
  assert.match(deploy, /"keep_bindings":\["secret_text","secret_key"\]/);
  assert.match(deploy, /const CRONS = \["30 22 \* \* \*"\]/);
  const prep = renderPrepare({ name: 'gym-log', schema: 'CREATE TABLE IF NOT EXISTS t (x);', wantD1: true });
  parses(prep);
  assert.match(prep, /primary_location_hint: "apac"/);
  parses(renderStatus(config));
});

test('bundledAssets: /는 index.html, 없는 주소는 404, 형식 유지', async () => {
  const A = bundledAssets({ '/index.html': ['<h1>hi</h1>', 'text/html; charset=utf-8'], '/a/b.css': ['x{}', 'text/css; charset=utf-8'] });
  const get = async p => A.fetch(new Request('https://x.test' + p));
  const home = await get('/');
  assert.equal(await home.text(), '<h1>hi</h1>');
  assert.equal(home.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal((await get('/index')).status, 200);
  assert.equal((await get('/a/b.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await get('/nope')).status, 404);
});

test('connect: 저장소 연결 코드는 문법이 맞고 번호·이름·배포 명령을 담는다', () => {
  const code = renderConnect({ name: 'gym-log', owner: 'me', repo: 'gym-log', ownerId: 123, repoId: 456, compatibilityDate: '2026-11-01' });
  parses(code);
  assert.match(code, /OWNER_ID = "123", REPO_ID = "456"/);
  assert.match(code, /deploy_command: "npx wrangler deploy"/);
  assert.match(code, /previews_enabled: false/);
  assert.match(code, /branch: "main"/);
});

test('connect: GitHub 번호가 없으면 만들지 않고 방법을 알려 준다', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfmcp-'));
  fs.cpSync(ROOT, dir, { recursive: true, filter: s => !/node_modules|\.git$|\.wrangler/.test(s) });
  fs.writeFileSync(path.join(dir, 'wrangler.toml'), fs.readFileSync(path.join(dir, 'wrangler.toml'), 'utf8').replace('name = "my-app"', 'name = "gym-log"'));
  let err = '';
  try { execFileSync(process.execPath, ['scripts/cf_mcp.mjs', 'connect'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { err = e.stderr; }
  assert.match(err, /search\/repositories/);
  const out = execFileSync(process.execPath, ['scripts/cf_mcp.mjs', 'connect', '--github-account-id', '1', '--github-repo-id', '2', '--repo', 'me/gym-log'], { cwd: dir, encoding: 'utf8' });
  assert.match(out, /\.wrangler\/mcp\/connect\.js/);
  parses(fs.readFileSync(path.join(dir, '.wrangler/mcp/connect.js'), 'utf8'));
});

test('하위 도메인 후보: 소문자·하이픈으로 맞추고 여러 개를 준비한다', () => {
  assert.deepEqual(subdomainCandidates('JRchun_X', () => '123'), ['jrchun-x', 'jrchun-x-apps', 'jrchun-x-app', 'jrchun-x-123']);
  assert.equal(subdomainCandidates('', () => '1')[0], 'apps');
});

test('prepare: 하위 도메인은 없을 때만 만든다(있으면 PUT하지 않음)', () => {
  const code = renderPrepare({ name: 'gym-log', schema: 'SELECT 1;', wantD1: false, subdomains: ['me', 'me-apps'] });
  parses(code);
  assert.match(code, /const SUBDOMAIN_CANDIDATES = \["me","me-apps"\]/);
  const putAt = code.indexOf('method: "PUT"'), guardAt = code.indexOf('if (!sub) {');
  assert.ok(guardAt > 0 && putAt > guardAt, 'PUT은 if (!sub) 안에 있어야 한다');
});
