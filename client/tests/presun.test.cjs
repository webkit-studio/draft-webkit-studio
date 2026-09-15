/* Trvale presmerovani /client -> /dashboard (middleware). Tabulka odpovida
   docs/navod.md v repu webkit-studio/dashboard, sekce Prepnuti. Bezi proti
   wrangler dev na 8788, bez databaze - 301 vznika drive, nez se na ni sahne. */
const BASE = 'http://127.0.0.1:8788';
let pass = 0, fail = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'OK  ' : 'CHYBA'} ${n}${d ? '  ' + d : ''}`); ok ? pass++ : fail++; };

const CILE = {
  '/client': '/dashboard',
  '/client/login': '/dashboard/login',
  '/client/dashboard': '/dashboard',
  '/client/settings/account': '/dashboard/nastaveni',
  '/client/admin/users': '/dashboard',
  '/client/arbosis': '/dashboard/projekty/arbosis',
  '/client/arbosis/prehled': '/dashboard/projekty/arbosis',
  '/client/arbosis/ukoly': '/dashboard/projekty/arbosis/ukoly',
  '/client/arbosis/faktury': '/dashboard/projekty/arbosis/faktury',
  '/client/arbosis/v1/desktop.html': '/dashboard/arbosis/v1/desktop',
  '/client/arbosis/v2/mobile.html': '/dashboard/arbosis/v2/mobile',
  '/client/arbosis/v1/desktop': '/dashboard/arbosis/v1/desktop',
  '/client/vymysli/v3/mobile': '/dashboard/vymysli/v3/mobile',
  '/client/api/export/comments': '/dashboard/api/export/comments',
  '/client/neco/uplne/jineho': '/dashboard/neco/uplne/jineho',
  /* query se zachova, next z prihlaseni se prepise */
  '/client/arbosis?x=1': '/dashboard/projekty/arbosis?x=1',
  '/client/login?next=%2Fclient%2Farbosis%2Fv1%2Fdesktop.html': '/dashboard/login?next=%2Fdashboard%2Farbosis%2Fv1%2Fdesktop',
  '/client/login?next=%2Fclient%2Farbosis%3Fa%3D1': '/dashboard/login?next=%2Fdashboard%2Fprojekty%2Farbosis',
  '/client/login?next=https%3A%2F%2Fevil.example%2F': '/dashboard/login'
};

(async () => {
  for (const [stara, nova] of Object.entries(CILE)) {
    let res;
    try {
      res = await fetch(BASE + stara, { redirect: 'manual', headers: { connection: 'close' } });
    } catch (e) {
      check(stara, false, String(e));
      continue;
    }
    const loc = res.headers.get('location') || '';
    check(stara, res.status === 301 && loc === nova, `${res.status} ${loc}`);
    check(`${stara} no-store`, res.headers.get('cache-control') === 'no-store');
  }
  /* /client/ s lomitkem srovna na /client uz Astro (vlastni 301 pred
     middlewarem), do /dashboard tedy vede dvema skoky - retez musi drzet */
  const lomitko = await fetch(BASE + '/client/', { redirect: 'manual', headers: { connection: 'close' } });
  const prvni = lomitko.headers.get('location') || '';
  let druhy = prvni;
  if (prvni !== '/dashboard') {
    const dal = await fetch(BASE + prvni, { redirect: 'manual', headers: { connection: 'close' } });
    druhy = dal.status === 301 ? (dal.headers.get('location') || '') : '';
  }
  check('/client/ (řetěz)', lomitko.status === 301 && druhy === '/dashboard', `${lomitko.status} ${prvni} -> ${druhy}`);

  /* POST i cizi metody se presmeruji stejne - nic uz se tu nezpracovava */
  const post = await fetch(BASE + '/client/api/login', { method: 'POST', redirect: 'manual', headers: { connection: 'close' } });
  check('POST /client/api/login', post.status === 301 && post.headers.get('location') === '/dashboard/api/login', `${post.status} ${post.headers.get('location')}`);

  console.log(`\n${pass} prošlo, ${fail} selhalo`);
  process.exit(fail ? 1 : 0);
})();
