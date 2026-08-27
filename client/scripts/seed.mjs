/* Vygeneruje SQL pro počáteční naplnění databáze: dva účty a projekty
   převzaté ze Supabase zálohy. Hesla se vypíšou na stdout a nikam se
   neukládají - do repa nepatří.
   Použití: node scripts/seed.mjs > /tmp/seed.sql */

const ITERATIONS = 210_000;
const enc = new TextEncoder();

const b64 = (bytes) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' }, key, 256
  );
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
function generatePassword(length = 16) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

const users = [
  { id: crypto.randomUUID(), email: 'lukas@webkit.studio', first: 'Lukáš', last: 'Svoboda', role: 'admin' },
  { id: crypto.randomUUID(), email: 'test@webkit.studio', first: 'Testovací', last: 'Uživatel', role: 'client' }
];

const projects = [
  ['anse', 'Anse', 10],
  ['arbosis', 'Arbosis', 20],
  ['crr', 'Centrum pro regionální rozvoj', 30],
  ['elektro-drapac', 'Elektro Drapač', 40],
  ['mirek-slavicek', 'Mirek Slavíček', 50],
  ['omedetou', 'Omedetou', 60],
  ['vymysli', 'Vymysli.cz', 70]
];

const esc = (s) => String(s).replace(/'/g, "''");
const lines = [];

for (const [slug, name, sort] of projects) {
  lines.push(`INSERT INTO projects (slug, name, sort) VALUES ('${slug}', '${esc(name)}', ${sort});`);
}

const creds = [];
for (const u of users) {
  const pw = process.env[`PW_${u.role.toUpperCase()}`] || generatePassword();
  const hash = await hashPassword(pw);
  creds.push({ email: u.email, password: pw, role: u.role });
  lines.push(
    `INSERT INTO users (id, email, password_hash, first_name, last_name, role) VALUES ` +
    `('${u.id}', '${u.email}', '${hash}', '${esc(u.first)}', '${esc(u.last)}', '${u.role}');`
  );
}

/* testovací účet dostane přístup k arbosis, ať je co zkoušet */
const testUser = users.find((u) => u.role === 'client');
lines.push(`INSERT INTO project_access (user_id, project_slug) VALUES ('${testUser.id}', 'arbosis');`);

console.log(lines.join('\n'));
console.error('\n--- HESLA (nikam neukládat, jen předat) ---');
for (const c of creds) console.error(`${c.email.padEnd(24)} ${c.role.padEnd(7)} ${c.password}`);
