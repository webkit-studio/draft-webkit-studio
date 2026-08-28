/* Správa projektů. Tabulka projects je zdroj pravdy pro rozcestník i pro
 * kontrolu přístupu, takže se sem smí jen admin - hlídá middleware.
 *
 * Smazání ruší jen záznam a přidělené přístupy. Komentáře odejdou kaskádou,
 * ale složka s návrhem v repu zůstává - soubory maže člověk, ne aplikace. */

import type { APIRoute } from 'astro';
import { logRequest } from '../../../lib/db';
import { getDb } from '../../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

/* Slug je kus adresy: /client/<slug>. Musí projít i jako název složky. */
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/* Systémové cesty - projekt s takovým slugem by přebil vlastní stránku
   aplikace, protože statická routa vyhrává nad dynamickou [project]. */
const REZERVOVANE = new Set([
  'login', 'logout', 'dashboard', 'admin', 'api', 'settings', 'setup', 'assets', '_astro'
]);

export const GET: APIRoute = async () => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const res = await db
    .prepare(
      `SELECT p.slug, p.name, p.subtitle, p.sort,
              (SELECT COUNT(*) FROM project_access a WHERE a.project_slug = p.slug) AS users,
              (SELECT COUNT(*) FROM comments c WHERE c.project = p.slug) AS comments
         FROM projects p ORDER BY p.sort, p.name`
    )
    .all<{ slug: string; name: string; subtitle: string | null; sort: number; users: number; comments: number }>();

  return json({ projects: res.results });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const me = locals.user!;
  const body = (await request.json().catch(() => null)) as
    | { akce?: string; slug?: string; name?: string; subtitle?: string; sort?: number }
    | null;
  if (!body) return json({ error: 'bad-request' }, 400);

  const slug = String(body.slug || '').trim().toLowerCase();

  if (body.akce === 'pridat') {
    if (!SLUG_RE.test(slug)) return json({ error: 'invalid-slug' }, 400);
    if (REZERVOVANE.has(slug)) return json({ error: 'reserved-slug' }, 400);

    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'name-required' }, 400);

    const uz = await db.prepare(`SELECT 1 FROM projects WHERE slug = ?1`).bind(slug).first();
    if (uz) return json({ error: 'slug-exists' }, 409);

    /* Nový projekt jde na konec seznamu. */
    const max = await db.prepare(`SELECT COALESCE(MAX(sort), 0) AS m FROM projects`).first<{ m: number }>();
    const sort = Number(max?.m ?? 0) + 10;

    await db
      .prepare(`INSERT INTO projects (slug, name, subtitle, sort) VALUES (?1, ?2, ?3, ?4)`)
      .bind(slug, name, String(body.subtitle || '').trim() || null, sort)
      .run();

    await logRequest(db, { method: 'POST', path: '/api/admin/projects', status: 201, userId: me.id, note: `zalozen projekt ${slug}` });
    return json({ slug, name, sort }, 201);
  }

  if (body.akce === 'upravit') {
    const uz = await db.prepare(`SELECT 1 FROM projects WHERE slug = ?1`).bind(slug).first();
    if (!uz) return json({ error: 'not-found' }, 404);

    const name = String(body.name || '').trim();
    if (!name) return json({ error: 'name-required' }, 400);

    /* Slug se nemění: visí na něm přístupy, komentáře i adresa, kterou už
       možná někdo má v záložkách. Přejmenování je založení nového projektu. */
    await db
      .prepare(`UPDATE projects SET name = ?1, subtitle = ?2 WHERE slug = ?3`)
      .bind(name, String(body.subtitle || '').trim() || null, slug)
      .run();

    await logRequest(db, { method: 'POST', path: '/api/admin/projects', status: 200, userId: me.id, note: `upraven projekt ${slug}` });
    return json({ slug, name });
  }

  if (body.akce === 'smazat') {
    const uz = await db.prepare(`SELECT 1 FROM projects WHERE slug = ?1`).bind(slug).first();
    if (!uz) return json({ error: 'not-found' }, 404);

    await db.prepare(`DELETE FROM projects WHERE slug = ?1`).bind(slug).run();

    await logRequest(db, { method: 'POST', path: '/api/admin/projects', status: 200, userId: me.id, note: `smazan projekt ${slug}` });
    return json({ slug, smazano: true });
  }

  return json({ error: 'unknown-action' }, 400);
};
