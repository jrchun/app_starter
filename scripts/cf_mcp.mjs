// Cloudflare MCP(https://mcp.cloudflare.com/mcp, 브라우저 로그인)만으로 준비·배포한다. API 토큰이 필요 없다.
// 이 스크립트는 Cloudflare에 직접 접속하지 않는다. MCP의 execute 도구에 넘길 코드를 파일로 만들어 줄 뿐이다.
// AI는 만들어진 파일 내용을 그대로 execute의 code로 넘기고, 돌아온 결과를 읽는다.
//
//   node scripts/cf_mcp.mjs prepare --name <앱이름> [--subdomain <이름>]
//                                                     D1 찾기·만들기(apac), db/schema.sql 적용, workers.dev 하위 도메인 확인
//                                                     (계정에 하위 도메인이 없을 때만 GitHub 아이디 등으로 새로 만든다. 있으면 절대 바꾸지 않는다)
//   node scripts/cf_mcp.mjs fill --name <앱이름> [--database-id <ID>]   wrangler.toml에 이름과 D1 ID를 채운다(파일만 고침)
//   node scripts/cf_mcp.mjs deploy                    Worker 올리기(web/ 포함), 예약 작업 시각, workers.dev 켜기
//   node scripts/cf_mcp.mjs status                    배포 시각, 예약 작업, Git 자동 배포(Workers Builds) 최근 결과
//   node scripts/cf_mcp.mjs connect --github-account-id <번호> --github-repo-id <번호> [--repo 소유자/이름]
//                                                     Cloudflare가 저장소를 가져가 자동 배포하게 연결하고 첫 빌드 시작
//                                                     (번호: gh api -X GET search/repositories -f q='repo:소유자/이름')
//
// 코드 파일은 기본으로 .wrangler/mcp/<명령>.js에 생긴다(--out으로 바꿀 수 있다. .wrangler/는 커밋하지 않는다).
// 계정이 여러 개면 execute를 부를 때 account_id를 함께 넘긴다.
//
// deploy가 web/를 Worker 안에 묶는 이유: MCP는 요청마다 로그인 정보를 붙여서, 업로드 전용 임시 토큰을 쓰는
// 정적 자산 업로드 API를 쓸 수 없다. 그래서 web/ 파일을 모듈로 묶고 src/lib/bundled_assets.js가 env.ASSETS를 흉내 낸다.
// 저장소 코드는 그대로이며, Git 자동 배포(wrangler deploy)가 돌면 원래의 정적 자산 구성으로 바뀐다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const PLACEHOLDER_ID = '__D1_DATABASE_ID__';
export const MAX_MCP_BYTES = 100 * 1024; // 이보다 크면 AI가 한 번에 넘기기 어렵다(Supabase 모드는 라이브러리 때문에 넘는다)

const TEXT_TYPES = {
  html: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8', js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8', svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8', md: 'text/markdown; charset=utf-8', xml: 'application/xml',
  webmanifest: 'application/manifest+json', map: 'application/json; charset=utf-8',
};
const BINARY_TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', ico: 'image/x-icon',
  avif: 'image/avif', woff: 'font/woff', woff2: 'font/woff2', pdf: 'application/pdf',
};

// wrangler.toml에서 이 틀이 쓰는 모양만 읽는다: key = "문자열" | 숫자 | true/false | ["문자열", ...], [표], [[표 배열]].
export function parseToml(text) {
  const out = { top: {}, tables: {}, arrays: {} };
  let cur = out.top;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/^#.*$/, '').trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^\[\[([\w.-]+)\]\]$/))) { (out.arrays[m[1]] ||= []).push(cur = {}); continue; }
    if ((m = line.match(/^\[([\w.-]+)\]$/))) { cur = out.tables[m[1]] ||= {}; continue; }
    if ((m = line.match(/^([\w-]+)\s*=\s*(.+)$/))) cur[m[1]] = parseValue(m[2]);
  }
  return out;
}
function parseValue(v) {
  v = v.trim();
  if (v.startsWith('"')) return JSON.parse(v);
  if (v.startsWith('[')) return JSON.parse(v);
  if (v === 'true' || v === 'false') return v === 'true';
  return Number(v);
}

