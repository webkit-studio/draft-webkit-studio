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
const PUBLIC_PATHS = new Set(['/login', '/api/login', '/api/setup']);

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

  const res = await next();
  res.headers.set('Cache-Control', 'no-store');
  return res;
});
