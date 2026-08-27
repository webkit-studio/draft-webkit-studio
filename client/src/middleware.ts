/* Jediné místo, kde se rozhoduje o přístupu.
 *
 * /client        nemá vlastní stránku - jen přesměruje podle přihlášení.
 * /client/login  je jediná veřejná adresa.
 * cokoli dalšího vyžaduje session.
 *
 * Přesměrování nesmí do cache: jinak by CDN podstrčila odpověď "-> login"
 * i přihlášenému člověku. */

import { defineMiddleware } from 'astro:middleware';
import { SESSION_COOKIE } from './lib/auth';
import { userFromToken } from './lib/db';
import { getDb } from './lib/env';

/* /api/setup musi byt verejny: bezi drive, nez existuje prvni ucet, takze
   se k nemu nikdo prihlasit nemuze. Chrani ho token a podminka prazdne
   databaze primo v endpointu. */
/* /api/export/comments je verejny pro middleware, ne pro svet: overuje se
   tokenem v hlavicce primo v handleru. Bez teto vyjimky by pozadavek skoncil
   presmerovanim na login a k handleru se nedostal.
   Cesta ma schvalne vic segmentu - jednosegmentovou by spolkla dynamicka
   routa [project], jak se to uz stalo u /client/comments.js. */
const PUBLIC_PATHS = new Set([
  '/login', '/api/login', '/setup', '/api/setup', '/api/export/comments'
]);

function noStore(res: Response): Response {
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const db = getDb();
  const url = new URL(context.request.url);

  /* cesta bez mount pathu, ať se logika nemusí starat o /client prefix */
  const path = url.pathname.replace(/^\/client/, '') || '/';

  context.locals.user = null;

  const token = context.cookies.get(SESSION_COOKIE)?.value;
  if (token && db) {
    try {
      context.locals.user = await userFromToken(db, token);
    } catch {
      context.locals.user = null;
    }
  }

  /* Vlastni CSRF kontrola.
     Porovnavat Origin s hlavickou Host nejde: Worker za Webflow Cloud vidi
     interni adresu (…cosmic.webflow.services), ne verejnou domenu. Presne
     na tomhle selhavala i vestavena kontrola Astra a odmitala legitimni
     prihlaseni. Rozhoduje proto seznam verejnych domen, pod kterymi
     aplikace bezi.

     Hlavni obranou proti CSRF zustava session cookie SameSite=Lax - ta se
     pri pozadavku z ciziho webu vubec neposle. Tohle je druha vrstva. */
  if (context.request.method === 'POST') {
    const origin = context.request.headers.get('origin');
    if (origin) {
      let originHost = '';
      try { originHost = new URL(origin).host; } catch { originHost = ''; }
      const host = context.request.headers.get('host') || '';
      const povolene = [
        'webkit.studio',
        'www.webkit.studio',
        'webkit-studio.webflow.io'
      ];
      const jeLokalni = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(originHost);
      const sedisHostem = originHost !== '' && originHost === host;

      if (!povolene.includes(originHost) && !jeLokalni && !sedisHostem) {
        return noStore(
          new Response(
            `Požadavek přišel z jiného webu, a to se neprovádí.\n\nOrigin: ${originHost}`,
            { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
          )
        );
      }
    }
  }

  const user = context.locals.user;

  /* holé /client - rozcestí */
  if (path === '/' || path === '') {
    return noStore(context.redirect(user ? '/client/dashboard' : '/client/login', 302));
  }

  /* přihlášený na login nemá co dělat */
  if (path === '/login' && user) {
    return noStore(context.redirect('/client/dashboard', 302));
  }

  if (PUBLIC_PATHS.has(path)) return next();

  if (!user) {
    /* API odpovídá stavem, stránka přesměruje na přihlášení */
    if (path.startsWith('/api/')) {
      return noStore(
        new Response(JSON.stringify({ error: 'unauthorized' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      );
    }
    const back = encodeURIComponent(url.pathname + url.search);
    return noStore(context.redirect(`/client/login?next=${back}`, 302));
  }

  /* Sekce i API jen pro admina. Skrytí v UI není bezpečnostní prvek - drží
     to tady, a API musí odmítnout stejně jako stránka. */
  if (path.startsWith('/api/admin') && user.role !== 'admin') {
    return noStore(
      new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      })
    );
  }
  if (path.startsWith('/admin') && user.role !== 'admin') {
    return noStore(context.redirect('/client/dashboard', 302));
  }

  /* Nastavení má klient taky, ale jen záložku Můj účet. Obě správy jsou
     adresy jako každá jiná - schování záložky v UI nic nehlídá. */
  if ((path.startsWith('/settings/projects') || path.startsWith('/settings/users')) && user.role !== 'admin') {
    return noStore(context.redirect('/client/settings/account', 302));
  }

  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
