/* Přístup k D1 a načtení přihlášeného uživatele.
 *
 * Bez RLS rozhoduje o oprávněních výhradně serverová vrstva. Proto tu není
 * žádná funkce, která by vracela data bez kontroly - dotazy na komentáře
 * i projekty vždycky procházejí přes access.ts. */

import type { D1Database } from '@cloudflare/workers-types';
import { tokenId } from './auth';

export interface SessionUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: 'admin' | 'client';
  /* slugy projektů, ke kterým má přístup; admin má všechny */
  projects: string[];
}

/* Jméno pro UI: "Lukáš S." */
export function displayName(u: Pick<SessionUser, 'firstName' | 'lastName' | 'email'>): string {
  const first = (u.firstName || '').trim();
  const last = (u.lastName || '').trim();
  if (first && last) return `${first} ${last.charAt(0)}.`;
  if (first) return first;
  return u.email;
}

/* Iniciála do avataru. Bere se z křestního jména, protože tak se lidé
   poznávají; bez jména padá na e-mail, ať tam nikdy nezůstane prázdno. */
export function initial(u: Pick<SessionUser, 'firstName' | 'lastName' | 'email'>): string {
  const zdroj = (u.firstName || '').trim() || (u.lastName || '').trim() || u.email;
  return zdroj.charAt(0).toLocaleUpperCase('cs');
}

/* Celé jméno pro nastavení a seznamy - tam zkratka příjmení nedává smysl. */
export function fullName(u: Pick<SessionUser, 'firstName' | 'lastName' | 'email'>): string {
  const cele = [(u.firstName || '').trim(), (u.lastName || '').trim()].filter(Boolean).join(' ');
  return cele || u.email;
}

export async function userFromToken(db: D1Database, token: string): Promise<SessionUser | null> {
  const id = await tokenId(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.id = ?1 AND s.expires_at > datetime('now')`
    )
    .bind(id)
    .first<{ id: string; email: string; first_name: string | null; last_name: string | null; role: string }>();

  if (!row) return null;

  const role = row.role === 'admin' ? 'admin' : 'client';

  /* Admin vidí všechno, klient jen přidělené. Načítá se při každém požadavku,
     takže odebrání přístupu platí okamžitě - ne až po novém přihlášení, jak
     to bylo u JWT. */
  const projects = role === 'admin'
    ? (await db.prepare(`SELECT slug FROM projects ORDER BY sort, name`).all<{ slug: string }>())
        .results.map((r) => r.slug)
    : (await db
        .prepare(`SELECT project_slug AS slug FROM project_access WHERE user_id = ?1`)
        .bind(row.id)
        .all<{ slug: string }>()
      ).results.map((r) => r.slug);

  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role,
    projects
  };
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare(`DELETE FROM sessions WHERE id = ?1`).bind(await tokenId(token)).run();
}

/* Vlastní log požadavků. Bez těl, bez hesel - jen co, kam, s jakým výsledkem.
   Selhání logu nesmí shodit požadavek. */
export async function logRequest(
  db: D1Database | undefined,
  entry: { method: string; path: string; status: number; userId?: string | null; note?: string }
): Promise<void> {
  if (!db) return;
  try {
    await db
      .prepare(`INSERT INTO request_log (method, path, status, user_id, note) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(entry.method, entry.path, entry.status, entry.userId ?? null, entry.note ?? null)
      .run();
  } catch {
    /* log je diagnostika, ne provoz */
  }
}
