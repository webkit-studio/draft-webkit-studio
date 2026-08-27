/* Stránka projektu: kdo ji uvidí a co na ní je. */
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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  {
    const { ctx, page } = await login(browser, 'test@webkit.studio');
    const res = await page.goto(BASE + '/client/arbosis', { waitUntil: 'domcontentloaded' });
    check('klient otevře svůj projekt', res.status() === 200, `stav ${res.status()}`);
    const h1 = await page.locator('h1').textContent();
    check('je tam název projektu', (h1 || '').includes('Arbosis'), h1 || '');
    const verze = await page.locator('main .border-b').count();
    check('vypsané dvě verze', verze === 2, `nalezeno ${verze}`);
    const pc = await page.locator('a[href="/client/arbosis/v2/desktop"]').count();
    const mob = await page.locator('a[href="/client/arbosis/v2/mobile"]').count();
    check('odkazy Počítač i Mobil', pc === 1 && mob === 1, `pc=${pc} mobil=${mob}`);
    const cobrand = await page.locator('header').textContent();
    check('co-brand ukazuje klienta', (cobrand || '').includes('Arbosis'), (cobrand || '').trim().slice(0, 50));

    const cizi = await page.goto(BASE + '/client/anse', { waitUntil: 'domcontentloaded' });
    check('klient NEotevře cizí projekt', cizi.status() === 403, `stav ${cizi.status()}`);

    const nic = await page.goto(BASE + '/client/neexistuje', { waitUntil: 'domcontentloaded' });
    check('neexistující projekt odmítnut', nic.status() === 403 || nic.status() === 404, `stav ${nic.status()}`);
    await ctx.close();
  }

  {
    const { ctx, page } = await login(browser, 'lukas@webkit.studio');
    const res = await page.goto(BASE + '/client/anse', { waitUntil: 'domcontentloaded' });
    check('admin otevře libovolný projekt', res.status() === 200, `stav ${res.status()}`);
    const prazdno = await page.locator('main').textContent();
    check('projekt bez verzí to řekne', (prazdno || '').includes('žádná verze'), (prazdno || '').trim().slice(0, 60));
    await page.screenshot({ path: OUT + 'app-project.png', fullPage: true });
    await ctx.close();
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
