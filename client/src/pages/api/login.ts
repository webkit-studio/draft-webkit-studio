/* Přihlášení. Odpověď je vždy stejná bez ohledu na to, jestli e-mail
   existuje - ať se přes formulář nedá zjistit, kdo má účet. */

import type { APIRoute } from 'astro';
import { verifyPassword, newSessionToken, tokenId, sessionCookie, SESSION_DAYS } from '../../lib/auth';
import { logRequest } from '../../lib/db';
import { getDb } from '../../lib/env';

/* Cíl po přihlášení musí zůstat uvnitř aplikace - jinak by šlo formulářem
   poslat člověka na cizí web. */
function safeNext(raw: string | null): string {
  if (!raw) return '/client/dashboard';
  if (!raw.startsWith('/client')) return '/client/dashboard';
  if (raw.startsWith('//')) return '/client/dashboard';
  return raw;
}

export const POST: APIRoute = async ({ request }) => {
  const db = getDb();
  const form = await request.formData();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const password = String(form.get('password') || '');
  const next = safeNext(String(form.get('next') || ''));

  const fail = () =>
    new Response(null, {
      status: 303,
      headers: { Location: '/client/login?e=1', 'Cache-Control': 'no-store' }
    });

  if (!db) return fail();
  if (!email || !password) return fail();

  const row = await db.prepare(`SELECT id, password_hash FROM users WHERE email = ?1`)
    .bind(email)
    .first<{ id: string; password_hash: string }>();

  if (!row) {
    await logRequest(db, { method: 'POST', path: '/api/login', status: 303, note: 'neznamy email' });
    return fail();
  }

  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) {
    await logRequest(db, { method: 'POST', path: '/api/login', status: 303, userId: row.id, note: 'spatne heslo' });
    return fail();
  }

  const token = newSessionToken();
  const id = await tokenId(token);
  const maxAge = SESSION_DAYS * 24 * 60 * 60;

  await db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent)
     VALUES (?1, ?2, datetime('now', ?3), ?4)`
  )
    .bind(id, row.id, `+${SESSION_DAYS} days`, request.headers.get('user-agent')?.slice(0, 200) ?? null)
    .run();

  await logRequest(db, { method: 'POST', path: '/api/login', status: 303, userId: row.id, note: 'prihlasen' });

  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      'Set-Cookie': sessionCookie(token, maxAge),
      'Cache-Control': 'no-store'
    }
  });
};