export function readConfig(root = ROOT) {
  const cfg = parseToml(fs.readFileSync(path.join(root, 'wrangler.toml'), 'utf8'));
  const d1 = (cfg.arrays.d1_databases || [])[0] || null;
  return {
    name: cfg.top.name,
    main: cfg.top.main || './src/worker.js',
    compatibilityDate: cfg.top.compatibility_date,
    compatibilityFlags: cfg.top.compatibility_flags || [],
    assetsDir: cfg.tables.assets?.directory || null,
    d1: d1 && { binding: d1.binding, name: d1.database_name, id: d1.database_id },
    crons: cfg.tables.triggers ? cfg.tables.triggers.crons || [] : null,
    vars: cfg.tables.vars || {},
  };
}

// wrangler.toml의 name, database_name, database_id를 바꾼 글을 돌려준다(다른 줄과 주석은 그대로).
export function fillToml(text, { name, databaseId }) {
  const set = (t, key, value) => t.replace(new RegExp(`^(${key}\\s*=\\s*)"[^"]*"`, 'm'), (_, a) => `${a}"${value}"`);
  let t = set(text, 'name', name);
  if (/^\[\[d1_databases\]\]/m.test(t)) {
    t = set(t, 'database_name', name);
    if (databaseId) t = set(t, 'database_id', databaseId);
  }
  return t;
}

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out.sort();
}
const posix = p => p.split(path.sep).join('/');

// Worker 코드 모듈과 web/ 파일을 묶고, env.ASSETS를 흉내 내는 진입 파일을 만든다.
export function collectBundle(root = ROOT, config = readConfig(root)) {
  const mainAbs = path.resolve(root, config.main);
  const mainDir = path.dirname(mainAbs);
  const modules = {};
  for (const f of walk(mainDir)) if (/\.m?js$/.test(f)) modules[posix(path.relative(mainDir, f))] = fs.readFileSync(f, 'utf8');
  const mainRel = posix(path.relative(mainDir, mainAbs));
  const helperRel = posix(path.relative(mainDir, path.join(root, 'src/lib/bundled_assets.js')));
  if (!modules[helperRel]) throw new Error('src/lib/bundled_assets.js가 Worker 코드 폴더 안에 없습니다.');

  const texts = {}, binaries = {}, table = [];
  if (config.assetsDir) {
    const dir = path.resolve(root, config.assetsDir);
    walk(dir).forEach((f, i) => {
      const rel = posix(path.relative(dir, f));
      if (rel.split('/').some(s => s.startsWith('.'))) return; // .assetsignore 등 숨은 파일은 올리지 않는다
      const ext = path.extname(f).slice(1).toLowerCase();
      const mod = `__web/${rel}`;
      if (TEXT_TYPES[ext]) { texts[mod] = fs.readFileSync(f, 'utf8'); table.push([i, rel, mod, TEXT_TYPES[ext]]); }
      else { binaries[mod] = fs.readFileSync(f).toString('base64'); table.push([i, rel, mod, BINARY_TYPES[ext] || 'application/octet-stream']); }
    });
  }
  const entry = [
    '// cf_mcp.mjs가 만든 배포용 진입 파일. web/ 파일을 묶어 env.ASSETS로 넘긴다.',
    `import app from './${mainRel}';`,
    `import { bundledAssets } from './${helperRel}';`,
    ...table.map(([i, , mod]) => `import a${i} from './${mod}';`),
    'const ASSETS = bundledAssets({',
    ...table.map(([i, rel, , type]) => `  ${JSON.stringify('/' + rel)}: [a${i}, ${JSON.stringify(type)}],`),
    '});',
    'const withAssets = env => { const e = Object.create(env); e.ASSETS = ASSETS; return e; };',
    'export default {',
    '  fetch: (req, env, ctx) => app.fetch(req, withAssets(env), ctx),',
    '  scheduled: (c, env, ctx) => app.scheduled ? app.scheduled(c, withAssets(env), ctx) : undefined,',
    '};',
    '',
  ].join('\n');
  modules['__mcp_entry.js'] = entry;
  return { mainModule: '__mcp_entry.js', modules, texts, binaries };
}

