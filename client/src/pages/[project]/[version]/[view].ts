/* Prohlížeč návrhu.
 *
 * Vrací původní HTML prohlížeče, jen s vyměněnou lištou a napojením -
 * plátno zůstává byte za bytem stejné. Proto to není .astro stránka:
 * kdyby to prošlo šablonou, Astro by do markupu sáhlo. */

import type { APIRoute } from 'astro';
import { requireProject, AccessError } from '../../../lib/access';
import { displayName } from '../../../lib/db';
import { getDb } from '../../../lib/env';
import { hasVersion } from '../../../lib/versions';
import { renderViewer, hasViewer } from '../../../lib/viewer';

export const prerender = false;

const text = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' }
  });

export const GET: APIRoute = async ({ params, locals }) => {
  const project = String(params.project || '');
  const version = String(params.version || '');
  const view = String(params.view || '');

  let user;
  try {
    user = requireProject(locals.user, project);
  } catch (e) {
    const status = e instanceof AccessError ? e.status : 500;
    const kdo = locals.user ? locals.user.email : 'nepřihlášený';
    return text(`Nemáte přístup k projektu „${project}“.\n\nPřihlášen: ${kdo}`, status);
  }

  if (view !== 'desktop' && view !== 'mobile') return text('Neznámý pohled.', 404);
  if (!hasVersion(project, version)) return text('Tato verze neexistuje.', 404);
  if (!hasViewer(project, version, view)) return text('Prohlížeč pro tuto verzi zatím není.', 404);

  /* Projekt musi existovat i v databazi - jinak by sel prohlizec otevrit
     u projektu, ktery byl mezitim smazany. */
  const db = getDb();
  if (db) {
    const row = await db.prepare(`SELECT 1 AS x FROM projects WHERE slug = ?1`).bind(project).first();
    if (!row) return text('Projekt neexistuje.', 404);
  }

  const html = renderViewer({
    project,
    version,
    view,
    userId: user.id,
    userName: displayName(user),
    isAdmin: user.role === 'admin'
  });

  if (!html) return text('Prohlížeč se nepodařilo sestavit.', 500);

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
};
