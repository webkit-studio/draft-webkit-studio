/* Správa uživatelů. Roli admina hlídá middleware, tady se kontroluje ještě
   jednou - kdyby se někdy změnilo směrování, nesmí to otevřít zápis komukoli.
 *
 * Heslo se nikdy neukládá čitelně. Vygenerované se vrátí v odpovědi jedinkrát
 * a dál žije jen v prohlížeči admina do zavření stránky. */

import type { APIRoute } from 'astro';
import { hashPassword, generatePassword } from '../../../lib/auth';
import { logRequest } from '../../../lib/db';
import { getDb } from '../../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i;

/* Slugy, které patří systémovým stránkám - projekt se tak jmenovat nesmí,
   jinak by přebil /client/dashboard nebo /client/login. */
export const RESERVED_SLUGS = new Set(['login', 'dashboard', 'admin', 'api', 'settings', 'logout', 'setup']);

export const GET: APIRoute = async () => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const users = await db
    .prepare(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
              (SELECT group_concat(project_slug) FROM project_access WHERE user_id = u.id) AS projects
         FROM users u ORDER BY u.role DESC, u.email`
    )
    .all<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string; projects: string | null }>();

  const projects = await db
    .prepare(`SELECT slug, name FROM projects ORDER BY sort, name`)
    .all<{ slug: string; name: string }>();

  return json({
    users: users.results.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.first_name,
      lastName: u.last_name,
      role: u.role,
      projects: u.projects ? u.projects.split(',') : []
    })),
    projects: projects.results
  });
};

/* Založení účtu. Vzniká vždy bez role a bez přístupů - admina lze povýšit
   jen zásahem do databáze, přístupy se zaškrtávají až potom. */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const body = (await request.json().catch(() => null)) as
    | { email?: string; firstName?: string; lastName?: string }
    | null;
  if (!body) return json({ error: 'bad-request' }, 400);

  const email = String(body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'invalid-email' }, 400);

  const exists = await db.prepare(`SELECT 1 FROM users WHERE email = ?1`).bind(email).first();
  if (exists) return json({ error: 'email-exists' }, 409);

  const id = crypto.randomUUID();
  const password = generatePassword();
  const hash = await hashPassword(password);

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
       VALUES (?1, ?2, ?3, ?4, ?5, 'client')`
    )
    .bind(
      id,
      email,
      hash,
      String(body.firstName || '').trim() || null,
      String(body.lastName || '').trim() || null
    )
    .run();

  await logRequest(db, {
    method: 'POST',
    path: '/api/admin/users',
    status: 201,
    userId: locals.user?.id ?? null,
    note: `zalozen ucet ${email}`
  });

  return json({ id, email, password }, 201);
};

/* Smazání účtu. Tři pojistky, všechny proti nevratné chybě:
   - sám sebe smazat nejde, admin by si zavřel dveře;
   - cizího admina taky ne, ten se ruší zásahem do databáze stejně, jako se
     admin povyšuje;
   - a účet, který po sobě nechal komentáře, se nemaže vůbec. Komentáře na
     autora odkazují cizím klíčem bez kaskády, takže by to stejně spadlo na
     databázi - a hlavně: připomínky ke grafice mají cenu i potom, co člověk
     z projektu odejde. Místo mazání se takovému účtu odeberou přístupy.
   Session a přidělené přístupy odejdou kaskádou. */
export const DELETE: APIRoute = async ({ url, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const me = locals.user!;
  const id = String(url.searchParams.get('id') || '');
  if (!id) return json({ error: 'bad-request' }, 400);
  if (id === me.id) return json({ error: 'cannot-delete-self' }, 400);

  const target = await db
    .prepare(`SELECT id, email, role FROM users WHERE id = ?1`)
    .bind(id)
    .first<{ id: string; email: string; role: string }>();
  if (!target) return json({ error: 'not-found' }, 404);
  if (target.role === 'admin') return json({ error: 'cannot-delete-admin' }, 403);

  const kom = await db
    .prepare(`SELECT COUNT(*) AS n FROM comments WHERE author_id = ?1`)
    .bind(id)
    .first<{ n: number }>();
  const pocet = Number(kom?.n ?? 0);
  if (pocet > 0) return json({ error: 'has-comments', pocet }, 409);

  await db.prepare(`DELETE FROM users WHERE id = ?1`).bind(id).run();

  await logRequest(db, {
    method: 'DELETE',
    path: '/api/admin/users',
    status: 200,
    userId: me.id,
    note: `smazan ucet ${target.email}`
  });

  return json({ id, smazano: true });
};
