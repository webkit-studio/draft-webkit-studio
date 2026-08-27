/* Vlastní účet. Každý přihlášený smí měnit jen svoje jméno a svoje heslo -
 * cizí účty patří do sekce Správa a hlídá je middleware.
 *
 * Heslo tu je schválně: uložené heslo přečíst nelze, je to jednosměrný hash.
 * Kdo si ho pamatuje, přepíše si ho sám; komu ho zapomněl, tomu admin
 * vygeneruje nové. Jinou cestou se k němu nikdo nedostane. */

import type { APIRoute } from 'astro';
import { hashPassword, verifyPassword, SESSION_COOKIE } from '../../lib/auth';
import { logRequest } from '../../lib/db';
import { getDb } from '../../lib/env';
import { tokenId } from '../../lib/auth';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

export const POST: APIRoute = async ({ request, locals, cookies }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const me = locals.user!;
  const body = (await request.json().catch(() => null)) as
    | { akce?: string; firstName?: string; lastName?: string; current?: string; next?: string }
    | null;
  if (!body) return json({ error: 'bad-request' }, 400);

  if (body.akce === 'jmeno') {
    const first = String(body.firstName || '').trim();
    const last = String(body.lastName || '').trim();
    if (first.length > 80 || last.length > 80) return json({ error: 'name-too-long' }, 400);

    await db
      .prepare(`UPDATE users SET first_name = ?1, last_name = ?2, updated_at = datetime('now') WHERE id = ?3`)
      .bind(first || null, last || null, me.id)
      .run();

    await logRequest(db, { method: 'POST', path: '/api/account', status: 200, userId: me.id, note: 'zmena jmena' });
    return json({ firstName: first || null, lastName: last || null });
  }

  if (body.akce === 'heslo') {
    const current = String(body.current || '');
    const next = String(body.next || '');
    if (next.length < 12) return json({ error: 'password-too-short' }, 400);

    const row = await db
      .prepare(`SELECT password_hash FROM users WHERE id = ?1`)
      .bind(me.id)
      .first<{ password_hash: string }>();
    if (!row) return json({ error: 'not-found' }, 404);
    if (!(await verifyPassword(current, row.password_hash))) return json({ error: 'wrong-password' }, 403);

    await db
      .prepare(`UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2`)
      .bind(await hashPassword(next), me.id)
      .run();

    /* Nové heslo ukončí ostatní session, ale tuhle ne - jinak by se člověk
       odhlásil sám sobě hned po změně vlastního hesla. */
    const token = cookies.get(SESSION_COOKIE)?.value;
    if (token) {
      await db
        .prepare(`DELETE FROM sessions WHERE user_id = ?1 AND id != ?2`)
        .bind(me.id, await tokenId(token))
        .run();
    } else {
      await db.prepare(`DELETE FROM sessions WHERE user_id = ?1`).bind(me.id).run();
    }

    await logRequest(db, { method: 'POST', path: '/api/account', status: 200, userId: me.id, note: 'zmena hesla' });
    return json({ ok: true });
  }

  return json({ error: 'unknown-action' }, 400);
};
