/* Vygenerování nového hesla uživateli.
 *
 * Uložené heslo přečíst nelze - je to jednosměrný hash. Admin ho tedy může
 * jen přepsat novým a to pak jednou ukázat. Stejné pravidlo jako dřív:
 * heslo jinému adminovi měnit nesmí, jen sám sobě.
 *
 * Změna hesla zneplatní všechny jeho session - kdo se vydával za něj,
 * okamžitě vypadne. */

import type { APIRoute } from 'astro';
import { hashPassword, generatePassword } from '../../../lib/auth';
import { logRequest } from '../../../lib/db';
import { getDb } from '../../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const me = locals.user!;
  const body = (await request.json().catch(() => null)) as { userId?: string } | null;
  const userId = String(body?.userId || '');
  if (!userId) return json({ error: 'bad-request' }, 400);

  const target = await db
    .prepare(`SELECT id, email, role FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ id: string; email: string; role: string }>();

  if (!target) return json({ error: 'not-found' }, 404);
  if (target.role === 'admin' && target.id !== me.id) return json({ error: 'forbidden' }, 403);

  const password = generatePassword();
  const hash = await hashPassword(password);

  await db
    .prepare(`UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2`)
    .bind(hash, userId)
    .run();

  /* nové heslo = staré session končí */
  await db.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(userId).run();

  await logRequest(db, {
    method: 'POST',
    path: '/api/admin/password',
    status: 200,
    userId: me.id,
    note: `nove heslo pro ${target.email}`
  });

  return json({ password });
};
