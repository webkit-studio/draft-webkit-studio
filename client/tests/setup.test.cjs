/* Zalozeni databaze pres formular - vcetne tokenu s "+", ktery v adrese
   selhaval. Test bezi proti prazdne databazi. */
const { chromium } = require('playwright-core');
const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';
const SECRET = 'lokalni-testovaci-tajemstvi-jen-pro-vyvoj-000';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();

  await p.goto(BASE + '/client/setup', { waitUntil: 'domcontentloaded' });
  check('setup stránka je veřejná', p.url().endsWith('/client/setup'), p.url());

  /* spatny token */
  await p.fill('#token', 'uplne-spatny-token');
  await p.click('#f button[type=submit]');
  await p.waitForTimeout(1500);
  let out = await p.locator('#out').textContent();
  check('špatný token odmítnut', (out || '').includes('Neplatný token'), (out || '').slice(0, 40));

  /* spravny token */
  await p.fill('#token', SECRET);
  await p.click('#f button[type=submit]');
  await p.waitForTimeout(4000);
  out = await p.locator('#out').textContent();
  check('databáze založena', (out || '').includes('Hotovo'), (out || '').slice(0, 40));
  check('vypsala hesla obou účtů',
    (out || '').includes('lukas@webkit.studio') && (out || '').includes('test@webkit.studio'));
  check('vypsala počet projektů', (out || '').includes('Projektů: 7'));

  const m = (out || '').match(/lukas@webkit\.studio\s+admin\s+(\S+)/);
  const heslo = m ? m[1] : null;
  check('heslo admina vyčteno', !!heslo && heslo.length >= 12, heslo ? `${heslo.length} znaků` : 'chybí');

  /* podruhe uz ne */
  await p.goto(BASE + '/client/setup', { waitUntil: 'domcontentloaded' });
  const body = await p.locator('main').textContent();
  check('podruhé se stránka uzavře', (body || '').includes('už je založená'), (body || '').trim().slice(0, 50));

  /* prihlaseni vygenerovanym heslem */
  if (heslo) {
    await p.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await p.fill('input[name=email]', 'lukas@webkit.studio');
    await p.fill('input[name=password]', heslo);
    await p.click('button[type=submit]');
    await p.waitForTimeout(2000);
    check('admin se přihlásí', p.url().endsWith('/client/dashboard'), p.url());
    check('vidí 7 projektů', (await p.locator('main li').count()) === 7);
    await p.screenshot({ path: OUT + 'app-setup-hotovo.png', fullPage: true });
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
