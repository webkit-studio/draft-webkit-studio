/* Hesla a session.
 *
 * Na Workers není bcrypt, je tam WebCrypto. Hesla proto jedou přes
 * PBKDF2-SHA256. Formát uloženého hashe: pbkdf2$<iterace>$<sůl>$<hash>,
 * obojí base64. Iterace jsou v řetězci schválně - až je půjde zvednout,
 * staré hashe se tím nerozbijí a přepočítají se při dalším přihlášení.
 *
 * Session token je náhodných 32 bytů. V databázi leží jen jeho SHA-256,
 * takže ani únik databáze nikomu nedá platnou session.
 */

const ITERATIONS = 210_000;
const KEY_LEN = 32;
const SALT_LEN = 16;

const enc = new TextEncoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_LEN * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/* Porovnání v konstantním čase - délka i obsah. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = unb64(parts[2]);
    const expected = unb64(parts[3]);
    const actual = await pbkdf2(password, salt, iterations);
    return sameBytes(actual, expected);
  } catch {
    return false;
  }
}

/* ---------- session ---------- */

export function newSessionToken(): string {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return b64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function tokenId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return b64(new Uint8Array(digest));
}

export const SESSION_COOKIE = 'wks';
export const SESSION_DAYS = 30;

export function sessionCookie(token: string, maxAgeSeconds: number): string {
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/client',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`
  ];
  return parts.join('; ');
}

export function clearedCookie(): string {
  return `${SESSION_COOKIE}=; Path=/client; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/* Heslo pro klienta generuje admin. Bez matoucích znaků (0/O, 1/l/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generatePassword(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}
