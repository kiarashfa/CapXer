import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import { satteri } from '@astrojs/markdown-satteri';
import tailwindcss from '@tailwindcss/vite';
import { BASE_PATH, SITE_ORIGIN } from './src/config/site.ts';
import { citations } from './src/content/cite/plugin.ts';
import { tableWrap } from './src/content/cite/table-wrap.ts';
import references from './src/references/references.json' with { type: 'json' };

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
