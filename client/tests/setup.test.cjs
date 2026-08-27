/* Zalozeni databaze pres formular - vcetne tokenu s "+", ktery v adrese
   selhaval.

   Test si prazdnou databazi udela sam. Drive cekal, ze mu ji nekdo pripravi,
   takze po prvnim behu uz nikdy neprosel: stranka setupu se po zalozeni
   spravne uzavre a pole #token na ni neni. Ted tabulky nejdriv zahodi, projde
   cely formular a vygenerovana hesla zapise do creds.txt, ze ktereho ctou
   ostatni testy. Proto patri v poradi jako prvni.

   Sahá se VYHRADNE na lokalni D1 (--local --persist-to .wrangler-local).
   Zadny prikaz tady nemiri na nasazenou databazi. */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8788';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';
const SECRET = 'lokalni-testovaci-tajemstvi-jen-pro-vyvoj-000';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

/* Poradi kvuli cizim klicum: nejdriv to, co na jine tabulky odkazuje. */
const TABULKY = ['request_log', 'comments', 'project_access', 'sessions', 'projects', 'users'];

function vycistiLokalniDb() {
  const sql = TABULKY.map((t) => `DROP TABLE IF EXISTS ${t};`).join(' ');
  execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', 'DB', '-c', 'dist/server/wrangler.json',
     '--local', '--persist-to', '.wrangler-local', '--command', sql],
    { stdio: 'pipe' }
  );
}

(async () => {
  vycistiLokalniDb();

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const p = await b.newPage();

  await p.goto(BASE + '/client/setup', { waitUntil: 'domcontentloaded' });
  check('setup stránka je veřejná', p.url().endsWith('/client/setup'), p.url());
  check('nad prázdnou databází nabídne formulář', (await p.locator('#token').count()) === 1);

  /* spatny token */
  await p.fill('#token', 'uplne-spatny-token');
  await p.click('#f button[type=submit]');
  await p.waitForTimeout(1500);
  let out = await p.locator('#out').textContent();
  check('špatný token odmítnut', (out || '').includes('Neplatný token'), (out || '').slice(0, 40));

  /* spravny token */
  await p.fill('#token', SECRET);
  await p.click('#f button[type=submit]');
  await p.waitForTimeout(9000);
  out = await p.locator('#out').textContent();
  check('databáze založena', (out || '').includes('Hotovo. Přihlas se'), (out || '').slice(-60));
  check('vypsala hesla obou účtů',
    (out || '').includes('lukas@webkit.studio') && (out || '').includes('test@webkit.studio'));
  check('vložilo 7 projektů', (out || '').includes('7 projektů'));
  check('všechny kroky hotové', ((out || '').match(/hotovo/g) || []).length === 4, `hotovo x${((out || '').match(/hotovo/g) || []).length}`);

  const vytahni = (email) => {
    const m = (out || '').match(new RegExp(email.replace('.', '\\.') + '\\s+\\S+\\s+(\\S+)'));
    return m ? m[1] : null;
  };
  const heslo = vytahni('lukas@webkit.studio');
  const hesloKlient = vytahni('test@webkit.studio');
  check('heslo admina vyčteno', !!heslo && heslo.length >= 12, heslo ? `${heslo.length} znaků` : 'chybí');
  check('heslo klienta vyčteno', !!hesloKlient && hesloKlient.length >= 12, hesloKlient ? `${hesloKlient.length} znaků` : 'chybí');

  /* Hesla predame ostatnim testum - ctou je z creds.txt. */
  if (heslo && hesloKlient) {
    fs.writeFileSync(OUT + 'creds.txt',
      `--- HESLA (nikam neukládat, jen předat) ---\n` +
      `lukas@webkit.studio\tadmin\t${heslo}\n` +
      `test@webkit.studio\tclient\t${hesloKlient}\n`);
  }

  /* podruhe uz ne */
  await p.goto(BASE + '/client/setup', { waitUntil: 'domcontentloaded' });
  const body = await p.locator('main').textContent();
  check('podruhé se stránka uzavře', (body || '').includes('už je založená'), (body || '').trim().slice(0, 50));
  check('podruhé tam pole tokenu není', (await p.locator('#token').count()) === 0);

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