const j = v => JSON.stringify(v);

// workers.dev 하위 도메인 후보. 계정당 하나이고 전 세계에서 겹치면 안 되므로 몇 개를 차례로 시도한다.
export function subdomainCandidates(base, rand = () => String(Math.floor(100 + Math.random() * 900))) {
  const clean = String(base || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
  const b = clean || 'apps';
  return [...new Set([b, `${b}-apps`, `${b}-app`, `${b}-${rand()}`, `${b}-${rand()}`])];
}

// 저장소 주인(GitHub 아이디)과 이름. git 원격 주소에서 읽는다.
export function repoFromGit(root = ROOT) {
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
    const [owner, repo] = url.replace(/\.git$/, '').split(/[/:]/).slice(-2);
    return owner && repo ? { owner, repo } : null;
  } catch { return null; }
}

export function renderPrepare({ name, schema, wantD1, subdomains = subdomainCandidates('') }) {
  return `async () => {
// cf_mcp.mjs prepare: D1 찾기·만들기, 스키마 적용, workers.dev 하위 도메인 확인(없을 때만 새로 만듦)
const NAME = ${j(name)}, WANT_D1 = ${j(wantD1)};
const SUBDOMAIN_CANDIDATES = ${j(subdomains)};
const SCHEMA = ${j(schema)};
const out = { account_id: accountId, name: NAME };
if (WANT_D1) {
  const base = \`/accounts/\${accountId}/d1/database\`;
  const list = await cloudflare.request({ method: "GET", path: base, query: { name: NAME } });
  let db = list.result.find(d => d.name === NAME);
  out.d1_created = !db;
  if (!db) db = (await cloudflare.request({ method: "POST", path: base, body: { name: NAME, primary_location_hint: "apac" } })).result;
  const q = await cloudflare.request({ method: "POST", path: \`\${base}/\${db.uuid}/query\`, body: { sql: SCHEMA } });
  out.database_id = db.uuid;
  out.schema_statements = q.result.length;
}
const subPath = \`/accounts/\${accountId}/workers/subdomain\`;
let sub = null;
try { sub = (await cloudflare.request({ method: "GET", path: subPath })).result?.subdomain || null; } catch (e) { sub = null; }
if (!sub) {
  // 처음 쓰는 계정: 하위 도메인이 없을 때만 만든다(있으면 기존 앱 주소가 바뀌므로 절대 바꾸지 않는다).
  out.subdomain_tries = [];
  for (const c of SUBDOMAIN_CANDIDATES) {
    try {
      sub = (await cloudflare.request({ method: "PUT", path: subPath, body: { subdomain: c } })).result?.subdomain || c;
      out.subdomain_created = true;
      break;
    } catch (e) { out.subdomain_tries.push(c + ": " + String(e.message || e).slice(0, 120)); }
  }
}
if (sub) {
  out.subdomain = sub;
  out.url = \`https://\${NAME}.\${sub}.workers.dev\`;
} else {
  out.subdomain = null;
  out.subdomain_note = "하위 도메인을 만들지 못했습니다(후보가 모두 사용 중이거나 권한 없음). prepare --subdomain <다른 이름>으로 다시 실행하세요.";
}
return out;
}`;
}

