/* Přidělení přístupů k projektům.
 *
 * Přístupy se čtou při každém požadavku, takže odebrání platí okamžitě -
 * nečeká se na nové přihlášení, jak to bylo u JWT na Supabase.
 *
 * Adminovi se přístupy nenastavují: vidí všechno z definice role, a ukládat
 * mu je do vazební tabulky by jen svádělo k domněnce, že ho omezují. */

import type { APIRoute } from 'astro';
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
  const body = (await request.json().catch(() => null)) as
    | { userId?: string; projects?: unknown }
    | null;

  const userId = String(body?.userId || '');
  if (!userId) return json({ error: 'bad-request' }, 400);
  if (!Array.isArray(body?.projects)) return json({ error: 'projects-must-be-array' }, 400);

  const wanted = [...new Set(body.projects.map((p) => String(p)))];

  const target = await db
    .prepare(`SELECT id, email, role FROM users WHERE id = ?1`)
    .bind(userId)
    .first<{ id: string; email: string; role: string }>();
  if (!target) return json({ error: 'not-found' }, 404);
  if (target.role === 'admin') return json({ error: 'admin-has-all' }, 400);

  /* jen existující projekty - překlep nesmí založit přístup k ničemu */
  const known = await db.prepare(`SELECT slug FROM projects`).all<{ slug: string }>();
  const valid = new Set(known.results.map((r) => r.slug));
  const bad = wanted.filter((s) => !valid.has(s));
  if (bad.length) return json({ error: 'unknown-project', detail: bad }, 400);

  const stmts = [db.prepare(`DELETE FROM project_access WHERE user_id = ?1`).bind(userId)];
  for (const slug of wanted) {
    stmts.push(
      db.prepare(`INSERT INTO project_access (user_id, project_slug) VALUES (?1, ?2)`).bind(userId, slug)
    );
  }
  await db.batch(stmts);

  await logRequest(db, {
    method: 'POST',
    path: '/api/admin/access',
    status: 200,
    userId: me.id,
    note: `pristupy ${target.email}: ${wanted.join(',') || 'zadne'}`
  });

  return json({ projects: wanted });
};
