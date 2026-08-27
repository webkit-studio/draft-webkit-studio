/* Komentáře. Každá operace prochází přes requireProject z access.ts -
 * bez RLS je to jediná záruka, že se klient nedostane k cizímu projektu.
 *
 * Rozdíl proti Supabase: prohlížeč tu nedrží žádný databázový klíč a nikdy
 * neposílá author_id ani project přímo do zápisu - autora bere server ze
 * session, projekt se ověřuje proti přístupům. */

import type { APIRoute } from 'astro';
import { requireProject, canEditComment, canDeleteComment, accessResponse, AccessError } from '../../lib/access';
import { displayName, logRequest } from '../../lib/db';
import { getDb } from '../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

interface Row {
  id: string; project: string; version: string; view: string; section: string;
  x: number | null; y: number | null; parent_id: string | null;
  author_id: string; author_name: string; body: string; resolved: number; created_at: string;
}

const shape = (r: Row) => ({
  id: r.id, project: r.project, version: r.version, view: r.view, section: r.section,
  x: r.x, y: r.y, parentId: r.parent_id, authorId: r.author_id, authorName: r.author_name,
  body: r.body, resolved: r.resolved === 1, createdAt: r.created_at
});

/* GET /api/comments?project=&version= - vlákna projektu a verze */
export const GET: APIRoute = async ({ url, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);
  try {
    const project = url.searchParams.get('project') || '';
    const version = url.searchParams.get('version') || '';
    requireProject(locals.user, project);
    if (!version) throw new AccessError('bad-request', 400);

    const res = await db
      .prepare(
        `SELECT * FROM comments WHERE project = ?1 AND version = ?2 ORDER BY created_at ASC`
      )
      .bind(project, version)
      .all<Row>();

    return json({ comments: res.results.map(shape) });
  } catch (e) {
    return accessResponse(e);
  }
};

/* POST /api/comments - nový komentář nebo odpověď */
export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);
  try {
    const b = (await request.json().catch(() => null)) as any;
    if (!b) throw new AccessError('bad-request', 400);

    const project = String(b.project || '');
    const user = requireProject(locals.user, project);

    const body = String(b.body || '').trim();
    if (!body) throw new AccessError('empty-body', 400);
    if (body.length > 5000) throw new AccessError('body-too-long', 400);

    const version = String(b.version || '');
    const view = b.view === 'mobile' ? 'mobile' : 'desktop';
    const section = String(b.section || '');
    if (!version || !section) throw new AccessError('bad-request', 400);

    /* Odpověď musí patřit do stejného projektu - jinak by šlo přes parent_id
       přivěsit komentář k cizímu vláknu. */
    const parentId = b.parentId ? String(b.parentId) : null;
    if (parentId) {
      const parent = await db
        .prepare(`SELECT project FROM comments WHERE id = ?1`)
        .bind(parentId)
        .first<{ project: string }>();
      if (!parent) throw new AccessError('parent-not-found', 404);
      if (parent.project !== project) throw new AccessError('parent-other-project', 400);
    }

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO comments (id, project, version, view, section, x, y, parent_id, author_id, author_name, body)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`
      )
      .bind(
        id, project, version, view, section,
        parentId ? null : Number(b.x ?? 0),
        parentId ? null : Number(b.y ?? 0),
        parentId, user.id, displayName(user), body
      )
      .run();

    const row = await db.prepare(`SELECT * FROM comments WHERE id = ?1`).bind(id).first<Row>();
    await logRequest(db, { method: 'POST', path: '/api/comments', status: 201, userId: user.id, note: `${project}/${version}` });
    return json({ comment: shape(row!) }, 201);
  } catch (e) {
    return accessResponse(e);
  }
};

/* PATCH /api/comments - úprava textu (jen autor) nebo vyřešení (kdokoli
   s přístupem, tak to bylo i dřív) */
export const PATCH: APIRoute = async ({ request, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);
  try {
    const b = (await request.json().catch(() => null)) as any;
    const id = String(b?.id || '');
    if (!id) throw new AccessError('bad-request', 400);

    const row = await db.prepare(`SELECT * FROM comments WHERE id = ?1`).bind(id).first<Row>();
    if (!row) throw new AccessError('not-found', 404);

    const user = requireProject(locals.user, row.project);

    if (typeof b.body === 'string') {
      if (!canEditComment(user, row.author_id)) throw new AccessError('not-author', 403);
      const text = b.body.trim();
      if (!text) throw new AccessError('empty-body', 400);
      await db.prepare(`UPDATE comments SET body = ?1 WHERE id = ?2`).bind(text, id).run();
    }

    if (typeof b.resolved === 'boolean') {
      await db.prepare(`UPDATE comments SET resolved = ?1 WHERE id = ?2`).bind(b.resolved ? 1 : 0, id).run();
    }

    const updated = await db.prepare(`SELECT * FROM comments WHERE id = ?1`).bind(id).first<Row>();
    return json({ comment: shape(updated!) });
  } catch (e) {
    return accessResponse(e);
  }
};

/* DELETE /api/comments?id= - jen admin, odpovědi bere kaskáda */
export const DELETE: APIRoute = async ({ url, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);
  try {
    const id = url.searchParams.get('id') || '';
    if (!id) throw new AccessError('bad-request', 400);

    const row = await db.prepare(`SELECT project FROM comments WHERE id = ?1`).bind(id).first<{ project: string }>();
    if (!row) throw new AccessError('not-found', 404);

    const user = requireProject(locals.user, row.project);
    if (!canDeleteComment(user)) throw new AccessError('admin-only', 403);

    await db.prepare(`DELETE FROM comments WHERE id = ?1`).bind(id).run();
    await logRequest(db, { method: 'DELETE', path: '/api/comments', status: 204, userId: user.id, note: id });
    return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return accessResponse(e);
  }
};
