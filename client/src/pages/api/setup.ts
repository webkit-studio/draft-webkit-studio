/* Jednorázové založení databáze.
 *
 * Webflow Cloud vytvoří prázdnou D1 a schéma do ní nikdo nedostane - z
 * dashboardu se SQL spustit nedá a zvenčí na tu databázi nikdo nevidí.
 * Tohle je tedy jediná cesta, jak ji rozjet.
 *
 * Dvě pojistky, protože endpoint zakládá admin účet:
 *   1) Běží jen na PRÁZDNÉ databázi. Jakmile existuje první uživatel,
 *      vrací 409 a už nikdy nic neudělá.
 *   2) Vyžaduje token shodný se SESSION_SECRET, který zná jen Lukáš.
 *      Samotné "jen když je prázdná" by nestačilo: kdo by adresu uhodl
 *      dřív než on, zmocnil by se prostředí.
 *
 * Hesla se vypíšou jednou v odpovědi a nikde se neukládají. */

import type { APIRoute } from 'astro';
import { hashPassword, generatePassword } from '../../lib/auth';
import { getEnv } from '../../lib/env';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
     first_name TEXT, last_name TEXT,
     role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin','client')),
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS sessions (
     id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL DEFAULT (datetime('now')),
     expires_at TEXT NOT NULL, user_agent TEXT)`,
  `CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id)`,
  `CREATE TABLE IF NOT EXISTS projects (
     slug TEXT PRIMARY KEY, name TEXT NOT NULL, subtitle TEXT,
     sort INTEGER NOT NULL DEFAULT 0,
     created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS project_access (
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
     granted_at TEXT NOT NULL DEFAULT (datetime('now')),
     PRIMARY KEY (user_id, project_slug))`,
  `CREATE TABLE IF NOT EXISTS comments (
     id TEXT PRIMARY KEY,
     project TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
     version TEXT NOT NULL,
     view TEXT NOT NULL CHECK (view IN ('desktop','mobile')),
     section TEXT NOT NULL, x REAL, y REAL,
     parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
     author_id TEXT NOT NULL REFERENCES users(id),
     author_name TEXT NOT NULL, body TEXT NOT NULL,
     resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
     created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS comments_project_version_idx ON comments (project, version, created_at)`,
  `CREATE TABLE IF NOT EXISTS request_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     ts TEXT NOT NULL DEFAULT (datetime('now')),
     method TEXT NOT NULL, path TEXT NOT NULL, status INTEGER NOT NULL,
     user_id TEXT, note TEXT)`
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

/* Porovnání v konstantním čase, ať se token nedá uhádat po znacích. */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export const GET: APIRoute = async ({ url }) => {
  const env = getEnv();
  if (!env.DB) return json({ error: 'Databáze není připojená.' }, 503);

  const secret = env.SESSION_SECRET || '';
  const token = url.searchParams.get('token') || '';
  if (!secret) return json({ error: 'SESSION_SECRET není nastavený.' }, 503);
  if (!sameString(token, secret)) return json({ error: 'Neplatný token.' }, 403);

  /* Pojistka: cokoli už v databázi je, znamená konec. */
  const existing = await env.DB
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .first<{ name: string }>();
  if (existing) {
    const any = await env.DB.prepare(`SELECT 1 AS x FROM users LIMIT 1`).first();
    if (any) return json({ error: 'Databáze už je založená. Tenhle endpoint je tím uzavřený.' }, 409);
  }

  for (const sql of SCHEMA) await env.DB.prepare(sql).run();

  const stmts = PROJECTS.map(([slug, name, sort]) =>
    env.DB!.prepare(`INSERT OR IGNORE INTO projects (slug, name, sort) VALUES (?1, ?2, ?3)`).bind(slug, name, sort)
  );
  await env.DB.batch(stmts);

  const ucty = [
    { email: 'lukas@webkit.studio', first: 'Lukáš', last: 'Svoboda', role: 'admin' },
    { email: 'test@webkit.studio', first: 'Testovací', last: 'Uživatel', role: 'client' }
  ];

  const hesla: { email: string; role: string; password: string }[] = [];
  for (const u of ucty) {
    const id = crypto.randomUUID();
    const password = generatePassword();
    const hash = await hashPassword(password);
    await env.DB
      .prepare(
        `INSERT INTO users (id, email, password_hash, first_name, last_name, role)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(id, u.email, hash, u.first, u.last, u.role)
      .run();
    if (u.role === 'client') {
      await env.DB
        .prepare(`INSERT INTO project_access (user_id, project_slug) VALUES (?1, 'arbosis')`)
        .bind(id)
        .run();
    }
    hesla.push({ email: u.email, role: u.role, password });
  }

  return json({
    hotovo: true,
    poznamka: 'Hesla se ukazují jen teď. Ulož si je a stránku zavři – endpoint je od téhle chvíle uzavřený.',
    ucty: hesla,
    projektu: PROJECTS.length
  });
};
