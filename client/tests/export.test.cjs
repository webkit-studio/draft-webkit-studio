/* Export komentářů tokenem: co pustí a hlavně co nepustí.
   Endpoint běží bez session, takže je to jediná pojistka - míří se sem přímo. */
const { chromium } = require('playwright-core');
const { execFileSync } = require('child_process');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8788';
const URLE = BASE + '/client/api/export/comments';
const OUT = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/';
const SERVE = OUT + 'serve.sh';
/* Wrangler bezi s -c dist/server/wrangler.json a promenne cte z kopie vedle
   nej, ne z client/.dev.vars. Build tam soubor prekopiruje pri kazdem behu,
   takze uprava tehle kopie je docasna a rebuild ji srovna. */
const DEVVARS = 'dist/server/.dev.vars';
const TOKEN = 'lokalni-export-token-jen-pro-vyvoj-0000';

const creds = {};
for (const l of fs.readFileSync(OUT + 'creds.txt', 'utf8').split('\n')) {
  const m = l.match(/^(\S+@\S+)\s+(\S+)\s+(\S+)\s*$/); if (m) creds[m[1]] = m[3];
}

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

/* Po restartu serveru drzi node ve fondu spojeni na uz mrtvy proces a prvni
   pozadavek spadne na "other side closed". Neni to chyba aplikace, jen
   znovupouzite spojeni - proto se sitova chyba par krat zopakuje. */
