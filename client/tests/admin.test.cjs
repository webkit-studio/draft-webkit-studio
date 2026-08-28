/* Správa uživatelů: zakládání účtů, hesla, přístupy - a hlavně to,
   že se do toho klient nedostane ani oklikou. */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';

const creds = {};
for (const line of fs.readFileSync(OUT + 'creds.txt', 'utf8').split('\n')) {
  const m = line.match(/^(\S+@\S+)\s+(\S+)\s+(\S+)\s*$/);
  if (m) creds[m[1]] = { role: m[2], password: m[3] };
}


/* Lokalni wrangler dev si obcas sam shodi ProxyController prazdnou chybou
   (v jeho logu: ProxyController2.emitErrorEvent -> castErrorCause) a pozadavek,
   ktery do te mezery spadne, dostane 500 nebo se spojeni utrhne. S aplikaci to
   nesouvisi - v produkci bezi skutecny Worker a zadny proxy controller tam
   neni. Pri 500 se proto pocka na navrat serveru a zkusi se znovu. Kdyby
   endpoint vracel 500 doopravdy, vrati ji i druhy pokus a test spadne. */
async function zivy(page) {
  for (let i = 0; i < 30; i++) {
    const ok = await page.evaluate(async () => {
      try { const r = await fetch('/client/login', { method: 'GET' }); return r.status === 200; }
      catch { return false; }
    }).catch(() => false);
    if (ok) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/* Ctverice pozadavku na /api/admin spolehlive shodi wrangler dev - overeno
   i pres curl, bez Playwrightu, a 500 sedne vzdy na POZICI v poradi, ne na
   konkretni endpoint (s /access na prvnim miste vrati spravne 403 a 500
   spadne az na paty pozadavek). Produkce stejnou davku unese: 24 pozadavku,
   24x spravny stav. Server je tedy potreba umet nahodit i uprostred testu -
   sama navigace mrtvy proces neozivi. */
const SERVE = OUT + 'serve.sh';

async function serverZije() {
  try {
    const r = await fetch(BASE + '/client/login', { headers: { connection: 'close' } });
    return r.status === 200;
  } catch {
    return false;
  }
}

async function zajistiServer() {
  if (await serverZije()) return true;
  try { execFileSync('sh', [SERVE], { stdio: 'pipe' }); } catch { /* zkusi se znovu nize */ }
  for (let i = 0; i < 30; i++) {
    if (await serverZije()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/* Navigace, ktera prezije pad serveru pod rukama. */
async function jdiNa(page, url) {
  let posledni;
  for (let pokus = 0; pokus < 3; pokus++) {
    await zajistiServer();
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded' });
    } catch (e) {
      posledni = e;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw posledni;
}

async function znovuPri500(page, fn) {
  let out;
  try {
    out = await fn();
  } catch {
    out = 500; /* server umrel uprostred - fetch vyhodi misto stavu */
  }
  if (out === 500 || (out && out.status === 500)) {
    await zivy(page);
    out = await fn();
  }
  return out;
}

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'CHYBA'} ${name}${detail ? '  ' + detail : ''}`);
  ok ? pass++ : fail++;
};

/* Prihlaseni umi spadnout do mezery po padu serveru: POST se neodesle,
   session nevznikne a vsechny nasledujici kontroly pak hlasi 401, jako by
   selhalo opravneni. To uz jednou stalo hodiny hledani, tak se tady rovnou
   overuje, jestli prihlaseni opravdu prosic - a kdyz ne, zkusi se znovu. */
async function login(ctx, email) {
  const page = await ctx.newPage();
  for (let pokus = 1; pokus <= 3; pokus++) {
    await zajistiServer();
    await jdiNa(page, BASE + '/client/login');
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', creds[email].password);
    await page.click('button[type=submit]').catch(() => {});
    await page.waitForTimeout(1800);
    /* Musime videt dashboard, ne jen "uz nejsme na /client/login": kdyz server
       umre behem POSTu, prohlizec skonci na chybove strance u /client/api/login
       a ta podminku "neni login" splni - prihlaseni pritom neprobehlo a vsechny
       dalsi kontroly pak hlasi 401, jako by selhalo opravneni. */
    if (page.url().includes('/client/dashboard')) return page;
    console.log(`… přihlášení ${email} neprošlo, zkouším znovu (${pokus}/3)`);
  }
  throw new Error(`Nepodařilo se přihlásit ${email}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const novyEmail = `pokus-${Date.now()}@webkit.studio`;
  let novePwd = null;

  const faze = process.env.FAZE || 'vse';

  /* --- klient se nesmí do Správy dostat ani přímým voláním API --- */
  if (faze === 'vse' || faze === 'klient') {
    const ctx = await browser.newContext();
    const page = await login(ctx, 'test@webkit.studio');
    const r = await znovuPri500(page, () => page.evaluate(async () => {
      const res = await fetch('/client/api/admin/users');
      return res.status;
    }));
    check('klient: GET /api/admin/users -> 403', r === 403, `stav ${r}`);
    await page.waitForTimeout(600);

    const w = await znovuPri500(page, () => page.evaluate(async () => {
      const res = await fetch('/client/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'utok@example.com' })
      });
      return res.status;
    }));
    check('klient: POST /api/admin/users -> 403', w === 403, `stav ${w}`);
    await page.waitForTimeout(600);

    const p = await znovuPri500(page, () => page.evaluate(async () => {
      const res = await fetch('/client/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'cokoli' })
      });
      return res.status;
    }));
    check('klient: POST /api/admin/password -> 403', p === 403, `stav ${p}`);
    await page.waitForTimeout(600);

    const a = await znovuPri500(page, () => page.evaluate(async () => {
      const res = await fetch('/client/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'cokoli', projects: ['anse'] })
      });
      return res.status;
    }));
    check('klient: POST /api/admin/access -> 403', a === 403, `stav ${a}`);
    await ctx.close();
    /* Prave tady server obvykle lezi - dalsi faze by jinak spadla na goto. */
    await zajistiServer();
  }

  /* --- admin: Správa funguje --- */
  if (faze === 'vse' || faze === 'admin') {
    const ctx = await browser.newContext();
    const page = await login(ctx, 'lukas@webkit.studio');

    /* Sprava se prestehovala do nastaveni; stara adresa jen presmerovava.
       Proklikani te stranky ma na starost settings.test.cjs - tady se testuje
       samotne API, tedy to, co plati i kdyz UI vypada jinak. */
    await jdiNa(page, BASE + '/client/admin');
    await page.waitForTimeout(600);
    check('stará adresa /client/admin vede do nastavení',
      page.url().endsWith('/client/settings/users'), page.url());

    const seznam = await znovuPri500(page, () => page.evaluate(async () => {
      const res = await fetch('/client/api/admin/users');
      return { status: res.status, body: await res.json() };
    }));
    check('admin vidí seznam uživatelů',
      seznam.status === 200 && seznam.body.users.length >= 2,
      `uživatelů ${seznam.body && seznam.body.users ? seznam.body.users.length : '?'}`);
    check('seznam nese i projekty pro přidělování',
      Array.isArray(seznam.body.projects) && seznam.body.projects.length >= 1,
      `projektů ${seznam.body.projects ? seznam.body.projects.length : '?'}`);
    check('seznam nevrací otisky hesel',
      !JSON.stringify(seznam.body).includes('pbkdf2'));

    /* založení účtu */
    const zal = await znovuPri500(page, () => page.evaluate(async (mail) => {
      const res = await fetch('/client/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, firstName: 'Pokusný', lastName: 'Účet' })
      });
      return { status: res.status, body: await res.json() };
    }, novyEmail));
    check('účet založen', zal.status === 201, `stav ${zal.status}`);
    novePwd = zal.body && zal.body.password;
    check('vygenerované heslo přišlo v odpovědi',
      !!novePwd && novePwd.length >= 12, novePwd ? `${novePwd.length} znaků` : 'chybí');

    const znovu = await znovuPri500(page, () => page.evaluate(async (mail) => {
      const res = await fetch('/client/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail })
      });
      return res.status;
    }, novyEmail));
    check('stejný e-mail podruhé neprojde', znovu === 409, `stav ${znovu}`);

    /* přidělení přístupu */
    const ok = await page.evaluate(async (mail) => {
      const res = await fetch('/client/api/admin/users');
      const d = await res.json();
      const u = d.users.find((x) => x.email === mail);
      const r2 = await fetch('/client/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, projects: ['anse', 'crr'] })
      });
      return { status: r2.status, body: await r2.json() };
    }, novyEmail);
    check('přístupy uloženy', ok.status === 200 && ok.body.projects.length === 2, JSON.stringify(ok.body));

    /* neznámý projekt musí odmítnout */
    const bad = await page.evaluate(async (mail) => {
      const d = await (await fetch('/client/api/admin/users')).json();
      const u = d.users.find((x) => x.email === mail);
      const r2 = await fetch('/client/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id, projects: ['neexistuje'] })
      });
      return r2.status;
    }, novyEmail);
    check('neznámý projekt odmítnut', bad === 400, `stav ${bad}`);

    /* Generovani hesla klientovi. Zamerne se NEtoci heslo adminovi samotnemu:
       tenhle test by tim rozbil prihlaseni vsem testum, ktere bezi po nem -
       coz se stalo a stalo to hledani. */
    const rot = await page.evaluate(async (mail) => {
      const d = await (await fetch('/client/api/admin/users')).json();
      const u = d.users.find((x) => x.email === mail);
      const r2 = await fetch('/client/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: u.id })
      });
      return { status: r2.status, body: await r2.json() };
    }, novyEmail);
    check('admin vygeneruje nové heslo klientovi',
      rot.status === 200 && typeof rot.body.password === 'string' && rot.body.password.length >= 12,
      `stav ${rot.status}`);
    /* nove heslo plati misto stareho */
    if (rot.status === 200) novePwd = rot.body.password;

    /* --- mazání účtu a jeho tři pojistky --- */
    const sebe = await znovuPri500(page, () => page.evaluate(async () => {
      const d = await (await fetch('/client/api/admin/users')).json();
      const me = d.users.find((x) => x.email === 'lukas@webkit.studio');
      const r2 = await fetch(`/client/api/admin/users?id=${me.id}`, { method: 'DELETE' });
      return { status: r2.status, body: await r2.json() };
    }));
    check('admin nesmaže sám sebe',
      sebe.status === 400 && sebe.body.error === 'cannot-delete-self', `stav ${sebe.status}`);

    /* Ucet, ktery uz neco napsal, se nemaze - komentare maji zustat.
       Komentar si test zaklada sam. Drive spolehal na to, ze test@webkit.studio
       ma komentare z predchozich sad; kdyz nektera z nich spadla, DELETE poslusne
       prosel a vypadalo to jako chyba v opravneni, ne jako chybejici predpoklad. */
    /* Komentar musi napsat prave ten ucet, ktery se pak zkousi smazat - server
       bere autora ze session, ne z tela pozadavku, takze kdyby ho zalozil admin,
       DELETE by prosel a test by nic neoveril. */
    {
      const ctxK = await browser.newContext();
      const pageK = await login(ctxK, 'test@webkit.studio');
      await pageK.evaluate(async () => {
        await fetch('/client/api/comments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project: 'arbosis', version: 'v2', view: 'desktop',
            section: 'D1 Hero', x: 0.5, y: 0.5, body: 'Komentar pro test mazani uctu'
          })
        });
      });
      await ctxK.close();
      await zajistiServer();
    }

    const sKom = await znovuPri500(page, () => page.evaluate(async () => {
      const d = await (await fetch('/client/api/admin/users')).json();
      const u = d.users.find((x) => x.email === 'test@webkit.studio');
      const r2 = await fetch(`/client/api/admin/users?id=${u.id}`, { method: 'DELETE' });
      return { status: r2.status, body: await r2.json() };
    }));
    check('účet s komentáři se nesmaže',
      sKom.status === 409 && sKom.body.error === 'has-comments',
      `stav ${sKom.status} ${JSON.stringify(sKom.body).slice(0, 60)}`);
    check('a řekne, kolik komentářů to je', Number(sKom.body.pocet) > 0, `${sKom.body.pocet}`);

    await ctx.close();
  }

  /* --- nový účet se opravdu přihlásí vygenerovaným heslem --- */
  if (novePwd && (faze === 'vse' || faze === 'admin')) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await jdiNa(page, BASE + '/client/login');
    await page.fill('input[name=email]', novyEmail);
    await page.fill('input[name=password]', novePwd);
    await page.click('button[type=submit]');
    await page.waitForTimeout(1800);
    check('nový účet se přihlásí vygenerovaným heslem', page.url().endsWith('/client/dashboard'), page.url());
    const items = await page.locator('main li').count();
    check('nový účet vidí 2 přidělené projekty', items === 2, `nalezeno ${items}`);
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
