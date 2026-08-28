/* Spousteni testovaci sady.
 *
 * Proc to neni jen retezec "node tests/a && node tests/b":
 * wrangler dev si obcas sam shodi ProxyController prazdnou chybou
 *   ProxyController2.emitErrorEvent -> castErrorCause
 * a server umre uprostred sady. Vypada to jako nedeterministicka chyba
 * aplikace, ale je to vada lokalniho vyvojoveho serveru - v produkci bezi
 * skutecny Worker a zadny proxy controller tam neni.
 *
 * Sada proto po kazdem nezdaru rozlisi dva pripady:
 *   - server zije  -> test opravdu selhal, nic se neopakuje;
 *   - server umrel -> nastartuje se znovu a sada se pusti jeste jednou.
 * Skutecne selhani se tim nezamaskuje.
 */
import { spawnSync } from 'node:child_process';

const SUITY = [
  'setup', 'auth', 'project', 'comments', 'viewer', 'settings', 'csrf', 'export', 'admin',
  /* redirect si staticky server pousti sam a na wrangler dev nezavisi */
  'redirect'
];
const SERVE = '/tmp/claude-0/-home-user-draft-webkit-studio/8450cabb-61dd-524b-850e-19e315a98ea1/scratchpad/serve.sh';
const ZDRAVI = 'http://127.0.0.1:8788/client/login';

async function serverZije() {
  try {
    const res = await fetch(ZDRAVI, { headers: { connection: 'close' } });
    return res.status === 200;
  } catch {
    return false;
  }
}

function nastartuj() {
  const r = spawnSync('sh', [SERVE], { encoding: 'utf8' });
  process.stdout.write(r.stdout || '');
  return r.status === 0;
}

async function zajistiServer() {
  if (await serverZije()) return true;
  console.log('… server neběží, startuji');
  return nastartuj();
}

const selhalo = [];
for (const suita of SUITY) {
  console.log(`\n=== ${suita} ===`);
  if (!(await zajistiServer())) {
    console.log(`${suita}: server se nepodařilo nastartovat`);
    selhalo.push(suita);
    continue;
  }

  let hotovo = false;
  for (let pokus = 1; pokus <= 2; pokus++) {
    const kod = spawnSync('node', [`tests/${suita}.test.cjs`], { stdio: 'inherit' }).status;
    if (kod === 0) { hotovo = true; break; }
    if (await serverZije()) break;          /* opravdové selhání testu */
    console.log(`… wrangler dev spadl, ${suita} jede znovu (pokus ${pokus + 1})`);
    if (!nastartuj()) break;
  }
  if (!hotovo) selhalo.push(suita);
}

console.log('\n================================');
if (selhalo.length) {
  console.log(`SELHALO: ${selhalo.join(', ')}`);
  process.exit(1);
}
console.log(`Všech ${SUITY.length} sad prošlo.`);
