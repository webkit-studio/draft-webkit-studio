/* Komentáře: co smí klient, co jen admin, a hlavně co nesmí nikdo.
   Bez RLS je tohle jediná záruka - proto se sem míří přímo. */
const { chromium } = require('playwright-core');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';

const creds = {};
for (const line of fs.readFileSync(OUT + 'creds.txt', 'utf8').split('\n')) {
  const m = line.match(/^(\S+@\S+)\s+(\S+)\s+(\S+)\s*$/);
  if (m) creds[m[1]] = { role: m[2], password: m[3] };
}

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'CHYBA'} ${name}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

async function login(browser, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', creds[email].password);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1600);
  return { ctx, page };
}

/* volání API z kontextu přihlášené stránky */
const call = (page, path, init) =>
  page.evaluate(
    async ([p, i]) => {
      const res = await fetch(p, i || undefined);
      let body = null;
      try { body = await res.json(); } catch { body = null; }
      return { status: res.status, body };
    },
    [path, init]
  );

const post = (obj) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj)
});

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const faze = process.env.FAZE || 'vse';
  let klientKomentar = null;

  /* --- klient: smí do svého projektu, nesmí do cizího --- */
  if (faze === 'vse' || faze === 'klient') {
    const { ctx, page } = await login(browser, 'test@webkit.studio');

    const own = await call(page, '/client/api/comments', post({
      project: 'arbosis', version: 'v2', view: 'desktop', section: 'D1 Hero',
      x: 0.5, y: 0.5, body: 'Komentar klienta'
    }));
    check('klient přidá komentář do svého projektu', own.status === 201, `stav ${own.status}`);
    klientKomentar = own.body?.comment?.id || null;

    check('autor se bere ze session, ne z požadavku',
      own.body?.comment?.authorName === 'Testovací U.', own.body?.comment?.authorName);

    const foreign = await call(page, '/client/api/comments', post({
      project: 'anse', version: 'v1', view: 'desktop', section: 'X', x: 0.5, y: 0.5, body: 'nemel bych moct'
    }));
    check('klient NEpřidá komentář do cizího projektu', foreign.status === 403, `stav ${foreign.status}`);

    const readForeign = await call(page, '/client/api/comments?project=anse&version=v1');
    check('klient NEpřečte komentáře cizího projektu', readForeign.status === 403, `stav ${readForeign.status}`);

    const readOwn = await call(page, '/client/api/comments?project=arbosis&version=v2');
    check('klient přečte komentáře svého projektu',
      readOwn.status === 200 && Array.isArray(readOwn.body.comments), `stav ${readOwn.status}`);

    /* vyřešit smí kdokoli s přístupem */
    const resolve = await call(page, '/client/api/comments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: klientKomentar, resolved: true })
    });
    check('klient označí vyřešeno', resolve.status === 200 && resolve.body.comment.resolved === true, `stav ${resolve.status}`);

    /* mazat nesmí */
    const del = await call(page, `/client/api/comments?id=${klientKomentar}`, { method: 'DELETE' });
    check('klient NEsmí mazat', del.status === 403, `stav ${del.status}`);

    await ctx.close();
  }

  /* --- admin: cizí komentář neupraví, ale smaže --- */
  if ((faze === 'vse' || faze === 'admin') && klientKomentar) {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');

    const read = await call(page, '/client/api/comments?project=arbosis&version=v2');
    check('admin přečte komentáře projektu', read.status === 200, `stav ${read.status}`);

    /* odpověď nesmí jít přivěsit k vláknu v jiném projektu */
    const cross = await call(page, '/client/api/comments', post({
      project: 'anse', version: 'v1', view: 'desktop', section: 'X',
      parentId: klientKomentar, body: 'krizem'
    }));
    check('odpověď nelze přivěsit přes hranici projektu', cross.status === 400, `stav ${cross.status}`);

    const prazdny = await call(page, '/client/api/comments', post({
      project: 'arbosis', version: 'v2', view: 'desktop', section: 'D1 Hero', x: 0.1, y: 0.1, body: '   '
    }));
    check('prázdný komentář odmítnut', prazdny.status === 400, `stav ${prazdny.status}`);

    const del = await call(page, `/client/api/comments?id=${klientKomentar}`, { method: 'DELETE' });
    check('admin smaže komentář', del.status === 204, `stav ${del.status}`);

    await ctx.close();
  }

  /* --- nepřihlášený nesmí nic --- */
  if (faze === 'vse' || faze === 'klient') {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    const r = await call(page, '/client/api/comments?project=arbosis&version=v2');
    check('nepřihlášený nepřečte komentáře', r.status === 401, `stav ${r.status}`);
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
