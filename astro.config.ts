import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import tailwindcss from '@tailwindcss/vite';
import { BASE_PATH, SITE_ORIGIN } from './src/config/site.ts';
import { citations } from './src/content/cite/plugin.ts';
import { tableWrap } from './src/content/cite/table-wrap.ts';
import references from './src/references/references.json' with { type: 'json' };

// Cloud save ids (public by design, never secrets): from .env locally, from the
// GitHub repository variables in CI (.github/workflows/deploy.yml). The browser
// code reads them as PUBLIC_ copies; a missing id hides that provider.
const ENV_FILE = new URL('./.env', import.meta.url);
const LOCAL_ENV = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, 'utf8')) : {};
for (const name of ['GOOGLE_CLIENT_ID', 'DROPBOX_APP_KEY']) {
  const value = process.env[name] || LOCAL_ENV[name];
  if (value) process.env[`PUBLIC_${name}`] = value;
}

export default defineConfig({
  site: SITE_ORIGIN,
  base: BASE_PATH,
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Lessons (MDX) inherit this processor; the citation plugin only runs on src/content/lessons/.
  markdown: {
    processor: satteri({ mdastPlugins: [citations({ references: references.map((r) => r.id) }), tableWrap] }),
  },
  // Content Security Policy: added after the build by scripts/build-csp.ts (Astro's own
  // CSP option skips is:inline scripts and places the tag after them).
  integrations: [svelte(), mdx()],
  vite: { plugins: [tailwindcss()] },
});
