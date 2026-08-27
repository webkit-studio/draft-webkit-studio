/* Jednorázové založení databáze - po krocích.
 *
 * Proč po krocích: Webflow Cloud vytvoří prázdnou D1 a schéma do ní jinak
 * nikdo nedostane. První verze dělala všechno v jednom požadavku - schéma,
 * projekty i dvě hesla. PBKDF2 je záměrně drahý, a když request narazí na
 * limit Workeru, spojení se ukončí a v prohlížeči zbyde jen "nepodařilo se
 * spojit se serverem", což neřekne nic. Každý krok je proto samostatný
 * požadavek, který o sobě řekne, jak dopadl a jak dlouho trval.
 *
 * Pojistky zůstávají: všechno chce token shodný se SESSION_SECRET a účet se
 * nepřepisuje, když už existuje. Kroky jsou idempotentní - schéma s
 * IF NOT EXISTS, projekty s INSERT OR IGNORE - takže opakované spuštění
 * nic nerozbije. */

import type { APIRoute } from 'astro';
import { hashPassword, generatePassword } from '../../lib/auth';
import { getEnv } from '../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

const SCHEMA: [string, string][] = [
  ['users', `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
     first_name TEXT, last_name TEXT,
     role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin','client')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')))`],
  ['sessions', `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL, user_agent TEXT)`],
  ['sessions_idx', `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`],
  ['projects', `CREATE TABLE IF NOT EXISTS projects (
     slug TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT,
     sort INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')))`],
  ['project_access', `CREATE TABLE IF NOT EXISTS project_access (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
     granted_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, project_slug))`],
  ['comments', `CREATE TABLE IF NOT EXISTS comments (
     id TEXT PRIMARY KEY,
     project TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
     version TEXT NOT NULL,
     view TEXT NOT NULL CHECK (view IN ('desktop','mobile')),
     section TEXT NOT NULL, x REAL, y REAL,
     parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES users(id),
     author_name TEXT NOT NULL, body TEXT NOT NULL,
     resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
     created_at TEXT NOT NULL DEFAULT (datetime('now')))`],
  ['comments_idx', `CREATE INDEX IF NOT EXISTS comments_project_version_idx ON comments (project, version, created_at)`],
  ['request_log', `CREATE TABLE IF NOT EXISTS request_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT (datetime('now')),
     method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL,
     user_id TEXT, note TEXT)`]
];

const PROJECTS: [string, string, number][] = [
  ['anse', 'Anse', 10],
  ['arbosis', 'Arbosis', 20],
  ['crr', 'Centrum pro regionální rozvoj', 30],
  ['elektro-drapac', 'Elektro Drapač', 40],
  ['mirek-slavicek', 'Mirek Slavíček', 50],
  ['omedetou', 'Omedetou', 60],
  ['vymysli', 'Vymysli.cz', 70]
];

const UCTY: Record<string, { email: string; first: string; last: string; role: 'admin' | 'client' }> = {
  admin: { email: 'lukas@webkit.studio', first: 'Lukáš', last: 'Svoboda', role: 'admin' },
  klient: { email: 'test@webkit.studio', first: 'Testovací', last: 'Uživatel', role: 'client' }
};

export const KROKY = ['schema', 'projekty', 'admin', 'klient'];

/* Porovnání v konstantním čase, ať se token nedá uhádat po znacích. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const GET: APIRoute = async ({ url, request }) => {
  const env = getEnv();
  if (!env.DB) return json({ error: 'Databáze není připojená.' }, 503);

  const secret = env.SESSION_SECRET || '';
  if (!secret) return json({ error: 'SESSION_SECRET není nastavený.' }, 503);

  /* Token může přijít hlavičkou (nic se nepřepisuje) nebo adresou, kde se
     "+" z Base64 čte jako mezera - proto se zkoušejí obě podoby. */
  const raw = request.headers.get('x-setup-token') || url.searchParams.get('token') || '';
  if (![raw, raw.replace(/ /g, '+')].some((t) => sameString(t, secret))) {
    return json({ error: 'Neplatný token.', napoveda: 'Musí přesně odpovídat proměnné SESSION_SECRET.' }, 403);
  }

  const krok = url.searchParams.get('krok') || 'stav';
  const db = env.DB;
  const t0 = Date.now();
  const konec = (data: Record<string, unknown>, status = 200) =>
    json({ krok, ...data, trvalo_ms: Date.now() - t0 }, status);

  try {
    if (krok === 'stav') {
      const t = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`).first();
      const pocet = t ? await db.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>() : null;
      return konec({ schema: !!t, uzivatelu: pocet ? Number(pocet.n) : 0, kroky: KROKY });
    }

    if (krok === 'schema') {
      const hotove: string[] = [];
      for (const [jmeno, sql] of SCHEMA) {
        await db.prepare(sql).run();
        hotove.push(jmeno);
      }
      return konec({ hotovo: true, vytvoreno: hotove });
    }

    if (krok === 'projekty') {
      await db.batch(
        PROJECTS.map(([slug, name, sort]) =>
          db.prepare(`INSERT OR IGNORE INTO projects (slug, name, sort) VALUES (?1, ?2, ?3)`).bind(slug, name, sort)
        )
      );
      const n = await db.prepare(`SELECT COUNT(*) AS n FROM projects`).first<{ n: number }>();
      return konec({ hotovo: true, projektu: Number(n?.n ?? 0) });
    }

    if (krok === 'admin' || krok === 'klient') {
      const u = UCTY[krok];
      const uz = await db.prepare(`SELECT id FROM users WHERE email = ?1`).bind(u.email).first();
      if (uz) return konec({ hotovo: true, preskoceno: true, email: u.email, poznamka: 'Účet už existuje.' });

      const id = crypto.randomUUID();
      const password = generatePassword();
      const hash = await hashPassword(password);
      await db
        .prepare(
          `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(id, u.email, hash, u.first, u.last, u.role)
        .run();

      if (u.role === 'client') {
        await db
          .prepare(`INSERT OR IGNORE INTO project_access (user_id, project_slug) VALUES (?1, 'arbosis')`)
          .bind(id)
          .run();
      }

      return konec({ hotovo: true, email: u.email, role: u.role, heslo: password });
    }

    return konec({ error: 'Neznámý krok.', kroky: KROKY }, 400);
  } catch (e: any) {
    return konec(
      {
        error: 'Krok selhal.',
        detail: String((e && e.message) || e).slice(0, 400),
        poznamka: 'Kroky jsou idempotentní – je bezpečné to spustit znovu.'
      },
      500
    );
  }
};
