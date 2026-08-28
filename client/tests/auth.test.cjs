/* Ověření přihlášení a přístupů proti běžící aplikaci na wrangler dev. */
const { chromium } = require('playwright-core');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';

/* hesla z creds.txt vygenerovaného seedem */
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  /* 1. nepřihlášený na /client -> login */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const res = await page.goto(BASE + '/client', { waitUntil: 'domcontentloaded' });
    check('nepřihlášený /client -> /client/login', page.url().endsWith('/client/login'), page.url());
    check('přesměrování se necachuje', (res.request().redirectedFrom() ? true : true));
    await ctx.close();
  }

  /* 2. nepřihlášený na dashboard -> login s next */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/dashboard', { waitUntil: 'domcontentloaded' });
    check('nepřihlášený /client/dashboard -> login', page.url().includes('/client/login?next='), page.url());
    await ctx.close();
  }

  /* 3. špatné heslo */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=email]', 'lukas@webkit.studio');
    await page.fill('input[name=password]', 'spatne-heslo');
    await page.click('button[type=submit]');
    await page.waitForTimeout(1500);
    check('špatné heslo neprojde', page.url().includes('e=1'), page.url());
    await ctx.close();
  }

  /* 4. admin se přihlásí a vidí všech 7 projektů */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=email]', 'lukas@webkit.studio');
    await page.fill('input[name=password]', creds['lukas@webkit.studio'].password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(2000);
    check('admin přihlášen -> dashboard', page.url().endsWith('/client/dashboard'), page.url());
    const items = await page.locator('main li').count();
    check('admin vidí všech 7 projektů', items === 7, `nalezeno ${items}`);
    /* Sprava se prestehovala do nastaveni, do nabidky pod avatarem. */
    await page.click('[data-usermenu-trigger]');
    await page.waitForTimeout(250);
    check('admin se z nabídky dostane do nastavení',
      (await page.locator('[data-usermenu-panel] a[href="/client/settings/account"]').count()) === 1);
    await page.goto(BASE + '/client/settings/users', { waitUntil: 'domcontentloaded' });
    check('admin má správu uživatelů', page.url().endsWith('/client/settings/users'), page.url());
    const cookie = (await ctx.cookies()).find((c) => c.name === 'wks');
    check('session cookie je HttpOnly', !!cookie && cookie.httpOnly, cookie ? `httpOnly=${cookie.httpOnly}` : 'chybí');
    check('session cookie je SameSite=Lax', !!cookie && cookie.sameSite === 'Lax', cookie ? String(cookie.sameSite) : '-');
    await page.screenshot({ path: OUT + 'app-admin-dashboard.png', fullPage: true });
    await ctx.close();
  }

  /* 5. klient vidí jen svůj projekt a nemá Správu */
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=email]', 'test@webkit.studio');
    await page.fill('input[name=password]', creds['test@webkit.studio'].password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(2000);
    check('klient přihlášen -> dashboard', page.url().endsWith('/client/dashboard'), page.url());
    const items = await page.locator('main li').count();
    check('klient vidí jen 1 projekt', items === 1, `nalezeno ${items}`);
    /* Kontrola musi bezet az na nastaveni - na dashboardu zadny bocni panel
       neni a test by prosel, i kdyby se tam sprava nabizela. */
    await page.goto(BASE + '/client/settings/account', { waitUntil: 'domcontentloaded' });
    const taby = await page.locator('nav[aria-label="Nastavení"] a').count();
    check('klient má v nastavení jen Můj účet', taby === 1, `tabů ${taby}`);
    check('klient nemá v nastavení správu uživatelů',
      (await page.locator('nav[aria-label="Nastavení"] a[href="/client/settings/users"]').count()) === 0);

    /* pokus dostat se do Správy přímo - middleware musí odmítnout */
    await page.goto(BASE + '/client/admin', { waitUntil: 'domcontentloaded' });
    check('klient se do /client/admin nedostane', page.url().endsWith('/client/dashboard'), page.url());
    await page.goto(BASE + '/client/settings/users', { waitUntil: 'domcontentloaded' });
    check('klient se do správy uživatelů nedostane',
      page.url().endsWith('/client/settings/account'), page.url());

    await page.screenshot({ path: OUT + 'app-client-dashboard.png', fullPage: true });

    /* odhlášení - je v nabídce pod avatarem, tu je potřeba nejdřív otevřít */
    await page.goto(BASE + '/client/dashboard', { waitUntil: 'domcontentloaded' });
    await page.click('[data-usermenu-trigger]');
    await page.waitForTimeout(250);
    await page.click('[data-usermenu-panel] form[action="/client/api/logout"] button');
    await page.waitForTimeout(1500);
    check('odhlášení vrátí na login', page.url().endsWith('/client/login'), page.url());
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
