/* Přístup k bindingům Workeru.
 *
 * Astro 7 zrušilo Astro.locals.runtime.env - bindingy se čtou z modulu
 * "cloudflare:workers". Drží to jedno místo, ať se to při další změně
 * runtime nemusí přepisovat po celé aplikaci. */

import { env as workerEnv } from 'cloudflare:workers';
import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB?: D1Database;
  SESSION_SECRET?: string;
}

export function getEnv(): Env {
  return workerEnv as unknown as Env;
}

/* Databáze nemusí být připojená (první nasazení bez D1) - volající se pak
   zachová smysluplně místo pádu na 500. */
export function getDb(): D1Database | undefined {
  return getEnv().DB;
}
