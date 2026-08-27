-- Klientské prostředí Webkit.Studio - výchozí schéma (D1 / SQLite).
--
-- Proti Supabase je tu jeden zásadní rozdíl: RLS neexistuje. O tom, kdo co
-- smí, rozhoduje serverová vrstva v src/lib/access.ts a nikde jinde. Schéma
-- je proto úmyslně hloupé - drží data a integritu, ne oprávnění.

-- ---------- uživatelé ----------
-- password_hash je "pbkdf2$<iterace>$<sůl b64>$<hash b64>". bcrypt na Workers
-- nativně není, PBKDF2 přes WebCrypto ano.
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('admin','client')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX users_email_idx ON users (email);

-- ---------- session ----------
-- Neprůhledný token v HttpOnly cookie. Oproti dnešnímu JWT v localStorage se
-- k němu skript v prohlížeči nedostane.
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  user_agent TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- ---------- projekty ----------
CREATE TABLE projects (
  slug       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  subtitle   TEXT,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- přístupy ----------
-- Dřív pole v app_metadata, teď vazební tabulka. Jde se na to joinem a nedá
-- se to rozsypat překlepem v JSONu.
CREATE TABLE project_access (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_slug TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  granted_at   TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, project_slug)
);
CREATE INDEX project_access_project_idx ON project_access (project_slug);

-- ---------- komentáře ----------
CREATE TABLE comments (
  id          TEXT PRIMARY KEY,
  project     TEXT NOT NULL REFERENCES projects(slug) ON DELETE CASCADE,
  version     TEXT NOT NULL,
  view        TEXT NOT NULL CHECK (view IN ('desktop','mobile')),
  section     TEXT NOT NULL,
  x           REAL,
  y           REAL,
  parent_id   TEXT REFERENCES comments(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL REFERENCES users(id),
  author_name TEXT NOT NULL,
  body        TEXT NOT NULL,
  resolved    INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0,1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX comments_project_version_idx ON comments (project, version, created_at);
CREATE INDEX comments_parent_idx ON comments (parent_id);

-- ---------- vlastní log ----------
-- Dnešní chybu s komentáři odhalily až logy požadavků. Jestli je Webflow Cloud
-- ukáže, nevím, takže si je píšu sám. Bez těl requestů a bez hesel.
CREATE TABLE request_log (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       TEXT NOT NULL DEFAULT (datetime('now')),
  method   TEXT NOT NULL,
  path     TEXT NOT NULL,
  status   INTEGER NOT NULL,
  user_id  TEXT,
  note     TEXT
);
CREATE INDEX request_log_ts_idx ON request_log (ts);
