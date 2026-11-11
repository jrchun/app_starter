// GET /api/health → {ok, db} : 배포 확인용(scripts/check_site.mjs가 쓴다).
import { json } from '../lib/http.js';

export async function GET({ env }) {
  let db = false;
  try { db = (await env.DB.prepare('SELECT 1 AS one').first())?.one === 1; } catch { db = false; }
  return json({ ok: true, db, writeTokenSet: Boolean(env.WRITE_TOKEN) }, db ? 200 : 503);
}
