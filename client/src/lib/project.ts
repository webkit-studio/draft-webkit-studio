/* Společné načtení projektu pro stránky portálu: přístup, záznam v databázi,
   verze a počty komentářů. Vrací Response, když má stránka skončit dřív. */
import type { AstroGlobal } from 'astro';
import { requireProject, AccessError } from './access';
import { getDb } from './env';
import { versionsFor, type Version } from './versions';

export interface Counts { open: number; total: number }

export interface ProjectPage {
  row: { slug: string; name: string; subtitle: string | null };
  versions: Version[];
  counts: Record<string, Counts>;
  openComments: number;
  demo: boolean;
}

const text = (body: string, status: number) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function loadProjectPage(Astro: AstroGlobal): Promise<ProjectPage | Response> {
  const project = String(Astro.params.project || '');
  const db = getDb();

  try {
    requireProject(Astro.locals.user, project);
  } catch (e) {
    const status = e instanceof AccessError ? e.status : 500;
    /* Hlaska rika, o ktery projekt slo a kdo je prihlaseny - jinak vypada
       stejne jako preklep v adrese a hleda se to naslepo. */
    const kdo = Astro.locals.user ? Astro.locals.user.email : 'nepřihlášený';
    return text(
      `Nemáte přístup k projektu „${project}“.\n\nPřihlášen: ${kdo}\n` +
        `Pokud jsi mířil na založení databáze, je to /client/setup.`,
      status
    );
  }

  const row = db
    ? await db
        .prepare(`SELECT slug, name, subtitle FROM projects WHERE slug = ?1`)
        .bind(project)
        .first<{ slug: string; name: string; subtitle: string | null }>()
    : null;
  if (!row) return text('Projekt neexistuje.', 404);

  const versions = versionsFor(project);
  const counts: Record<string, Counts> = {};
  let openComments = 0;
  if (db) {
    const res = await db
      .prepare(
        `SELECT version, COUNT(*) AS total,
                SUM(CASE WHEN resolved = 0 AND parent_id IS NULL THEN 1 ELSE 0 END) AS open
           FROM comments WHERE project = ?1 GROUP BY version`
      )
      .bind(project)
      .all<{ version: string; total: number; open: number }>();
    for (const r of res.results) {
      counts[r.version] = { open: Number(r.open || 0), total: Number(r.total || 0) };
      openComments += Number(r.open || 0);
    }
  }

  return { row, versions, counts, openComments, demo: Astro.url.searchParams.get('demo') === '1' };
}