async function zavolej(path, init = {}) {
  let posledni;
  for (let pokus = 0; pokus < 5; pokus++) {
    try {
      const res = await fetch(URLE + path, { ...init, headers: { connection: 'close', ...(init.headers || {}) } });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch { /* md nebo prosty text */ }
      return {
        status: res.status, text, json,
        type: res.headers.get('content-type') || '',
        cache: res.headers.get('cache-control') || ''
      };
    } catch (e) {
      posledni = e;
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  throw posledni;
}

(async () => {
  /* --- do v1 je potreba aspon jeden komentar, at jde overit filtr verze --- */
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[name=email]', 'lukas@webkit.studio');
    await page.fill('input[name=password]', creds['lukas@webkit.studio']);
    await page.click('button[type=submit]');
    await page.waitForTimeout(1600);
    await page.evaluate(async () => {
      await fetch('/client/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'arbosis', version: 'v1', view: 'desktop',
          section: 'D0 Navigace', x: 0.4, y: 0.4, body: 'Komentar ve v1 pro export'
        })
      });
    });
    await ctx.close();
  }
  await browser.close();

  /* --- overeni tokenu --- */
  check('bez hlavičky vrací 404', (await zavolej('?project=arbosis')).status === 404);
  check('špatný token vrací 404',
    (await zavolej('?project=arbosis', { headers: { 'X-Export-Token': 'spatny-token' } })).status === 404);
  check('token stejné délky, jiný obsah, taky 404',
    (await zavolej('?project=arbosis', { headers: { 'X-Export-Token': 'X'.repeat(TOKEN.length) } })).status === 404);

  const ok = await zavolej('?project=arbosis', { headers: { 'X-Export-Token': TOKEN } });
  check('správný token vrací 200', ok.status === 200, `stav ${ok.status}`);
  check('odpověď je JSON', ok.type.includes('application/json'), ok.type);
  check('odpověď se necachuje', ok.cache.includes('no-store'), ok.cache);

  /* --- obsah --- */
  const vse = ok.json;
  check('count sedí s počtem komentářů', vse.count === vse.comments.length, `${vse.count} / ${vse.comments.length}`);
  check('vrací i odpovědi i kořeny', vse.count >= 2, `${vse.count}`);
  const casy = vse.comments.map((c) => c.createdAt);
  check('řazeno podle created_at vzestupně',
    casy.every((t, i) => i === 0 || casy[i - 1] <= t), casy.join(' | ').slice(0, 80));
  const prvni = vse.comments[0];
  check('komentář má očekávaná pole',
    ['id', 'version', 'view', 'section', 'x', 'y', 'parentId', 'authorName', 'body', 'resolved', 'createdAt']
      .every((k) => k in prvni), Object.keys(prvni).join(','));

  /* --- nic z users --- */
  const syrove = ok.text;
  check('v odpovědi není author_id', !syrove.includes('author_id') && !('authorId' in prvni));
  check('v odpovědi není žádný e-mail', !/@[a-z0-9.-]+\.[a-z]{2,}/i.test(syrove),
    (syrove.match(/@[a-z0-9.-]+\.[a-z]{2,}/i) || [''])[0]);

  /* --- filtr verze --- */
  const verze = new Set(vse.comments.map((c) => c.version));
  check('bez version vrátí v1 i v2', verze.has('v1') && verze.has('v2'), [...verze].join(','));
  const jenV2 = await zavolej('?project=arbosis&version=v2', { headers: { 'X-Export-Token': TOKEN } });
  check('s version=v2 jen v2',
    jenV2.json.comments.every((c) => c.version === 'v2') && jenV2.json.comments.length > 0,
    `${jenV2.json.count} komentářů`);
  check('filtr verze počet zmenšil', jenV2.json.count < vse.count, `${jenV2.json.count} < ${vse.count}`);

  /* --- markdown --- */
  const md = await zavolej('?project=arbosis&version=v2&format=md', { headers: { 'X-Export-Token': TOKEN } });
  check('markdown má správný typ', md.type.includes('text/markdown') && md.type.includes('utf-8'), md.type);
  check('markdown má nadpis projektu', md.text.startsWith('# arbosis – v2 – komentáře'), md.text.slice(0, 40));
  check('markdown řadí po sekcích', md.text.includes('\n## '), '');
  check('markdown čísluje komentáře', /\*\*1\. /.test(md.text));

  /* --- metody --- */
  check('POST se správným tokenem vrací 405',
    (await zavolej('?project=arbosis', { method: 'POST', headers: { 'X-Export-Token': TOKEN } })).status === 405);
  check('POST bez tokenu vrací 404, ne 405',
    (await zavolej('?project=arbosis', { method: 'POST' })).status === 404);
  check('DELETE se správným tokenem vrací 405',
    (await zavolej('?project=arbosis', { method: 'DELETE', headers: { 'X-Export-Token': TOKEN } })).status === 405);

  /* --- chybejici project --- */
  check('bez parametru project vrací 400',
    (await zavolej('', { headers: { 'X-Export-Token': TOKEN } })).status === 400);

  /* --- nenastaveny token = vypnuto, ne otevreno --- */
  const puvodni = fs.readFileSync(DEVVARS, 'utf8');
  try {
    fs.writeFileSync(DEVVARS, puvodni.split('\n').filter((l) => !l.startsWith('EXPORT_TOKEN=')).join('\n'));
    execFileSync('sh', [SERVE], { stdio: 'pipe' });
    const bez = await zavolej('?project=arbosis', { headers: { 'X-Export-Token': TOKEN } });
    check('bez EXPORT_TOKEN vrací 503', bez.status === 503, `stav ${bez.status}`);
    check('a říká export-disabled', (bez.json || {}).error === 'export-disabled', bez.text.slice(0, 60));
    const bezNic = await zavolej('?project=arbosis');
    check('bez EXPORT_TOKEN nepustí ani bez hlavičky', bezNic.status === 503, `stav ${bezNic.status}`);
  } finally {
    fs.writeFileSync(DEVVARS, puvodni);
    execFileSync('sh', [SERVE], { stdio: 'pipe' });
  }
  check('po vrácení proměnné export zase jede',
    (await zavolej('?project=arbosis', { headers: { 'X-Export-Token': TOKEN } })).status === 200);

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  process.exit(fail ? 1 : 0);
})();
