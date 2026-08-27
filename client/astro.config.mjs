// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// Aplikace visi na webkit.studio/client - Webflow Cloud mount path. Astro to
// musi vedet, jinak by odkazy i assety mirily na koren domeny, kde je Webflow.
export default defineConfig({
  site: 'https://webkit.studio',
  base: '/client',
  trailingSlash: 'never',
  output: 'server',

  /* Vestavena CSRF kontrola Astra porovnava hlavicku Origin s puvodem
     pozadavku. Za Webflow Cloud proxy jí to nesedi a odmita i legitimni
     prihlaseni ("Cross-site POST form submissions are forbidden").
     Vypina se tady a nahrazuje vlastni kontrolou v middleware, ktera
     porovnava Origin s hlavickou Host - tedy s tim, co prohlizec skutecne
     videl. Session cookie je navic SameSite=Lax, takze se pri pozadavku
     z ciziho webu vubec neposle. */
  security: { checkOrigin: false },
  adapter: cloudflare({
    platformProxy: { enabled: true }
  }),
  integrations: [react()],
  vite: {
    css: { transformer: 'postcss' }
  }
});
