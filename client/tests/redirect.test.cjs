/* Presmerovani stareho statickeho webu (draft.webkit.studio) do nove aplikace.
   Supabase je vypnuta, takze puvodni stranky uz se neodemknou - misto rozbite
   brany posilaji cloveka na odpovidajici adresu pod /client.

   Test si staticky server spusti sam, at na nem nikdo nemusi myslet. */
const { chromium } = require('playwright-core');
const { spawn } = require('child_process');
const path = require('path');

const KOREN = path.resolve(__dirname, '../..');
const PORT = 8099;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

const CILE = {
  '/index.html': 'https://webkit.studio/client',
  '/arbosis/index.html': 'https://webkit.studio/client/arbosis',
  '/arbosis/v1/desktop.html': 'https://webkit.studio/client/arbosis/v1/desktop',
  '/arbosis/v2/mobile.html': 'https://webkit.studio/client/arbosis/v2/mobile',
  '/vymysli/index.html': 'https://webkit.studio/client/vymysli',
  '/404.html': 'https://webkit.studio/client'
};

async function pockejNaServer() {
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch(BASE + '/index.html', { headers: { connection: 'close' } });
      if (r.status === 200) return true;
    } catch { /* jeste nenabehl */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'],
    { cwd: KOREN, stdio: 'ignore' });
  const konec = () => { try { server.kill('SIGKILL'); } catch { /* uz je pryc */ } };
  process.on('exit', konec);

  if (!(await pockejNaServer())) {
    console.log('CHYBA statický server nenaběhl');
    konec();
    process.exit(1);
  }

  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext();

  /* Ven ze sandboxu se stejne nedostaneme, tak cil odchytime a jen overime,
     na jakou adresu prohlizec skutecne miri. */
  const videno = [];
  await ctx.route('https://webkit.studio/**', (route) => {
    videno.push(route.request().url());
    route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>cil</h1>' });
  });

  for (const [cesta, cil] of Object.entries(CILE)) {
    const page = await ctx.newPage();
    videno.length = 0;
    await page.goto(BASE + cesta, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    check(`${cesta} přesměruje`, page.url() === cil, page.url());
    await page.close();
  }

  /* Zpet se nesmi vracet na presmerovaci stranku dokola. */
  {
    const page = await ctx.newPage();
    await page.goto(BASE + '/arbosis/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(700);
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    check('tlačítko Zpět nezacyklí', !page.url().includes('/arbosis/index.html'), page.url());
    await page.close();
  }

  /* Bez JavaScriptu musi zabrat meta refresh. */
  {
    const ctx2 = await b.newContext({ javaScriptEnabled: false });
    await ctx2.route('https://webkit.studio/**', (r) =>
      r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>cil</h1>' }));
    const page = await ctx2.newPage();
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    check('bez JavaScriptu zabere meta refresh',
      page.url() === 'https://webkit.studio/client', page.url());
    await ctx2.close();
  }

  /* Obsah se cte primo ze serveru, ne z otevrene stranky: ta uz je v tu chvili
     presmerovana a page.content() by vratil cil, ne presmerovaci stranku. */
  {
    const html = await (await fetch(BASE + '/index.html', { headers: { connection: 'close' } })).text();
    check('stránka nenačítá gate.js ani config.js',
      !html.includes('gate.js') && !html.includes('config.js'));
    check('drží noindex', html.includes('noindex'));
    check('má meta refresh i pro prohlížeč bez JS', /http-equiv="refresh"/.test(html));
  }

  /* Archiv zustava netknuty - pravidlo 1 v CLAUDE.md. */
  {
    const wf = await fetch(BASE + '/arbosis/v1/wireframe.html', { headers: { connection: 'close' } });
    const html = await wf.text();
    check('wireframe archiv zůstal beze změny',
      wf.status === 200 && !html.includes('Prostředí se přestěhovalo'), `stav ${wf.status}`);
  }

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  await b.close();
  konec();
  process.exit(fail ? 1 : 0);
})();
