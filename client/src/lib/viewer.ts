/* Prohlížeč návrhu.
 *
 * Plátno se NEUPRAVUJE - je to obsah pro klienta a pravidlo 1 v CLAUDE.md
 * říká, že se needituje bez zadání. Původní soubor se proto bere celý a mění
 * se v něm jen to, co patří k prostředí: přihlášení, odkazy a napojení
 * komentářů. Assety plátna jsou v public/<projekt>/<verze>/assets/, takže
 * relativní odkazy uvnitř plátna sedí beze změny.
 *
 * Verze prohlížečů se importují staticky - Cloudflare Workers nemají
 * filesystem, takze dynamický import podle cesty by neprošel buildem. */

import arbosisV1Desktop from '../viewers/arbosis/v1/desktop.html?raw';
import arbosisV1Mobile from '../viewers/arbosis/v1/mobile.html?raw';
import arbosisV2Desktop from '../viewers/arbosis/v2/desktop.html?raw';
import arbosisV2Mobile from '../viewers/arbosis/v2/mobile.html?raw';

const VIEWERS: Record<string, string> = {
  'arbosis/v1/desktop': arbosisV1Desktop,
  'arbosis/v1/mobile': arbosisV1Mobile,
  'arbosis/v2/desktop': arbosisV2Desktop,
  'arbosis/v2/mobile': arbosisV2Mobile
};

export function hasViewer(project: string, version: string, view: string): boolean {
  return `${project}/${version}/${view}` in VIEWERS;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface ViewerOptions {
  project: string;
  version: string;
  view: 'desktop' | 'mobile';
  userId: string;
  userName: string;
  isAdmin: boolean;
}

export function renderViewer(o: ViewerOptions): string | null {
  const key = `${o.project}/${o.version}/${o.view}`;
  let html = VIEWERS[key];
  if (!html) return null;

  const base = `/client/${o.project}`;

  /* 1) Pryč s napojením na Supabase - prihlaseni resi server, ne prohlizec. */
  html = html
    .replace(/\s*<script src="\/assets\/config\.js"><\/script>/g, '')
    .replace(/\s*<script src="\/assets\/gate\.js"[^>]*><\/script>/g, '');

  /* 2) Odkazy lišty na nové cesty. */
  html = html
    .replace(new RegExp(`href="/${o.project}/"`, 'g'), `href="${base}"`)
    .replace(new RegExp(`href="/${o.project}/(v\\d+)/(desktop|mobile)\\.html"`, 'g'), `href="${base}/$1/$2"`);

  /* 3) Blok uživatele se vykreslí ze session, ne skriptem. Odhlášení je
        formulář, protože session ruší server. */
  const who =
    `<span class="who"><b>${escapeHtml(o.userName)}</b>` +
    `<form method="post" action="/client/api/logout" style="display:inline">` +
    `<button type="submit" style="background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer">Odhlásit</button>` +
    `</form></span>`;
  html = html.replace(/<span class="who" data-auth hidden>[\s\S]*?<\/span>/, who);

  /* 4) Tlačítko komentářů odkryjeme rovnou - není na co čekat, uživatel je
        přihlášený už tím, že se sem dostal. */
  html = html.replace(/<button class="cbtn" type="button" data-comments-toggle hidden>/, '<button class="cbtn" type="button" data-comments-toggle>');

  /* 5) Napojení komentářů.
        Skript si cte nastaveni z atributu pres document.currentScript, takze
        NESMI byt type="module" - tam je currentScript null a skript by se
        rovnou ukoncil. Bubliny data-tip drzel driv gate.js, ktery uz
        neexistuje; jsou vyriznute do tip.js.
        Cesta musi mit vic nez jeden segment: /client/comments.js by pohltila
        dynamicka routa projektu ([project]) a server by ji poslal na login.
        Overeno na nasazene aplikaci - vracelo to 302 misto souboru. */
  const cfg =
    `<script>window.WKS = ${JSON.stringify({
      project: o.project,
      version: o.version,
      view: o.view,
      userId: o.userId,
      userName: o.userName,
      isAdmin: o.isAdmin
    })};</script>`;
  html = html.replace(
    /<script src="\/assets\/comments\.js"[^>]*><\/script>/,
    `${cfg}<script src="/client/assets/tip.js"></script>` +
      `<script src="/client/assets/comments.js" data-project="${o.project}" ` +
      `data-version="${o.version}" data-view="${o.view}"></script>`
  );

  return html;
}
