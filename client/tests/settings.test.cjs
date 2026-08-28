/* Nastavení: hlavička s účtem, boční panel, oba seznamy.
   Běží proti wrangler dev, přihlašuje se hesly z creds.txt. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';
const creds = {};
for (const l of fs.readFileSync(OUT + 'creds.txt', 'utf8').split('\n')) {
  const m = l.match(/^(\S+@\S+)\s+(\S+)\s+(\S+)\s*$/); if (m) creds[m[1]] = m[3];
}
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

async function login(browser, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', creds[email]);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1600);
  return { ctx, page };
}

/* Řádek seznamu podle textu v hlavě. */
const radekS = (page, text) => page.locator('#seznam > li').filter({ hasText: text }).first();

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  /* ---------- hlavička ---------- */
  {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');
    /* Google Fonts se v testovacim kontejneru nestahne a prohlizec to hlasi
       jako chybu. S aplikaci to nesouvisi, tak se to nepocita - kontrola ma
       hlidat nase skripty, ne dostupnost site. */
    const cizi = (t) => t.includes('fonts.googleapis.com') || t.includes('fonts.gstatic.com');
    const errs = [];
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      /* hlaska "Failed to load resource" nenese URL - paruje se s requestfailed */
      if (cizi(t) || t.includes('Failed to load resource')) return;
      errs.push(t);
    });
    page.on('requestfailed', (r) => {
      if (cizi(r.url())) return;
      errs.push(`${r.failure()?.errorText} ${r.url()}`);
    });
    await page.goto(BASE + '/client/dashboard', { waitUntil: 'domcontentloaded' });

    const avatar = page.locator('[data-usermenu-trigger] span').first();
    check('avatar nese iniciálu křestního jména', (await avatar.textContent()) === 'L', await avatar.textContent());
    check('nabídka je zavřená',
      (await page.locator('[data-usermenu-panel]').isVisible()) === false);

    await page.click('[data-usermenu-trigger]');
    await page.waitForTimeout(250);
    check('klik otevře nabídku', await page.locator('[data-usermenu-panel]').isVisible());
    check('nabídka má Nastavení',
      (await page.locator('[data-usermenu-panel] a[href="/client/settings/account"]').count()) === 1);
    check('nabídka má Odhlásit',
      (await page.locator('[data-usermenu-panel] form[action="/client/api/logout"] button').count()) === 1);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    check('Escape nabídku zavře', (await page.locator('[data-usermenu-panel]').isVisible()) === false);

    await page.click('[data-usermenu-trigger]');
    await page.waitForTimeout(200);
    await page.mouse.click(5, 300);
    await page.waitForTimeout(250);
    check('klik mimo nabídku zavře', (await page.locator('[data-usermenu-panel]').isVisible()) === false);
    check('žádná chyba v konzoli', errs.length === 0, errs.join(' | '));
    await page.screenshot({ path: OUT + 'set-hlavicka.png' });
    await ctx.close();
  }

  /* ---------- taby: admin vs klient ---------- */
  {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');
    await page.goto(BASE + '/client/settings', { waitUntil: 'domcontentloaded' });
    check('/client/settings vede na Můj účet', page.url().endsWith('/client/settings/account'), page.url());
    check('admin vidí tři taby', (await page.locator('nav[aria-label="Nastavení"] a').count()) === 3);
    check('aktivní tab je označený',
      (await page.locator('nav[aria-label="Nastavení"] a[aria-current="page"]').textContent()) === 'Můj účet');
    await ctx.close();
  }
  {
    const { ctx, page } = await login(browser, 'test@webkit.studio');
    await page.goto(BASE + '/client/settings/account', { waitUntil: 'domcontentloaded' });
    check('klient vidí jen jeden tab', (await page.locator('nav[aria-label="Nastavení"] a').count()) === 1);
    await page.goto(BASE + '/client/settings/users', { waitUntil: 'domcontentloaded' });
    check('klient se do správy uživatelů nedostane', page.url().endsWith('/client/settings/account'), page.url());
    await page.goto(BASE + '/client/settings/projects', { waitUntil: 'domcontentloaded' });
    check('klient se do správy projektů nedostane', page.url().endsWith('/client/settings/account'), page.url());
    await ctx.close();
  }

  /* ---------- Můj účet: jméno a heslo ---------- */
  {
    const { ctx, page } = await login(browser, 'test@webkit.studio');
    await page.goto(BASE + '/client/settings/account', { waitUntil: 'domcontentloaded' });

    await page.fill('#f-jmeno input[name=firstName]', 'Zkouška');
    await page.fill('#f-jmeno input[name=lastName]', 'Klientská');
    await page.click('#f-jmeno button[type=submit]');
    await page.waitForTimeout(2000);
    const hlavicka = await page.locator('[data-usermenu-trigger]').textContent();
    check('změněné jméno je hned v hlavičce', (hlavicka || '').includes('Zkouška K.'), (hlavicka || '').trim());

    /* špatné současné heslo neprojde */
    await page.fill('#f-heslo input[name=current]', 'tohle-neni-heslo');
    await page.fill('#f-heslo input[name=next]', 'novehesloprozkousku');
    await page.click('#f-heslo button[type=submit]');
    await page.waitForTimeout(1500);
    check('špatné současné heslo odmítnuto',
      ((await page.locator('#stav').textContent()) || '').includes('nesouhlasí'),
      await page.locator('#stav').textContent());

    /* krátké nové heslo neprojde */
    await page.fill('#f-heslo input[name=current]', creds['test@webkit.studio']);
    await page.fill('#f-heslo input[name=next]', 'krat');
    await page.click('#f-heslo button[type=submit]');
    await page.waitForTimeout(800);
    check('krátké heslo neprojde ani formulářem',
      await page.locator('#f-heslo input[name=next]').evaluate((el) => !el.checkValidity()));

    await page.screenshot({ path: OUT + 'set-ucet.png', fullPage: true });
    await ctx.close();
  }

  /* ---------- skutecna zmena hesla, na jednorazovem uctu ----------
     Zamerne NE na test@webkit.studio: menit heslo sdilenemu uctu a spolehat
     na to, ze se stihne vratit zpatky, znamena, ze prvni pad sady uprostred
     rozbije prihlaseni vsem sadam po ni. To uz se stalo a stalo to hledani. */
  {
    const { ctx: ctxA, page: admin } = await login(browser, 'lukas@webkit.studio');
    const email = `heslo-${Date.now()}@webkit.studio`;
    const zal = await admin.evaluate(async (mail) => {
      const r = await fetch('/client/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: mail, firstName: 'Heslo', lastName: 'Zkouška' })
      });
      return r.json();
    }, email);
    await ctxA.close();
    check('jednorázový účet pro test hesla založen', !!zal.password, zal.password ? 'ok' : JSON.stringify(zal));

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=email]', email);
    await page.fill('input[name=password]', zal.password);
    await page.click('button[type=submit]');
    await page.waitForTimeout(1800);

    const nove = 'noveHesloZeZkousky1';
    await page.goto(BASE + '/client/settings/account', { waitUntil: 'domcontentloaded' });
    await page.fill('#f-heslo input[name=current]', zal.password);
    await page.fill('#f-heslo input[name=next]', nove);
    await page.click('#f-heslo button[type=submit]');
    await page.waitForTimeout(2500);
    check('heslo změněno',
      ((await page.locator('#stav').textContent()) || '').includes('Heslo změněno'),
      await page.locator('#stav').textContent());
    await ctx.close();

    /* a nove heslo opravdu plati */
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page2.fill('input[name=email]', email);
    await page2.fill('input[name=password]', nove);
    await page2.click('button[type=submit]');
    await page2.waitForTimeout(1800);
    check('novým heslem se účet přihlásí', page2.url().endsWith('/client/dashboard'), page2.url());
    await ctx2.close();
  }

  /* ---------- Správa projektů ---------- */
  {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/client/settings/projects', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const pocetPred = await page.locator('#seznam > li').count();
    check('seznam se načetl i s řádkem pro přidání', pocetPred === 8, `řádků ${pocetPred}`);
    check('první řádek je Přidat projekt',
      ((await page.locator('#seznam > li').first().textContent()) || '').includes('Přidat projekt'));

    /* akordeon */
    check('tělo je zabalené',
      (await page.locator('#seznam > li').first().locator('div').last().isVisible()) === false);
    await page.locator('#seznam > li').first().locator('[role=button]').click();
    await page.waitForTimeout(300);
    check('klik rozbalí akordeon',
      await page.locator('#seznam > li').first().locator('form').isVisible());

    /* zalozeni */
    await page.fill('#seznam > li:first-child input[name=slug]', 'zkouska-projekt');
    await page.fill('#seznam > li:first-child input[name=name]', 'Zkouška');
    await page.fill('#seznam > li:first-child input[name=subtitle]', 'dočasný');
    await page.click('#seznam > li:first-child button[type=submit]');
    await page.waitForTimeout(2000);
    check('projekt založen',
      (await page.locator('#seznam > li').count()) === pocetPred + 1,
      `řádků ${await page.locator('#seznam > li').count()}`);

    /* neplatny slug */
    await page.locator('#seznam > li').first().locator('[role=button]').click();
    await page.waitForTimeout(300);
    await page.fill('#seznam > li:first-child input[name=slug]', 'Velké Písmena');
    await page.fill('#seznam > li:first-child input[name=name]', 'Nevalidní');
    await page.click('#seznam > li:first-child button[type=submit]');
    await page.waitForTimeout(1200);
    check('neplatný slug odmítnut',
      ((await page.locator('#stav').textContent()) || '').includes('malá písmena'),
      await page.locator('#stav').textContent());

    /* rezervovany slug */
    await page.fill('#seznam > li:first-child input[name=slug]', 'dashboard');
    await page.fill('#seznam > li:first-child input[name=name]', 'Kolize');
    await page.click('#seznam > li:first-child button[type=submit]');
    await page.waitForTimeout(1200);
    check('rezervovaný slug odmítnut',
      ((await page.locator('#stav').textContent()) || '').includes('systémové stránce'),
      await page.locator('#stav').textContent());

    /* uprava */
    const rad = radekS(page, 'zkouska-projekt');
    await rad.locator('[role=button]').click();
    await page.waitForTimeout(300);
    await rad.locator('input[name=name]').fill('Zkouška přejmenovaná');
    await rad.locator('button[type=submit]').click();
    await page.waitForTimeout(1800);
    check('projekt přejmenován',
      (await radekS(page, 'zkouska-projekt').textContent() || '').includes('Zkouška přejmenovaná'));

    /* smazani */
    await radekS(page, 'zkouska-projekt').locator('button[aria-label="Smazat projekt"]').click();
    await page.waitForTimeout(1800);
    check('projekt smazán',
      (await page.locator('#seznam > li').count()) === pocetPred,
      `řádků ${await page.locator('#seznam > li').count()}`);
    await page.screenshot({ path: OUT + 'set-projekty.png', fullPage: true });
    await ctx.close();
  }

  /* ---------- Správa uživatelů ---------- */
  {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');
    page.on('dialog', (d) => d.accept());
    await page.goto(BASE + '/client/settings/users', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);

    const pred = await page.locator('#seznam > li').count();
    check('seznam uživatelů se načetl', pred >= 3, `řádků ${pred}`);
    check('avatar v řádku nese iniciálu',
      (await page.locator('#seznam > li').nth(1).locator('span[aria-hidden=true]').first().textContent() || '').length === 1);

    /* zalozeni uctu - heslo se ukaze jednou */
    await page.locator('#seznam > li').first().locator('[role=button]').click();
    await page.waitForTimeout(300);
    await page.fill('#seznam > li:first-child input[name=email]', 'zkouska@webkit.studio');
    await page.fill('#seznam > li:first-child input[name=firstName]', 'Zkušební');
    await page.fill('#seznam > li:first-child input[name=lastName]', 'Účet');
    await page.click('#seznam > li:first-child button[type=submit]');
    await page.waitForTimeout(2500);
    check('účet založen', (await page.locator('#seznam > li').count()) === pred + 1);

    const novy = radekS(page, 'zkouska@webkit.studio');
    await novy.locator('[role=button]').click();
    await page.waitForTimeout(300);
    const heslo = await novy.locator('input[readonly]').inputValue();
    check('vygenerované heslo je v řádku vidět', heslo.length >= 12, `${heslo.length} znaků`);

    /* pristupy */
    await novy.locator('input[type=checkbox]').first().check();
    await page.waitForTimeout(1500);
    check('přístup uložen',
      ((await page.locator('#stav').textContent()) || '').includes('Přístupy'),
      await page.locator('#stav').textContent());

    /* nove heslo */
    await novy.locator('button', { hasText: 'Generovat' }).click();
    await page.waitForTimeout(2500);
    const znovu = radekS(page, 'zkouska@webkit.studio');
    await znovu.locator('[role=button]').click();
    await page.waitForTimeout(300);
    const heslo2 = await znovu.locator('input[readonly]').inputValue();
    check('vygenerované heslo je nové', heslo2.length >= 12 && heslo2 !== heslo);

    /* admin nema kos */
    const adminRadek = radekS(page, 'lukas@webkit.studio');
    check('admin nemá koš', (await adminRadek.locator('button[aria-label="Smazat účet"]').count()) === 0);

    /* smazani */
    await radekS(page, 'zkouska@webkit.studio').locator('button[aria-label="Smazat účet"]').click();
    await page.waitForTimeout(2000);
    check('účet smazán', (await page.locator('#seznam > li').count()) === pred,
      `řádků ${await page.locator('#seznam > li').count()}`);
    await page.screenshot({ path: OUT + 'set-uzivatele.png', fullPage: true });
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
