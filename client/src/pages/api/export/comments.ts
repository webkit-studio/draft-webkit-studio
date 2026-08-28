/* Read-only export komentářů tokenem, bez session.
 *
 * K čemu to je: agent, který pracuje na plátně návrhu, se k databázi jinak
 * nedostane a připomínky od klienta si nepřečte. Tohle je souběžná cesta pro
 * čtení - nesahá na access.ts ani na chování session rout a žádná zapisovací
 * varianta nevznikne.
 *
 * Pravidla, která tu drží bezpečnost:
 * - vlastní proměnná EXPORT_TOKEN, ne SESSION_SECRET. Ten podepisuje session;
 *   token se posílá v hlavičce a skončí v historii příkazů, ve skriptech
 *   a v logu terminálu. Sdílet je by znamenalo, že únik jednoho bere druhý.
 * - nenastavený token = export vypnutý (503). Zapomenutá proměnná nesmí
 *   endpoint otevřít.
 * - špatný token vrací 404, ne 401: endpoint o sobě nemá říkat, že existuje.
 * - porovnání v konstantním čase, ať se token nedá uhádat po znacích.
 * - dotaz jde výhradně do tabulky comments. Žádné author_id, žádný e-mail,
 *   nic z users - jméno autora je v komentáři samo.
 */

import type { APIRoute } from 'astro';
import { logRequest } from '../../../lib/db';
import { getEnv, getDb } from '../../../lib/env';

const VIEW_LABELS: Record<string, string> = { desktop: 'Počítač', mobile: 'Mobil' };

const noStore = (body: string, status: number, type: string) =>
  new Response(body, {
    status,
    headers: { 'Content-Type': type, 'Cache-Control': 'no-store' }
  });

const json = (data: unknown, status = 200) =>
  noStore(JSON.stringify(data, null, 2), status, 'application/json; charset=utf-8');

/* Neexistuje. Stejná odpověď pro chybějící i špatný token - rozdíl mezi nimi
   by prozradil, že se sem trefil. */
const neexistuje = () => noStore('Not found', 404, 'text/plain; charset=utf-8');

function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Datum ve tvaru, jaký ukazuje prohlížeč: "27. 8. 2026 21:30".
   V databázi je "YYYY-MM-DD HH:MM:SS" bez značky pásma. Čte se to rozborem
   řetězce, ne přes Date - parsování takového tvaru je v JS definované
   implementací a přes Date by se hodnota mohla posunout o pásmo. */
