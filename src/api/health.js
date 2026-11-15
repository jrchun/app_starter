// GET /api/health → {ok, db, passwordSet, ...}
// 배포 확인(scripts/check_site.mjs)과 화면(편집 암호를 "정하기"로 보여 줄지)이 쓴다.
import { json, passwordState, MIN_PASSWORD } from '../lib/http.js';

export async function GET({ env }) {
  // Supabase 모드: D1이 없다. DB는 Supabase가 맡고, 여기서는 Worker가 살아 있는지만 알린다.
  if (!env.DB) return json({ ok: true, db: null, mode: 'supabase' });
  let db = false;
  try { db = (await env.DB.prepare('SELECT 1 AS one').first())?.one === 1; } catch { db = false; }
  const pw = db ? await passwordState(env) : { set: false, source: null };
  // writeTokenSet은 예전 이름(passwordSet과 같은 값). 예전 check_site.mjs를 쓰는 앱을 위해 남겨 둔다.
  return json({ ok: true, db, passwordSet: pw.set, passwordSource: pw.source, passwordMinLength: MIN_PASSWORD, writeTokenSet: pw.set }, db ? 200 : 503);
}
