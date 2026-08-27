/* Prohlizec navrhu: platno, lista, komentare - vcetne dotykove obsluhy,
   ktera byla puvodni chybou a nesmi se pri prenosu ztratit. */
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

async function login(browser, email, device) {
  const ctx = await browser.newContext(device || {});
  const page = await ctx.newPage();
  await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', creds[email]);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1600);
  return { ctx, page };
}

const iphone = { viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1' };

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const faze = process.env.FAZE || 'vse';

  if (faze === 'vse' || faze === 'desktop') {
    const { ctx, page } = await login(browser, 'test@webkit.studio', { viewport: { width: 1600, height: 950 } });
    const errs = [];
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

    const res = await page.goto(BASE + '/client/arbosis/v2/desktop', { waitUntil: 'domcontentloaded' });
    check('prohlížeč se otevře', res.status() === 200, `stav ${res.status()}`);
    await page.waitForTimeout(2000);

    check('plátno je na stránce', (await page.locator('#frame').count()) === 1);
    const sekce = await page.locator('#frame [data-screen-label]').count();
    check('plátno má sekce', sekce === 9, `nalezeno ${sekce}`);

    check('lišta má jméno uživatele', ((await page.locator('.bar .who').textContent()) || '').includes('Testovací'));
    check('odkaz Zpět míří na projekt',
      (await page.locator('.bar a.back').getAttribute('href')) === '/client/arbosis',
      await page.locator('.bar a.back').getAttribute('href'));
    check('přepínač míří na nové cesty',
      (await page.locator('.switch a').nth(1).getAttribute('href')) === '/client/arbosis/v2/mobile',
      await page.locator('.switch a').nth(1).getAttribute('href'));

    check('tlačítko komentářů je vidět', await page.locator('.cbtn[data-comments-toggle]').isVisible());
    check('segment Přidat komentář existuje', (await page.locator('[data-comments-add]').count()) === 1);
    check('žádná chyba v konzoli', errs.length === 0, errs.join(' | '));

    /* pridani komentare mysi */
    await page.click('[data-comments-add]');
    await page.waitForTimeout(400);
    const t = await page.evaluate(() => {
      for (const s of document.querySelectorAll('#frame [data-screen-label]')) {
        const r = s.getBoundingClientRect();
        const cy = r.top + Math.min(Math.max(r.height / 2, 20), 300);
        if (cy > 100 && cy < window.innerHeight - 20) return { x: r.left + r.width / 2, y: cy };
      }
      return null;
    });
    await page.mouse.click(t.x, t.y);
    await page.waitForTimeout(500);
    check('composer se otevřel', await page.locator('.ccomp.on').count() === 1);
    await page.fill('.ccomp textarea', 'Komentar z prohlizece');
    await page.click('.ccomp button.cprim');
    await page.waitForTimeout(2500);
    const piny = await page.locator('.cpin').count();
    check('komentář uložen a pin vykreslen', piny >= 1, `pinů ${piny}`);
    const err = await page.locator('.ccomp .cerr').textContent().catch(() => '');
    check('bez chybové hlášky', !err || err.trim() === '', (err || '').slice(0, 60));

    /* Rezim pridavani se po ulozeni NEvypina - jinak se pri pripominkovani
       musi tlacitko mackat po kazdem komentari znovu. */
    check('režim přidávání zůstal zapnutý',
      (await page.locator('[data-comments-add]').getAttribute('aria-pressed')) === 'true');
    check('pulzující tečka je vidět', await page.locator('[data-comments-add] .cdot').isVisible());

    const t2 = await page.evaluate(() => {
      for (const s of document.querySelectorAll('#frame [data-screen-label]')) {
        const r = s.getBoundingClientRect();
        const cy = r.top + Math.min(Math.max(r.height / 2, 20), 300);
        if (cy > 100 && cy < window.innerHeight - 20) return { x: r.left + r.width / 4, y: cy };
      }
      return null;
    });
    await page.mouse.click(t2.x, t2.y);
    await page.waitForTimeout(500);
    check('druhý komentář jde přidat bez dalšího kliknutí na tlačítko',
      (await page.locator('.ccomp.on').count()) === 1);

    /* Vypne to az tlacitko. */
    await page.click('[data-comments-add]');
    await page.waitForTimeout(300);
    check('tlačítko režim vypne',
      (await page.locator('[data-comments-add]').getAttribute('aria-pressed')) === 'false');
    check('composer se zavřel', (await page.locator('.ccomp.on').count()) === 0);

    await page.screenshot({ path: OUT + 'app-viewer-desktop.png' });
    await ctx.close();
  }

  if (faze === 'vse' || faze === 'iphone') {
    const { ctx, page } = await login(browser, 'test@webkit.studio', iphone);
    await page.goto(BASE + '/client/arbosis/v2/mobile', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    check('iPhone: prohlížeč se otevře', (await page.locator('#frame').count()) === 1);

    await page.tap('[data-comments-add]');
    await page.waitForTimeout(400);
    check('iPhone: režim přidávání zapnut', (await page.locator('.ccatch.on').count()) === 1);

    const t = await page.evaluate(() => {
      for (const s of document.querySelectorAll('#frame [data-screen-label]')) {
        const r = s.getBoundingClientRect();
        const cy = r.top + Math.min(Math.max(r.height / 2, 20), 200);
        if (cy > 120 && cy < window.innerHeight - 40) return { x: r.left + r.width / 2, y: cy };
      }
      return null;
    });
    await page.touchscreen.tap(t.x, t.y);
    await page.waitForTimeout(600);
    check('iPhone: klepnutí otevře composer', (await page.locator('.ccomp.on').count()) === 1);
    await page.fill('.ccomp textarea', 'Komentar z iPhonu');
    await page.tap('.ccomp button.cprim');
    await page.waitForTimeout(2500);
    check('iPhone: komentář uložen', (await page.locator('.cpin').count()) >= 1);
    await page.screenshot({ path: OUT + 'app-viewer-iphone.png' });
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
