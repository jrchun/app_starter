// GET /api/health → {ok, db} : 배포 확인용(scripts/check_site.mjs가 쓴다).
import { json, passwordState } from '../lib/http.js';

export async function GET({ env }) {
  // Supabase 모드: D1이 없다. DB는 Supabase가 맡고, 여기서는 Worker가 살아 있는지만 알린다.
  if (!env.DB) return json({ ok: true, db: null, mode: 'supabase' });
  let db = false;
  try { db = (await env.DB.prepare('SELECT 1 AS one').first())?.one === 1; } catch { db = false; }
  const pw = db ? await passwordState(env) : { set: false, source: null };
  // passwordSet: 편집 암호가 정해졌는가(화면이 "암호 정하기"를 보여 줄지 정한다). writeTokenSet은 예전 이름(같은 값).
  return json({ ok: true, db, passwordSet: pw.set, passwordSource: pw.source, writeTokenSet: pw.set }, db ? 200 : 503);
}
