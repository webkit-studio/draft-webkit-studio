/* Správa uživatelů: zakládání účtů, hesla, přístupy - a hlavně to,
   že se do toho klient nedostane ani oklikou. */
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

async function login(ctx, email) {
  const page = await ctx.newPage();
  await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', creds[email].password);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1800);
  return page;
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
    const r = await page.evaluate(async () => {
      const res = await fetch('/client/api/admin/users');
      return res.status;
    });
    check('klient: GET /api/admin/users -> 403', r === 403, `stav ${r}`);

    const w = await page.evaluate(async () => {
      const res = await fetch('/client/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'utok@example.com' })
      });
      return res.status;
    });
    check('klient: POST /api/admin/users -> 403', w === 403, `stav ${w}`);

    const p = await page.evaluate(async () => {
      const res = await fetch('/client/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'cokoli' })
      });
      return res.status;
    });
    check('klient: POST /api/admin/password -> 403', p === 403, `stav ${p}`);

    const a = await page.evaluate(async () => {
      const res = await fetch('/client/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'cokoli', projects: ['anse'] })
      });
      return res.status;
    });
    check('klient: POST /api/admin/access -> 403', a === 403, `stav ${a}`);
    await ctx.close();
  }

  /* --- admin: Správa funguje --- */
  if (faze === 'vse' || faze === 'admin') {
    const ctx = await browser.newContext();
    const page = await login(ctx, 'lukas@webkit.studio');
    await page.goto(BASE + '/client/admin', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const rows = await page.locator('#seznam > div').count();
    check('admin vidí seznam uživatelů', rows >= 2, `řádků ${rows}`);

    const disabled = await page.locator('#seznam input[type=password][disabled]').count();
    check('bez známého hesla je pole neaktivní', disabled >= 1, `polí ${disabled}`);

    /* založení účtu */
    await page.fill('#novy input[name=email]', novyEmail);
    await page.fill('#novy input[name=firstName]', 'Pokusný');
    await page.fill('#novy input[name=lastName]', 'Účet');
    await page.click('#novy button[type=submit]');
    await page.waitForTimeout(1800);

    const stav = await page.locator('#stav').textContent();
    check('účet založen', (stav || '').includes('založen'), (stav || '').slice(0, 70));

    const rows2 = await page.locator('#seznam > div').count();
    check('seznam se rozrostl', rows2 === rows + 1, `${rows} -> ${rows2}`);

    /* heslo nového účtu je vidět v jeho řádku */
    novePwd = await page.evaluate((mail) => {
      const rowsEls = Array.from(document.querySelectorAll('#seznam > div'));
      const row = rowsEls.find((r) => r.textContent.includes(mail));
      const inp = row && row.querySelector('input[type=password]:not([disabled])');
      return inp ? inp.value : null;
    }, novyEmail);
    check('vygenerované heslo je v řádku', !!novePwd && novePwd.length >= 12, novePwd ? `${novePwd.length} znaků` : 'chybí');

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

    /* admin nesmí měnit heslo jinému adminovi - tady je jen jeden, tak
       ověříme aspoň to, že sám sobě smí */
    const self = await page.evaluate(async () => {
      const d = await (await fetch('/client/api/admin/users')).json();
      const me = d.users.find((x) => x.email === 'lukas@webkit.studio');
      const r2 = await fetch('/client/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: me.id })
      });
      return r2.status;
    });
    check('admin smí změnit heslo sám sobě', self === 200, `stav ${self}`);

    await page.screenshot({ path: OUT + 'app-admin.png', fullPage: true });
    await ctx.close();
  }

  /* --- nový účet se opravdu přihlásí vygenerovaným heslem --- */
  if (novePwd && (faze === 'vse' || faze === 'admin')) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
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