function fmtAbs(raw: string): string {
  const m = String(raw || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return '';
  const [, r, mes, d, h, min] = m;
  return `${Number(d)}. ${Number(mes)}. ${r} ${Number(h)}:${min}`;
}

interface Radek {
  id: string;
  version: string;
  view: string;
  section: string;
  x: number | null;
  y: number | null;
  parent_id: string | null;
  author_name: string;
  body: string;
  resolved: number;
  created_at: string;
}

/* Markdown ve stejném tvaru, jaký staví buildMarkdown() v comments.js.
   Dvě věci server vědět nemůže, protože je čte z vykresleného plátna:
   pořadí sekcí a jméno klienta z lišty. Prohlížeč má pro obojí stejnou
   záložní větev - pořadí podle prvního výskytu a slug projektu - a tady
   se použije rovnou ona, takže se výstupy neliší tvarem, jen tímhle. */
/* Kde pin sedi. Komentare byvaji strohe ("tohle zkratit"), protoze je clovek
   psal s prstem na miste - bez pozice se pak neda poznat, na co ukazuji.
   x/y jsou podil sirky a vysky SEKCE, ne cele stranky, takze se to tak i pise.
   Slovni urceni je navic: "vlevo nahore" se cte rychleji nez dve procenta. */
function pozice(c: Radek): string {
  if (c.x == null || c.y == null) return '';
  const px = Math.round(c.x * 100);
  const py = Math.round(c.y * 100);
  const vodorovne = px < 33 ? 'vlevo' : px > 66 ? 'vpravo' : 'uprostřed';
  const svisle = py < 33 ? 'nahoře' : py > 66 ? 'dole' : 've středu';
  const slovy = vodorovne === 'uprostřed' && svisle === 've středu' ? 'uprostřed' : `${vodorovne} ${svisle}`;
  return `${slovy} (${px} % zleva, ${py} % shora v rámci sekce)`;
}

function buildMarkdown(rows: Radek[], project: string, version: string | null): string {
  const lines: string[] = [];
  lines.push(`# ${project} – ${version || 'všechny verze'} – komentáře`);
  lines.push('');
  lines.push('Export: ' + fmtAbs(new Date().toISOString()));

  const koreny = rows.filter((c) => !c.parent_id);
  const cisla = new Map<string, number>();
  koreny.forEach((c, i) => cisla.set(c.id, i + 1));

  const bySection = new Map<string, Radek[]>();
  for (const c of koreny) {
    if (!bySection.has(c.section)) bySection.set(c.section, []);
    bySection.get(c.section)!.push(c);
  }

  for (const [label, list] of bySection) {
    lines.push('');
    lines.push('## ' + label);
    for (const c of list) {
      lines.push('');
      lines.push(
        `**${cisla.get(c.id) || '–'}. ${c.author_name}** – ${fmtAbs(c.created_at)} – ` +
          `${VIEW_LABELS[c.view] || c.view} – ${c.resolved ? 'vyřešený' : 'otevřený'}`
      );
      const kde = pozice(c);
      /* Odkaz otevre prohlizec navrhu rovnou na tomhle pinu. */
      const odkaz = `/client/${project}/${c.version}/${c.view}#c=${c.id}`;
      lines.push(`Pozice: ${kde || 'neurčená'} · [otevřít pin](${odkaz})`);
      lines.push('');
      for (const ln of c.body.split('\n')) lines.push(ln);
      for (const r of rows.filter((x) => x.parent_id === c.id)) {
        lines.push('');
        lines.push(`  - **${r.author_name}** – ${fmtAbs(r.created_at)}`);
        for (const ln of r.body.split('\n')) lines.push('    ' + ln);
      }
    }
  }
  return lines.join('\n') + '\n';
}

export const GET: APIRoute = async ({ url, request }) => {
  const env = getEnv();
  const ocekavany = env.EXPORT_TOKEN || '';
  if (!ocekavany) return json({ error: 'export-disabled' }, 503);

  const poslany = request.headers.get('x-export-token') || '';
  if (!poslany || !sameString(poslany, ocekavany)) return neexistuje();

  const db = getDb();
  if (!db) return json({ error: 'no-db' }, 503);

  const project = String(url.searchParams.get('project') || '').trim();
  if (!project) return json({ error: 'project-required' }, 400);
  const version = url.searchParams.get('version');
  const format = (url.searchParams.get('format') || 'json').toLowerCase();
  if (format !== 'json' && format !== 'md') return json({ error: 'unknown-format' }, 400);

  const dotaz = version
    ? db
        .prepare(
          `SELECT id, version, view, section, x, y, parent_id, author_name, body, resolved, created_at
             FROM comments WHERE project = ?1 AND version = ?2 ORDER BY created_at ASC, id ASC`
        )
        .bind(project, version)
    : db
        .prepare(
          `SELECT id, version, view, section, x, y, parent_id, author_name, body, resolved, created_at
             FROM comments WHERE project = ?1 ORDER BY created_at ASC, id ASC`
        )
        .bind(project);

  const res = await dotaz.all<Radek>();
  const rows = res.results;

  /* Log jako u ostatních API - bez těla a bez tokenu. */
  await logRequest(db, {
    method: 'GET',
    path: '/api/export/comments',
    status: 200,
    userId: null,
    note: `export ${project}${version ? '/' + version : ''} ${format}: ${rows.length}`
  });

  if (format === 'md') {
    return noStore(buildMarkdown(rows, project, version), 200, 'text/markdown; charset=utf-8');
  }

  return json({
    project,
    version: version || null,
    count: rows.length,
    comments: rows.map((c) => ({
      id: c.id,
      version: c.version,
      view: c.view,
      section: c.section,
      x: c.x,
      y: c.y,
      parentId: c.parent_id,
      authorName: c.author_name,
      body: c.body,
      resolved: !!c.resolved,
      createdAt: c.created_at
    }))
  });
};

/* Endpoint je výhradně pro čtení. Metoda se ale řeší až po tokenu: kdyby
   POST vracel 405 komukoli, prozradil by tím, že tady endpoint je - a to je
   přesně to, čemu se u chybného tokenu vyhýbáme odpovědí 404. */
export const ALL: APIRoute = async ({ request }) => {
  const ocekavany = getEnv().EXPORT_TOKEN || '';
  if (!ocekavany) return json({ error: 'export-disabled' }, 503);

  const poslany = request.headers.get('x-export-token') || '';
  if (!poslany || !sameString(poslany, ocekavany)) return neexistuje();

  return new Response('Method Not Allowed', {
    status: 405,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      Allow: 'GET'
    }
  });
};
