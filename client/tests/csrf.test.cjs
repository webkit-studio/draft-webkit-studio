/* CSRF: legitimni prihlaseni musi projit, cizi web ne.
   Duvod testu: vestavena kontrola Astra tady odmitala i vlastni formular,
   protoze Worker za Webflow Cloud vidi interni Host, ne verejnou domenu. */
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

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });

  /* 1) vlastni formular projde */
  const p = await b.newPage();
  await p.goto(BASE + '/client/login', { waitUntil: 'domcontentloaded' });
  await p.fill('input[name=email]', 'lukas@webkit.studio');
  await p.fill('input[name=password]', creds['lukas@webkit.studio']);
  await p.click('button[type=submit]');
  await p.waitForTimeout(2000);
  check('vlastní formulář projde', p.url().endsWith('/client/dashboard'), p.url());

  /* 2) POST s cizim Originem musi dostat 403 */
  const cizi = await p.evaluate(async () => {
    const res = await fetch('/client/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project: 'arbosis', version: 'v2', view: 'desktop', section: 'X', x: 0, y: 0, body: 'test' })
    });
    return res.status;
  });
  check('vlastní POST na API projde', cizi === 201 || cizi === 403 ? cizi !== 403 : false, `stav ${cizi}`);

  await b.close();

  /* 3) simulace ciziho webu - Origin hlavickou primo */
  const https = require('http');
  const zkus = (origin) => new Promise((res) => {
    const data = 'email=x&password=y';
    const r = https.request({ host: '127.0.0.1', port: 8788, path: '/client/api/login', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': data.length, Origin: origin } },
      (x) => { let t=''; x.on('data', c=>t+=c); x.on('end', ()=>res({ status: x.statusCode, body: t.slice(0,80) })); });
    r.write(data); r.end();
  });
  const zly = await zkus('https://zly-web.example');
  check('cizí Origin odmítnut', zly.status === 403, `stav ${zly.status}`);
  const dobry = await zkus('https://webkit.studio');
  check('webkit.studio povolen', dobry.status !== 403, `stav ${dobry.status}`);
  const staging = await zkus('https://webkit-studio.webflow.io');
  check('staging doména povolena', staging.status !== 403, `stav ${staging.status}`);

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  process.exit(fail ? 1 : 0);
})();
