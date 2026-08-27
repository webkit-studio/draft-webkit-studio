/* Hrdlo pro oprávnění.
 *
 * Na Supabase to hlídala databáze přes RLS. Tady RLS není, takže záruka je
 * jen tak dobrá, jak důsledně tudy všechno projde. Pravidlo: žádná stránka
 * ani API sáhne na data projektu jinak než přes tyhle funkce.
 *
 * Testy v tests/ na to míří přímo - zkoušejí se dostat k cizímu projektu
 * z prohlížeče přihlášeného klienta. */

import type { D1Database } from '@cloudflare/workers-types';
import type { SessionUser } from './db';

export class AccessError extends Error {
  status: number;
  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

/* Má uživatel přístup k projektu? Admin ke všem, klient jen k přiděleným.
   Seznam se plní v userFromToken při každém požadavku, takže odebrání
   platí okamžitě. */
export function canAccess(user: SessionUser, project: string): boolean {
  if (user.role === 'admin') return true;
  return user.projects.includes(project);
}

/* Vyhodí, když nesmí. Volající tím nemusí řešit větvení a nemůže na kontrolu
   omylem zapomenout - buď zavolá tohle, nebo data nedostane. */
export function requireProject(user: SessionUser | null, project: string): SessionUser {
  if (!user) throw new AccessError('unauthorized', 401);
  if (!project) throw new AccessError('bad-request', 400);
  if (!canAccess(user, project)) throw new AccessError('forbidden', 403);
  return user;
}

export function requireAdmin(user: SessionUser | null): SessionUser {
  if (!user) throw new AccessError('unauthorized', 401);
  if (user.role !== 'admin') throw new AccessError('forbidden', 403);
  return user;
}

/* Komentář smí upravit jen autor (a admin). Stejné pravidlo jako mělo
   comments_guard_update na Supabase - tam ho držel databázový trigger. */
export function canEditComment(user: SessionUser, authorId: string): boolean {
  return user.role === 'admin' || user.id === authorId;
}

/* Mazat smí jen admin. Klient vlákna uklízí přes "Vyřešeno". */
export function canDeleteComment(user: SessionUser): boolean {
  return user.role === 'admin';
}

/* Existuje projekt vůbec? Chrání před tím, aby přístup "prošel" na slug,
   který nikdy nevznikl. */
export async function projectExists(db: D1Database, slug: string): Promise<boolean> {
  const row = await db.prepare(`SELECT 1 AS x FROM projects WHERE slug = ?1`).bind(slug).first();
  return !!row;
}

export function accessResponse(err: unknown): Response {
  const status = err instanceof AccessError ? err.status : 500;
  const message = err instanceof AccessError ? err.message : 'server-error';
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}