export function renderDeploy(config, bundle) {
  const bindings = [];
  if (config.d1) bindings.push({ type: 'd1', name: config.d1.binding, id: config.d1.id });
  for (const [k, v] of Object.entries(config.vars)) bindings.push({ type: 'plain_text', name: k, text: String(v) });
  const metadata = {
    main_module: bundle.mainModule,
    compatibility_date: config.compatibilityDate,
    ...(config.compatibilityFlags.length ? { compatibility_flags: config.compatibilityFlags } : {}),
    bindings,
    keep_bindings: ['secret_text', 'secret_key'], // 편집 암호(WRITE_TOKEN) 등 사람이 넣은 비밀은 유지
  };
  return `async () => {
// cf_mcp.mjs deploy: Worker 올리기(web/ 포함), 예약 작업 시각, workers.dev 켜기
const NAME = ${j(config.name)};
const METADATA = ${j(metadata)};
const CRONS = ${j(config.crons)};
const MODULES = ${j(bundle.modules)};
const TEXTS = ${j(bundle.texts)};
const BINARIES = ${j(bundle.binaries)};
const script = \`/accounts/\${accountId}/workers/scripts/\${NAME}\`;
const form = new FormData();
form.append("metadata", new Blob([JSON.stringify(METADATA)], { type: "application/json" }));
for (const [n, c] of Object.entries(MODULES)) form.append(n, new Blob([c], { type: "application/javascript+module" }), n);
for (const [n, c] of Object.entries(TEXTS)) form.append(n, new Blob([c], { type: "text/plain" }), n);
for (const [n, b] of Object.entries(BINARIES)) form.append(n, new Blob([Uint8Array.from(atob(b), ch => ch.charCodeAt(0))], { type: "application/octet-stream" }), n);
const up = (await cloudflare.request({ method: "PUT", path: script, body: form })).result;
const out = { name: NAME, uploaded: up.modified_on || true };
if (CRONS) out.crons = (await cloudflare.request({ method: "PUT", path: \`\${script}/schedules\`, body: CRONS.map(cron => ({ cron })) })).result.schedules.map(s => s.cron);
await cloudflare.request({ method: "POST", path: \`\${script}/subdomain\`, body: { enabled: true, previews_enabled: false } });
const sub = (await cloudflare.request({ method: "GET", path: \`/accounts/\${accountId}/workers/subdomain\` })).result.subdomain;
out.url = \`https://\${NAME}.\${sub}.workers.dev\`;
return out;
}`;
}

export function renderStatus(config) {
  return `async () => {
// cf_mcp.mjs status: 배포 시각, 예약 작업, 대시보드 편집 암호 유무, Git 자동 배포(Workers Builds) 최근 결과
const NAME = ${j(config.name)};
const script = \`/accounts/\${accountId}/workers/scripts/\${NAME}\`;
const out = { name: NAME };
const list = (await cloudflare.request({ method: "GET", path: \`/accounts/\${accountId}/workers/scripts\` })).result;
const w = list.find(s => s.id === NAME);
if (!w) return { ...out, exists: false, note: "이 이름의 Worker가 없습니다." };
out.exists = true; out.modified_on = w.modified_on; out.has_assets = w.has_assets;
out.crons = (await cloudflare.request({ method: "GET", path: \`\${script}/schedules\` })).result.schedules.map(s => s.cron);
const settings = (await cloudflare.request({ method: "GET", path: \`\${script}/settings\` })).result;
out.dashboard_secret_set = (settings.bindings || []).some(b => b.name === "WRITE_TOKEN"); // 사이트에서 정한 편집 암호는 D1에 있다(check_site로 확인)
try {
  const r = (await cloudflare.request({ method: "GET", path: \`/accounts/\${accountId}/builds/builds/latest\`, query: { external_script_ids: w.tag } })).result;
  const b = r && (r.builds ? r.builds[w.tag] : r[w.tag]);
  out.git_build = b ? { status: b.status, outcome: b.build_outcome, branch: b.build_trigger_metadata?.branch, commit: b.build_trigger_metadata?.commit_hash, created_on: b.created_on } : "Git 연결(Workers Builds) 기록 없음";
} catch (e) {
  out.git_build = "확인 불가: 커넥터에 Workers CI 읽기 권한이 없음(재연결 때 workers-ci.read 허용 필요)";
}
return out;
}`;
}

