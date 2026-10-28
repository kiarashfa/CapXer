import { defineConfig } from 'astro/config';
import svelte from '@astrojs/svelte';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
import { BASE_PATH, SITE_ORIGIN } from './src/config/site.ts';

export default defineConfig({
  site: SITE_ORIGIN,
  base: BASE_PATH,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [svelte(), mdx()],
  vite: { plugins: [tailwindcss()] },
});
