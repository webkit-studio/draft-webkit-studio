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
  adapter: cloudflare({
    platformProxy: { enabled: true }
  }),
  integrations: [react()],
  vite: {
    css: { transformer: 'postcss' }
  }
});