// connect: Workers Builds API로 "만들기 › GitHub"를 대신한다. 필요한 것: 커넥터의 Workers CI 쓰기 권한,
// 이 GitHub 계정에 Cloudflare 앱 설치(계정당 처음 한 번은 사람이 대시보드에서), 기존 배포용 토큰(build token).
// 하나라도 없으면 ok:false와 이유를 돌려준다. 그때는 사람이 대시보드에서 6-2를 한다.
export function renderConnect({ name, owner, repo, ownerId, repoId, compatibilityDate }) {
  return `async () => {
// cf_mcp.mjs connect: Cloudflare가 GitHub 저장소를 가져가 자동 배포하게 연결하고 첫 빌드를 시작한다
const NAME = ${j(name)}, OWNER = ${j(owner)}, REPO = ${j(repo)}, OWNER_ID = ${j(String(ownerId))}, REPO_ID = ${j(String(repoId))};
const base = \`/accounts/\${accountId}\`;
const out = { name: NAME, repo: OWNER + "/" + REPO };
const fail = (step, note, e) => ({ ...out, ok: false, step, note, error: e ? String(e.message || e).slice(0, 400) : undefined });
let tokens;
try { tokens = (await cloudflare.request({ method: "GET", path: \`\${base}/builds/tokens\` })).result || []; }
catch (e) { return fail("권한", "커넥터에 Workers CI 권한이 없습니다. 사람이 대시보드에서 6-2(만들기 › GitHub)를 하거나, 커넥터를 다시 연결하며 Workers CI 쓰기를 허용하세요.", e); }
if (!tokens.length) return fail("배포용 토큰", "배포용 토큰(build token)이 없습니다. 이 계정의 첫 연결이라 사람이 대시보드에서 6-2를 해야 합니다.");
const token = tokens[0].build_token_uuid;
let w = (await cloudflare.request({ method: "GET", path: \`\${base}/workers/scripts\` })).result.find(s => s.id === NAME);
if (!w) {
  // 연결하려면 Worker가 먼저 있어야 한다. 첫 빌드가 끝나면 진짜 앱으로 바뀌는 자리 표시용 Worker를 만든다.
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify({ main_module: "index.js", compatibility_date: ${j(compatibilityDate)} })], { type: "application/json" }));
  form.append("index.js", new Blob(["export default { fetch: () => new Response('배포 준비 중입니다. 1~2분 뒤 새로고침해 주세요.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }) };"], { type: "application/javascript+module" }), "index.js");
  await cloudflare.request({ method: "PUT", path: \`\${base}/workers/scripts/\${NAME}\`, body: form });
  await cloudflare.request({ method: "POST", path: \`\${base}/workers/scripts/\${NAME}/subdomain\`, body: { enabled: true, previews_enabled: false } });
  w = (await cloudflare.request({ method: "GET", path: \`\${base}/workers/scripts\` })).result.find(s => s.id === NAME);
  out.placeholder_created = true;
}
try {
  await cloudflare.request({ method: "POST", path: \`\${base}/builds/workers\`, body: {
    script_tag: w.tag,
    git_repository: { provider_type: "github", provider_account_id: OWNER_ID, provider_account_name: OWNER, repo_id: REPO_ID, repo_name: REPO, branch: "main" },
    production_settings: { build_command: "", deploy_command: "npx wrangler deploy", build_token_uuid: token, root_directory: "/", path_includes: ["*"], path_excludes: [], build_caching_enabled: false },
    previews_enabled: false,
  } });
} catch (e) { return fail("연결", "저장소 연결에 실패했습니다. GitHub에 Cloudflare 앱이 이 저장소를 볼 수 있게 설치돼 있는지 확인하세요(없으면 사람이 6-2).", e); }
const triggers = (await cloudflare.request({ method: "GET", path: \`\${base}/builds/workers/\${w.tag}/triggers\` })).result || [];
const prod = triggers.find(t => (t.branch_includes || []).includes("main")) || triggers[0];
if (!prod) return fail("빌드", "연결은 됐지만 빌드 설정을 찾지 못했습니다. main에 아무 커밋이나 올리면 빌드가 시작됩니다.");
const b = (await cloudflare.request({ method: "POST", path: \`\${base}/builds/triggers/\${prod.trigger_uuid || prod.uuid}/builds\`, body: { branch: "main" } })).result;
const sub = (await cloudflare.request({ method: "GET", path: \`\${base}/workers/subdomain\` })).result.subdomain;
return { ...out, ok: true, build_uuid: b && b.build_uuid, url: \`https://\${NAME}.\${sub}.workers.dev\`, next: "1~2분 뒤 status로 git_build가 success인지 보고 check_site로 검사" };
}`;
}

function arg(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function writeOut(args, cmd, code) {
  const out = arg(args, '--out') || path.join(ROOT, '.wrangler', 'mcp', `${cmd}.js`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, code);
  console.log(`Cloudflare MCP execute에 넘길 코드: ${path.relative(process.cwd(), out)} (${Buffer.byteLength(code)} bytes)`);
  console.log('이 파일 내용을 그대로 execute의 code로 넘기세요. 계정이 여러 개면 account_id도 함께 넘깁니다.');
  if (Buffer.byteLength(code) > MAX_MCP_BYTES) {
    console.log(`주의: ${Math.round(Buffer.byteLength(code) / 1024)}KB라 MCP로 넘기기에 너무 큽니다. MCP 배포를 건너뛰고 Git 연결로 첫 배포하세요(docs/AGENT_SETUP.md 6-2).`);
  }
}

export function main(args = process.argv.slice(2)) {
  const cmd = args[0];
  const config = readConfig();
  if (cmd === 'prepare') {
    const name = arg(args, '--name') || config.name;
    if (!name || name === 'my-app' || !NAME_RE.test(name)) throw new Error('--name <앱이름>을 정해 주세요(영문 소문자·숫자·하이픈, 예: gym-log).');
    const schema = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8');
    const preferred = arg(args, '--subdomain');
    if (preferred && !NAME_RE.test(preferred)) throw new Error('--subdomain은 영문 소문자·숫자·하이픈만 쓸 수 있습니다.');
    const owner = repoFromGit()?.owner;
    const subdomains = [...new Set([...(preferred ? [preferred] : []), ...subdomainCandidates(owner)])];
    writeOut(args, cmd, renderPrepare({ name, schema, wantD1: Boolean(config.d1), subdomains }));
  } else if (cmd === 'fill') {
    const name = arg(args, '--name');
    if (!name || !NAME_RE.test(name)) throw new Error('--name <앱이름>이 필요합니다.');
    const databaseId = arg(args, '--database-id');
    if (config.d1 && !databaseId && config.d1.id === PLACEHOLDER_ID) throw new Error('D1 모드라 --database-id가 필요합니다(prepare 결과의 database_id).');
    const file = path.join(ROOT, 'wrangler.toml');
    fs.writeFileSync(file, fillToml(fs.readFileSync(file, 'utf8'), { name, databaseId }));
    console.log(`wrangler.toml을 채웠습니다: name=${name}${databaseId ? `, database_id=${databaseId}` : ''}. 커밋·푸시하세요.`);
  } else if (cmd === 'connect') {
    if (!config.name || config.name === 'my-app') throw new Error('먼저 fill로 wrangler.toml의 name을 정하세요.');
    const ownerId = arg(args, '--github-account-id'), repoId = arg(args, '--github-repo-id');
    if (!/^\d+$/.test(ownerId || '') || !/^\d+$/.test(repoId || '')) {
      throw new Error("--github-account-id와 --github-repo-id(숫자)가 필요합니다: gh api -X GET search/repositories -f q='repo:소유자/이름' --jq '.items[0] | {repo_id: .id, owner_id: .owner.id}'");
    }
    let full = arg(args, '--repo');
    if (!full) { const r = repoFromGit(); full = r ? `${r.owner}/${r.repo}` : ''; }
    const [owner, repo] = (full || '').split('/');
    if (!owner || !repo) throw new Error('--repo 소유자/이름을 정해 주세요.');
    writeOut(args, cmd, renderConnect({ name: config.name, owner, repo, ownerId, repoId, compatibilityDate: config.compatibilityDate }));
  } else if (cmd === 'deploy' || cmd === 'status') {
    if (!config.name || config.name === 'my-app') throw new Error('먼저 fill로 wrangler.toml의 name을 정하세요.');
    if (cmd === 'status') return writeOut(args, cmd, renderStatus(config));
    if (config.d1 && (!config.d1.id || config.d1.id === PLACEHOLDER_ID)) throw new Error('wrangler.toml의 database_id가 비어 있습니다. prepare → fill을 먼저 하세요.');
    writeOut(args, cmd, renderDeploy(config, collectBundle(ROOT, config)));
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).slice(0, 15).join('\n'));
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
}
